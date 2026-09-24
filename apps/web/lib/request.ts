import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/** Client IP as reported by the platform proxy (Vercel sets x-forwarded-for), or "unknown". */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** sha256(ip + AUTH_SECRET) as hex — the only form in which we store an IP. */
export function ipHash(ip: string, authSecret: string): string {
  return bytesToHex(sha256(utf8ToBytes(ip + authSecret)));
}

type ErrorBody = { error: { code: string; message: string; issues?: { path: string; message: string }[] } };

/** JSON error in the shape every API route uses (api.md). */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: { issues?: ErrorBody["error"]["issues"]; headers?: HeadersInit },
): Response {
  const body: ErrorBody = { error: { code, message, ...(extra?.issues ? { issues: extra.issues } : {}) } };
  return Response.json(body, { status, headers: extra?.headers });
}
