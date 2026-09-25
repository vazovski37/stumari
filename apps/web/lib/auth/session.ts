import { createHmac, timingSafeEqual } from "node:crypto";

/** Stateless session (data-model.md): an HMAC-signed cookie holding `{ wallet, iat, exp }`. */
export const SESSION_COOKIE = "stumari_session";
export const SESSION_TTL_SECS = 7 * 86_400;

export interface SessionPayload {
  wallet: string;
  iat: number;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

/** `base64url(json).base64url(hmac-sha256(json-part))`. */
export function encodeSession(wallet: string, secret: string, now: number): string {
  const payload: SessionPayload = { wallet, iat: now, exp: now + SESSION_TTL_SECS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64url(mac(body, secret))}`;
}

/** The payload of a valid, unexpired cookie value, or null. */
export function decodeSession(token: string | undefined, secret: string, now: number): SessionPayload | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof p.wallet !== "string" || !Number.isInteger(p.iat) || !Number.isInteger(p.exp)) return null;
    return now < p.exp! ? { wallet: p.wallet, iat: p.iat!, exp: p.exp! } : null;
  } catch {
    return null;
  }
}

/** Set-Cookie value for a new session, or (with `token = null`) one that clears it. */
export function sessionCookie(token: string | null, secure: boolean): string {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
  return token === null
    ? `${SESSION_COOKIE}=; ${attrs.join("; ")}; Max-Age=0`
    : `${SESSION_COOKIE}=${token}; ${attrs.join("; ")}; Max-Age=${SESSION_TTL_SECS}`;
}
