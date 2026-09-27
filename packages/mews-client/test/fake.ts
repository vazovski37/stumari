import type { FetchLike } from "../src";

export interface Recorded {
  url: string;
  operation: string;
  body: Record<string, unknown>;
}

export type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };
export type Handler = (body: Record<string, unknown>, call: number) => Reply | Promise<Reply>;

/** A fake Connector API: routes by operation path, records every request body. */
export function fakeMews(routes: Record<string, Handler>): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const counts = new Map<string, number>();
  const fetch: FetchLike = async (url, init) => {
    const operation = url.replace(/^.*\/api\/connector\/v1\//, "");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, operation, body });
    const n = counts.get(operation) ?? 0;
    counts.set(operation, n + 1);
    const handler = routes[operation];
    const reply: Reply = handler ? await handler(body, n) : { status: 404, json: { Message: "Not found" } };
    const text = reply.text ?? JSON.stringify(reply.json ?? {});
    return new Response(text, {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json", ...reply.headers },
    });
  };
  return { fetch, calls };
}

export const CLIENT_TOKEN = "CLIENTTOKEN-1234567890ABCDEF";
export const ACCESS_TOKEN = "ACCESSTOKEN-FEDCBA0987654321";

export function baseConfig(fetch: FetchLike, sleeps: number[] = []) {
  return {
    platformUrl: "https://api.mews-demo.com",
    clientToken: CLIENT_TOKEN,
    accessToken: ACCESS_TOKEN,
    client: "Stumari 0.1.0",
    fetch,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  };
}
