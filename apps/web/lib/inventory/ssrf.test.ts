import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { assertSafeUrl, fetchPublicText, guardedLookup, isPublicAddress, UnsafeUrlError, type Hop, type HopResponse } from "./ssrf";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "not-an-ip",
  ])("denies %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["1.1.1.1", "8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );
});

describe("assertSafeUrl", () => {
  it("accepts https URLs with public or named hosts", () => {
    expect(assertSafeUrl("https://admin.booking.com/hotel/ical/123.ics?t=abc").hostname).toBe("admin.booking.com");
    expect(assertSafeUrl("https://1.1.1.1/cal.ics").hostname).toBe("1.1.1.1");
  });

  it.each([
    "http://example.com/cal.ics",
    "ftp://example.com/cal.ics",
    "file:///etc/passwd",
    "https://user:pw@example.com/cal.ics",
    "https://127.0.0.1/cal.ics",
    "https://[::1]/cal.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://[::ffff:10.0.0.1]/x",
    "not a url",
  ])("rejects %s", (url) => expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError));

  it("accepts plain-http loopback only under the test-only allowLoopback policy", () => {
    const policy = { allowLoopback: true };
    expect(() => assertSafeUrl("http://127.0.0.1:4000/cal.ics")).toThrow(UnsafeUrlError);
    expect(assertSafeUrl("http://127.0.0.1:4000/cal.ics", policy).port).toBe("4000");
    expect(assertSafeUrl("http://localhost/cal.ics", policy).hostname).toBe("localhost");
    expect(assertSafeUrl("http://[::1]/cal.ics", policy).hostname).toBe("[::1]");
    for (const url of ["http://10.0.0.1/cal.ics", "http://example.com/cal.ics", "http://u:p@127.0.0.1/cal.ics", "ftp://127.0.0.1/x"]) {
      expect(() => assertSafeUrl(url, policy)).toThrow(UnsafeUrlError);
    }
  });
});

describe("fetchPublicText with allowLoopback (local E2E fixture feeds)", () => {
  it("fetches a plain-http loopback calendar, and refuses it without the policy", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => res.end("BEGIN:VCALENDAR"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      const url = `http://127.0.0.1:${port}/cal.ics`;
      expect(await fetchPublicText(url, { policy: { allowLoopback: true } })).toBe("BEGIN:VCALENDAR");
      await expect(fetchPublicText(url)).rejects.toThrow(UnsafeUrlError);
    } finally {
      server.close();
    }
  });

  it("still refuses redirects to private addresses under allowLoopback", async () => {
    const hop: Hop = async () => ({ status: 302, location: "https://10.0.0.1/x", body: Buffer.alloc(0) });
    await expect(fetchPublicText("https://a.example/cal", { hop, policy: { allowLoopback: true } })).rejects.toThrow(UnsafeUrlError);
  });
});

function fakeResolver(answers: Record<string, string[]>) {
  return (host: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => {
    const ips = answers[host];
    if (!ips) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
    cb(null, ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  };
}

const lookupOnce = (host: string, all: boolean, answers: Record<string, string[]>) =>
  new Promise<{ err: NodeJS.ErrnoException | null; result: unknown }>((resolve) =>
    guardedLookup(fakeResolver(answers))(host, { all }, (err, address, family) =>
      resolve({ err, result: all ? address : { address, family } }),
    ),
  );

describe("guardedLookup (checked inside the socket's own DNS resolution)", () => {
  it("passes public answers through, in both callback shapes", async () => {
    const answers = { "cal.example": ["93.184.216.34", "2606:4700:4700::1111"] };
    expect((await lookupOnce("cal.example", false, answers)).result).toEqual({ address: "93.184.216.34", family: 4 });
    expect((await lookupOnce("cal.example", true, answers)).result).toHaveLength(2);
  });

  it("fails when any resolved address is private (DNS rebinding to internal hosts)", async () => {
    const { err } = await lookupOnce("evil.example", false, { "evil.example": ["93.184.216.34", "10.0.0.5"] });
    expect(err).toBeInstanceOf(UnsafeUrlError);
    expect((await lookupOnce("meta.example", true, { "meta.example": ["169.254.169.254"] })).err).toBeInstanceOf(UnsafeUrlError);
  });

  it("stops a real https request to a name that resolves to loopback before connecting", async () => {
    await expect(fetchPublicText("https://localhost:1/cal.ics")).rejects.toThrow(/non-public address/);
  });
});

describe("fetchPublicText redirects and limits", () => {
  const ok = (body: string): HopResponse => ({ status: 200, location: null, body: Buffer.from(body) });
  const redirect = (location: string): HopResponse => ({ status: 302, location, body: Buffer.alloc(0) });

  function scripted(responses: Record<string, HopResponse>): { hop: Hop; visited: string[] } {
    const visited: string[] = [];
    const hop: Hop = async (url) => {
      visited.push(url.toString());
      const res = responses[url.toString()];
      if (!res) throw new Error(`unexpected ${url}`);
      return res;
    };
    return { hop, visited };
  }

  it("follows up to 3 redirects, resolving relative locations", async () => {
    const { hop, visited } = scripted({
      "https://a.example/cal": redirect("https://b.example/cal"),
      "https://b.example/cal": redirect("/next"),
      "https://b.example/next": redirect("https://c.example/final.ics"),
      "https://c.example/final.ics": ok("BEGIN:VCALENDAR"),
    });
    expect(await fetchPublicText("https://a.example/cal", { hop })).toBe("BEGIN:VCALENDAR");
    expect(visited).toHaveLength(4);
  });

  it("refuses a fourth redirect", async () => {
    const { hop } = scripted({
      "https://a.example/1": redirect("https://a.example/2"),
      "https://a.example/2": redirect("https://a.example/3"),
      "https://a.example/3": redirect("https://a.example/4"),
      "https://a.example/4": redirect("https://a.example/5"),
    });
    await expect(fetchPublicText("https://a.example/1", { hop })).rejects.toThrow(/more than 3 redirects/);
  });

  it("re-checks every hop: no downgrade to http, no redirect to a private address", async () => {
    const toHttp = scripted({ "https://a.example/cal": redirect("http://a.example/cal") });
    await expect(fetchPublicText("https://a.example/cal", { hop: toHttp.hop })).rejects.toThrow(UnsafeUrlError);
    const toMetadata = scripted({ "https://a.example/cal": redirect("https://169.254.169.254/latest/meta-data") });
    await expect(fetchPublicText("https://a.example/cal", { hop: toMetadata.hop })).rejects.toThrow(UnsafeUrlError);
    expect(toMetadata.visited).toEqual(["https://a.example/cal"]);
  });

  it("reports HTTP errors", async () => {
    const { hop } = scripted({ "https://a.example/cal": { status: 404, location: null, body: Buffer.alloc(0) } });
    await expect(fetchPublicText("https://a.example/cal", { hop })).rejects.toThrow("HTTP 404");
  });
});
