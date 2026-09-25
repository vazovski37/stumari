import { NextRequest } from "next/server";
import { encodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";

/** Route handlers called directly (no server): requests, params and a session cookie. */

export const SITE = "http://localhost:3000";
export const TEST_AUTH_SECRET = "ab".repeat(32);

export function request(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; origin?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${SITE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** The second argument of a dynamic route handler. */
export const params = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) }) as never;

export const sessionFor = (wallet: string) => `${SESSION_COOKIE}=${encodeSession(wallet, TEST_AUTH_SECRET, Math.floor(Date.now() / 1000))}`;

/** Makes `getDb()` return this database (it caches the handle on globalThis). */
export function useDb(db: Db): void {
  (globalThis as { stumariDb?: Db }).stumariDb = db;
}
