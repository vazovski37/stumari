import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { serverEnv } from "../env";
import { clientIp, ipHash } from "../request";

/** httpOnly cookie that owns a browser's quote hold (data-model.md `quotes.client_id`). */
export const CLIENT_COOKIE = "stumari_cid";
const CLIENT_ID = /^[0-9a-f]{32}$/;

export function requestIpHash(request: Request): string {
  const env = serverEnv();
  return ipHash(clientIp(request.headers, env.onVercel), env.authSecret);
}

/**
 * The hold owner: MCP agents are `mcp:{wallet|anon}` (they carry no cookie); browsers get a
 * 128-bit random id in `stumari_cid`, set on their first quote.
 */
export function holdOwner(
  request: NextRequest,
  buyer: { type: "guest" | "agent"; wallet: string | null },
): { clientId: string; setCookie: string | null } {
  if (buyer.type === "agent") return { clientId: `mcp:${buyer.wallet ?? "anon"}`, setCookie: null };
  const existing = request.cookies.get(CLIENT_COOKIE)?.value;
  if (existing && CLIENT_ID.test(existing)) return { clientId: existing, setCookie: null };
  const clientId = randomBytes(16).toString("hex");
  const secure = serverEnv().nodeEnv === "production" ? "; Secure" : "";
  return { clientId, setCookie: `${CLIENT_COOKIE}=${clientId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}` };
}

/** The caller's hold owner for read-only availability (never creates one). */
export function existingClientId(request: NextRequest): string {
  const existing = request.cookies.get(CLIENT_COOKIE)?.value;
  return existing && CLIENT_ID.test(existing) ? existing : "anonymous";
}
