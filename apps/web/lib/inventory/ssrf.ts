import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOptions } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Fetching hotel-supplied iCal URLs without SSRF (inventory-ical.md, security.md): `https:` only,
 * every resolved address must be public (checked in the socket's own DNS lookup, so a rebinding
 * resolver cannot swap it after the check), at most 3 redirects each re-checked, 10 s, 2 MB.
 */
export const ICAL_LIMITS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 } as const;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const denied = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  denied.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback, IPv4-compatible
  ["64:ff9b::", 96], // NAT64 (embeds an IPv4 address)
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  denied.addSubnet(net, prefix, "ipv6");
}

/** True for a globally routable unicast address. IPv4-mapped IPv6 is judged by its IPv4 part. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, "ipv4");
  if (family === 6) return !denied.check(address, "ipv6");
  return false;
}

type Resolve = (hostname: string, options: LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

/** A `net` lookup that fails unless every address the name resolves to is public. */
export function guardedLookup(resolve: Resolve = dnsLookup): LookupFunction {
  return (hostname: string, options: LookupOptions, callback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const bad = addresses.find((a) => !isPublicAddress(a.address));
      if (addresses.length === 0 || bad) {
        const error: NodeJS.ErrnoException = new UnsafeUrlError(`${hostname} resolves to a non-public address`);
        error.code = "EUNSAFEADDRESS";
        return callback(error, "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    });
  };
}

/**
 * Test-only relaxation for the local E2E, which serves a fixture calendar on 127.0.0.1: `http:` or
 * `https:` URLs whose host is loopback. Set from `ICAL_ALLOW_LOOPBACK`, which the env schema
 * refuses on mainnet and on Vercel.
 */
export interface UrlPolicy {
  allowLoopback?: boolean;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const isAllowedLoopback = (url: URL, policy: UrlPolicy) =>
  policy.allowLoopback === true &&
  (url.protocol === "http:" || url.protocol === "https:") &&
  LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ""));

/** Rejects anything but a credential-free `https:` URL whose literal IP host (if any) is public. */
export function assertSafeUrl(raw: string | URL, policy: UrlPolicy = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  if (isAllowedLoopback(url, policy)) return url;
  if (url.protocol !== "https:") throw new UnsafeUrlError("only https: URLs are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new UnsafeUrlError("the URL points to a non-public address");
  return url;
}

export interface HopResponse {
  status: number;
  location: string | null;
  body: Buffer;
}

/** One HTTP exchange without following redirects. */
export type Hop = (url: URL, signal: AbortSignal, maxBytes: number) => Promise<HopResponse>;

/** The real hop: node:https with the guarded lookup and a streaming size cap. */
export const httpsHop: Hop = (url, signal, maxBytes) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        lookup: guardedLookup(),
        signal,
        headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "user-agent": "Stumari-iCal/1.0" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new UnsafeUrlError(`calendar is larger than ${maxBytes} bytes`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new UnsafeUrlError(`calendar is larger than ${maxBytes} bytes`));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });

/** The hop for loopback URLs under `UrlPolicy.allowLoopback` only: node:http(s) without the address guard. */
const loopbackHop: Hop = (url, signal) =>
  new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(url, { method: "GET", signal }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          location: typeof res.headers.location === "string" ? res.headers.location : null,
          body: Buffer.concat(chunks),
        }),
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

/** GETs a hotel-supplied URL under the SSRF rules and returns the body as text. */
export async function fetchPublicText(
  raw: string,
  { hop = httpsHop, limits = ICAL_LIMITS, policy = {} }: { hop?: Hop; limits?: typeof ICAL_LIMITS; policy?: UrlPolicy } = {},
): Promise<string> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  let url = assertSafeUrl(raw, policy);
  for (let redirects = 0; ; redirects++) {
    const res = await (isAllowedLoopback(url, policy) ? loopbackHop : hop)(url, signal, limits.maxBytes);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error(`HTTP ${res.status} without a Location header`);
      if (redirects >= limits.maxRedirects) throw new UnsafeUrlError(`more than ${limits.maxRedirects} redirects`);
      url = assertSafeUrl(new URL(res.location, url), policy);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return res.body.toString("utf8");
  }
}
