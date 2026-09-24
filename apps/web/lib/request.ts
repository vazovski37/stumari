import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Client IP for rate limiting. Only Vercel's proxy guarantees that the first X-Forwarded-For entry
 * is the client; elsewhere that header is client-supplied, so `x-real-ip` (set by a reverse proxy)
 * is used, or "unknown" when there is none (local development).
 */
export function clientIp(headers: Headers, onVercel: boolean): string {
  const forwarded = onVercel ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** sha256(ip + AUTH_SECRET) as hex — the only form in which we store an IP. */
export function ipHash(ip: string, authSecret: string): string {
  return bytesToHex(sha256(utf8ToBytes(ip + authSecret)));
}

type ErrorBody = { error: { code: string; message: string; issues?: { path: string; message: string }[] } };

/** JSON error in the shape every API route uses (api.md); `body` adds top-level fields (e.g. `booking`). */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: { issues?: ErrorBody["error"]["issues"]; headers?: HeadersInit; body?: Record<string, unknown> },
): Response {
  const error: ErrorBody = { error: { code, message, ...(extra?.issues ? { issues: extra.issues } : {}) } };
  return Response.json({ ...extra?.body, ...error }, { status, headers: extra?.headers });
}
