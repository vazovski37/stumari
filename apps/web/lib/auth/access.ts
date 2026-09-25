import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ApiError } from "../api/errors";
import { getDb } from "../db";
import type { Db } from "../db/client";
import { hotels } from "../db/schema";
import { serverEnv } from "../env";
import type { HotelRow } from "../hotels";
import { decodeSession, SESSION_COOKIE } from "./session";

/**
 * Roles (api.md "Auth"): admin iff the wallet is in ADMIN_WALLETS *now* (never stored in the
 * cookie, so removing a wallet revokes admin at once); hotel iff it is the hotel's payout wallet.
 */
export interface Session {
  wallet: string;
  isAdmin: boolean;
}

export type Role = "user" | "admin" | { hotelId: string };

function sessionOf(token: string | undefined): Session | null {
  const env = serverEnv();
  const payload = decodeSession(token, env.authSecret, Math.floor(Date.now() / 1000));
  return payload ? { wallet: payload.wallet, isAdmin: env.adminWallets.includes(payload.wallet) } : null;
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export const canManageHotel = (session: Session, hotel: Pick<HotelRow, "payout_wallet">) =>
  session.isAdmin || (hotel.payout_wallet !== null && hotel.payout_wallet === session.wallet);

/**
 * Session check for a route handler. State-changing requests whose Origin is not the request's
 * own origin are refused (defence in depth on top of SameSite=Lax). A hotel role that does not
 * match answers 403 whether or not the hotel exists, so hotel ids cannot be probed.
 */
export async function requireSession(request: Request, role: "user" | "admin"): Promise<Session>;
export async function requireSession(request: Request, role: { hotelId: string }): Promise<Session & { hotel: HotelRow }>;
export async function requireSession(request: Request, role: Role): Promise<Session & { hotel?: HotelRow }> {
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin !== null && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "BAD_ORIGIN", "Request from another site");
  }
  const session = sessionOf(cookieValue(request.headers.get("cookie"), SESSION_COOKIE));
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Sign in with your wallet first");
  if (role === "user") return session;
  if (role === "admin") {
    if (!session.isAdmin) throw new ApiError(403, "FORBIDDEN", "Admins only");
    return session;
  }
  const hotel = await getDb().query.hotels.findFirst({ where: eq(hotels.id, role.hotelId) });
  if (!hotel || !canManageHotel(session, hotel)) {
    if (session.isAdmin) throw new ApiError(404, "NOT_FOUND", "Hotel not found");
    throw new ApiError(403, "FORBIDDEN", "This wallet does not manage this hotel");
  }
  return { ...session, hotel };
}

/** The session of the current page request (server components), or null. */
export async function pageSession(): Promise<Session | null> {
  return sessionOf((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Hotels whose payout wallet is `wallet` (the hotel role). */
export async function hotelsOf(db: Db, wallet: string): Promise<{ id: string; slug: string; name: string }[]> {
  return db
    .select({ id: hotels.id, slug: hotels.slug, name: hotels.name })
    .from(hotels)
    .where(eq(hotels.payout_wallet, wallet))
    .orderBy(asc(hotels.name));
}
