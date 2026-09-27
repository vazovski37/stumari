import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MewsError, MewsTransport, configFromEnv, isProductionUrl, parseRetryAfter } from "../src";
import { ACCESS_TOKEN, CLIENT_TOKEN, baseConfig, fakeMews } from "./fake";

const Ok = z.object({ Ok: z.boolean() });

async function caught(p: Promise<unknown>): Promise<MewsError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof MewsError) return e;
    throw e;
  }
  throw new Error("expected a MewsError");
}

describe("MewsTransport", () => {
  it("posts to /api/connector/v1/<operation> with tokens and Client in the body", async () => {
    const { fetch, calls } = fakeMews({ "configuration/get": () => ({ json: { Ok: true } }) });
    const t = new MewsTransport(baseConfig(fetch));
    await expect(t.call("configuration/get", { X: 1 }, Ok)).resolves.toEqual({ Ok: true });
    expect(calls[0]!.url).toBe("https://api.mews-demo.com/api/connector/v1/configuration/get");
    expect(calls[0]!.body).toEqual({ ClientToken: CLIENT_TOKEN, AccessToken: ACCESS_TOKEN, Client: "Stumari 0.1.0", X: 1 });
  });

  it("retries 429 after Retry-After seconds", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = fakeMews({
      "rates/getAll": (_b, n) =>
        n < 2 ? { status: 429, headers: { "Retry-After": "3" }, json: { Message: "Too many" } } : { json: { Ok: true } },
    });
    const t = new MewsTransport(baseConfig(fetch, sleeps));
    await expect(t.call("rates/getAll", {}, Ok)).resolves.toEqual({ Ok: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([3000, 3000]);
  });

  it("falls back to exponential backoff and retries 429 even for writes", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = fakeMews({
      "reservations/add": (_b, n) => (n < 3 ? { status: 429 } : { json: { Ok: true } }),
    });
    const t = new MewsTransport(baseConfig(fetch, sleeps));
    await t.call("reservations/add", {}, Ok);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]); // random() = 0.5 → no jitter
  });

  it("caps Retry-After and gives up with rate_limited after maxRetries", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = fakeMews({ "rates/getAll": () => ({ status: 429, headers: { "Retry-After": "600" } }) });
    const t = new MewsTransport({ ...baseConfig(fetch, sleeps), maxRetries: 2 });
    const err = await caught(t.call("rates/getAll", {}, Ok));
    expect(err.kind).toBe("rate_limited");
    expect(err.status).toBe(429);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([60_000, 60_000]);
  });

  it("retries 5xx for reads but never for writes", async () => {
    const read = fakeMews({ "services/getAll": (_b, n) => (n === 0 ? { status: 503 } : { json: { Ok: true } }) });
    await new MewsTransport(baseConfig(read.fetch)).call("services/getAll", {}, Ok, { idempotent: true });
    expect(read.calls).toHaveLength(2);

    const write = fakeMews({ "reservations/add": () => ({ status: 500, json: { Message: "boom", RequestId: "req-1" } }) });
    const err = await caught(new MewsTransport(baseConfig(write.fetch)).call("reservations/add", {}, Ok));
    expect(write.calls).toHaveLength(1);
    expect(err.kind).toBe("http");
    expect(err.operation).toBe("reservations/add");
    expect(err.requestId).toBe("req-1");
    expect(err.message).toBe("Mews reservations/add: HTTP 500: boom");
  });

  it("names the operation and never leaks tokens in errors", async () => {
    const { fetch } = fakeMews({
      "customers/add": () => ({ status: 401, json: { Message: `Invalid AccessToken ${ACCESS_TOKEN} for ${CLIENT_TOKEN}` } }),
    });
    const err = await caught(new MewsTransport(baseConfig(fetch)).call("customers/add", {}, Ok));
    expect(err.message).toContain("Mews customers/add: HTTP 401");
    expect(err.message).not.toContain(ACCESS_TOKEN);
    expect(err.message).not.toContain(CLIENT_TOKEN);
    expect(JSON.stringify(err)).not.toContain(ACCESS_TOKEN);
  });

  it("times out a hanging request", async () => {
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const t = new MewsTransport({ ...baseConfig(hanging), timeoutMs: 20 });
    const err = await caught(t.call("reservations/cancel", {}, Ok));
    expect(err.kind).toBe("timeout");
    expect(err.message).toBe("Mews reservations/cancel: no response within 20 ms");
  });

  it("a caller's signal: aborted before sending, timeout while in flight, and it cuts a Retry-After wait", async () => {
    const { fetch, calls } = fakeMews({ "configuration/get": () => ({ json: { Ok: true } }) });
    const before = await caught(new MewsTransport(baseConfig(fetch)).call("configuration/get", {}, Ok, { signal: AbortSignal.abort() }));
    expect(before.kind).toBe("aborted");
    expect(calls).toHaveLength(0);

    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const inFlight = await caught(
      new MewsTransport({ ...baseConfig(hanging), timeoutMs: 60_000 }).call("reservations/add", {}, Ok, { signal: AbortSignal.timeout(20) }),
    );
    expect(inFlight.kind).toBe("timeout"); // a write may have been applied
    expect(inFlight.message).toContain("deadline while in flight");

    const limited = fakeMews({ "reservations/add": () => ({ status: 429, headers: { "Retry-After": "60" } }) });
    const t = new MewsTransport({ ...baseConfig(limited.fetch), sleep: (ms) => new Promise((done) => setTimeout(done, ms)) });
    const started = Date.now();
    const cut = await caught(t.call("reservations/add", {}, Ok, { signal: AbortSignal.timeout(30) }));
    expect(cut.kind).toBe("aborted"); // the 429 was rejected, nothing applied
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(limited.calls).toHaveLength(1);
  });

  it("per-call maxRetries and timeoutMs override the client's", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = fakeMews({ "rates/getAll": () => ({ status: 429 }) });
    const err = await caught(new MewsTransport(baseConfig(fetch, sleeps)).call("rates/getAll", {}, Ok, { idempotent: true, maxRetries: 0 }));
    expect(err.kind).toBe("rate_limited");
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);

    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const slow = await caught(new MewsTransport(baseConfig(hanging)).call("configuration/get", {}, Ok, { timeoutMs: 15, maxRetries: 0, idempotent: true }));
    expect(slow.message).toBe("Mews configuration/get: no response within 15 ms");
  });

  it("rejects responses that do not match the schema", async () => {
    const { fetch } = fakeMews({ "configuration/get": () => ({ json: { Ok: "yes" } }) });
    const err = await caught(new MewsTransport(baseConfig(fetch)).call("configuration/get", {}, Ok));
    expect(err.kind).toBe("invalid_response");
    expect(err.message).toMatch(/Ok:/);
  });

  it("follows cursor pagination", async () => {
    const Page = z.object({ Items: z.array(z.number()), Cursor: z.string().nullish() });
    const { fetch, calls } = fakeMews({
      "things/getAll": (_b, n) =>
        n === 0
          ? { json: { Items: Array.from({ length: 1000 }, (_, i) => i), Cursor: "c1" } }
          : { json: { Items: [1000, 1001], Cursor: "c2" } },
    });
    const items = await new MewsTransport(baseConfig(fetch)).getAll("things/getAll", { A: 1 }, Page, (p) => p.Items);
    expect(items).toHaveLength(1002);
    expect(calls[0]!.body.Limitation).toEqual({ Count: 1000 });
    expect(calls[1]!.body.Limitation).toEqual({ Count: 1000, Cursor: "c1" });
  });
});

describe("config", () => {
  const tokens = { MEWS_CLIENT_TOKEN: "ct-abcdef", MEWS_ACCESS_TOKEN: "at-abcdef" };

  it("defaults to the demo environment and client name", () => {
    expect(configFromEnv(tokens)).toMatchObject({ platformUrl: "https://api.mews-demo.com", client: "Stumari 0.1.0" });
  });

  it("refuses production unless MEWS_ALLOW_PRODUCTION=1", () => {
    const env = { ...tokens, MEWS_PLATFORM_URL: "https://api.mews.com/" };
    expect(() => configFromEnv(env)).toThrow(/MEWS_ALLOW_PRODUCTION=1/);
    expect(configFromEnv({ ...env, MEWS_ALLOW_PRODUCTION: "1" }).platformUrl).toBe("https://api.mews.com");
    // Same values as the web app (apps/web/lib/env-schema.ts): 1 or true.
    expect(configFromEnv({ ...env, MEWS_ALLOW_PRODUCTION: " TRUE " }).platformUrl).toBe("https://api.mews.com");
    expect(() => configFromEnv({ ...env, MEWS_ALLOW_PRODUCTION: "yes" })).toThrow(/MEWS_ALLOW_PRODUCTION/);
    expect(() => configFromEnv({ ...tokens, MEWS_PLATFORM_URL: "https://evil.example" })).toThrow(/refusing/);
    expect(() => configFromEnv({ ...tokens, MEWS_PLATFORM_URL: "http://api.mews-demo.com" })).toThrow(/https/);
    expect(isProductionUrl("https://api.mews-demo.com")).toBe(false);
    expect(isProductionUrl("https://api.mews.com")).toBe(true);
  });

  it("requires both tokens", () => {
    expect(() => configFromEnv({ MEWS_CLIENT_TOKEN: "x" })).toThrow(/MEWS_ACCESS_TOKEN/);
  });

  it("parses Retry-After", () => {
    expect(parseRetryAfter("5", 0)).toBe(5000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
    expect(parseRetryAfter("soon", 0)).toBeUndefined();
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
  });
});
