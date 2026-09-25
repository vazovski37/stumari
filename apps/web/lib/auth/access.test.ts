import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApplications from "@/app/api/admin/applications/route";
import * as nonceRoute from "@/app/api/auth/nonce/route";
import * as verifyRoute from "@/app/api/auth/verify/route";
import * as bookingsRoute from "@/app/api/dashboard/[hotelId]/bookings/route";
import * as policyRoute from "@/app/api/dashboard/[hotelId]/policy/route";
import * as blocksRoute from "@/app/api/dashboard/[hotelId]/units/[unitId]/blocks/route";
import * as unitsRoute from "@/app/api/dashboard/[hotelId]/units/route";
import * as meRoute from "@/app/api/me/route";
import { insertBooking, seedHotel, tempDb, type Seeded } from "@/test/db";
import { params, request, sessionFor, SITE, TEST_AUTH_SECRET, useDb } from "@/test/http";
import type { Db } from "../db/client";
import { bookings, hotels } from "../db/schema";

/** Role isolation over the real route handlers: hotel A never reads or changes hotel B. */

const wallet = () => base58.encode(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
const WALLET_A = wallet();
const WALLET_B = wallet();
const ADMIN = wallet();

let db: Db;
let close: () => void;
let a: Seeded;
let b: Seeded;

beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("ADMIN_WALLETS", ADMIN);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});
afterAll(() => vi.unstubAllEnvs());

beforeEach(async () => {
  ({ db, close } = await tempDb());
  useDb(db);
  a = await seedHotel(db, "hotel-a");
  b = await seedHotel(db, "hotel-b");
  await db.update(hotels).set({ payout_wallet: WALLET_A }).where(eq(hotels.id, a.hotelId));
  await db.update(hotels).set({ payout_wallet: WALLET_B }).where(eq(hotels.id, b.hotelId));
  const id = await insertBooking(db, b, { roomId: b.units.D1, roomTypeId: b.double, checkin: "2026-10-20", checkout: "2026-10-22", status: "confirmed" });
  await db.update(bookings).set({ guest_name: "Nino B", guest_email: "nino@example.com" }).where(eq(bookings.id, id));
});
afterEach(() => close());

const getBookings = (hotelId: string, cookie?: string) =>
  bookingsRoute.GET(request("GET", `/api/dashboard/${hotelId}/bookings`, { cookie }), params({ hotelId }));

describe("dashboard role isolation", () => {
  it("serves a hotel's bookings, with guest contact, to its payout wallet and to admins only", async () => {
    const own = await getBookings(b.hotelId, sessionFor(WALLET_B));
    expect(own.status).toBe(200);
    const list = (await own.json()) as { guest: { email: string } }[];
    expect(list.map((x) => x.guest.email)).toEqual(["nino@example.com"]);

    const other = await getBookings(b.hotelId, sessionFor(WALLET_A));
    expect(other.status).toBe(403);
    expect(await other.text()).not.toContain("nino@example.com");

    expect((await getBookings(b.hotelId, sessionFor(ADMIN))).status).toBe(200);
    expect((await getBookings(b.hotelId)).status).toBe(401);
    expect((await getBookings(b.hotelId, sessionFor(wallet()))).status).toBe(403);
  });

  it("does not reveal whether a hotel exists to non-admins", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await getBookings(missing, sessionFor(WALLET_A))).status).toBe(403);
    expect((await getBookings(missing, sessionFor(ADMIN))).status).toBe(404);
  });

  it("refuses units, policy and blocks of another hotel, including B's unit through A's path", async () => {
    const units = await unitsRoute.GET(request("GET", `/api/dashboard/${b.hotelId}/units`, { cookie: sessionFor(WALLET_A) }), params({ hotelId: b.hotelId }));
    expect(units.status).toBe(403);

    const policy = await policyRoute.PATCH(
      request("PATCH", `/api/dashboard/${b.hotelId}/policy`, {
        cookie: sessionFor(WALLET_A),
        body: { enabled_templates: ["nonrefundable"], reference_template: "nonrefundable", resale_bps: [0, 0, 0, 0, 0, 0], min_mult_bps: 5000, max_mult_bps: 10000 },
      }),
      params({ hotelId: b.hotelId }),
    );
    expect(policy.status).toBe(403);

    const block = { start_date: "2026-11-01", end_date: "2026-11-03" };
    const viaOwnHotel = await blocksRoute.POST(
      request("POST", `/api/dashboard/${a.hotelId}/units/${b.units.D1}/blocks`, { cookie: sessionFor(WALLET_A), body: block }),
      params({ hotelId: a.hotelId, unitId: b.units.D1 }),
    );
    expect(viaOwnHotel.status).toBe(404);
    const own = await blocksRoute.POST(
      request("POST", `/api/dashboard/${a.hotelId}/units/${a.units.D1}/blocks`, { cookie: sessionFor(WALLET_A), body: block }),
      params({ hotelId: a.hotelId, unitId: a.units.D1 }),
    );
    expect(own.status).toBe(201);
  });

  it("keeps hotel wallets (and demo wallets not in ADMIN_WALLETS) out of admin routes", async () => {
    for (const w of [WALLET_A, wallet()]) {
      const res = await adminApplications.GET(request("GET", "/api/admin/applications", { cookie: sessionFor(w) }));
      expect(res.status).toBe(403);
    }
    expect((await adminApplications.GET(request("GET", "/api/admin/applications", { cookie: sessionFor(ADMIN) }))).status).toBe(200);
  });

  it("refuses state changes from another origin", async () => {
    const res = await blocksRoute.POST(
      request("POST", `/api/dashboard/${a.hotelId}/units/${a.units.D1}/blocks`, {
        cookie: sessionFor(WALLET_A),
        origin: "https://evil.example",
        body: { start_date: "2026-11-01", end_date: "2026-11-03" },
      }),
      params({ hotelId: a.hotelId, unitId: a.units.D1 }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_ORIGIN");
  });
});

describe("sign-in over HTTP", () => {
  it("nonce → wallet signature → session cookie → /api/me", async () => {
    const secret = ed25519.utils.randomPrivateKey();
    const me = base58.encode(ed25519.getPublicKey(secret));
    await db.update(hotels).set({ payout_wallet: me }).where(eq(hotels.id, a.hotelId));

    const nonceRes = await nonceRoute.GET(request("GET", `/api/auth/nonce?wallet=${me}`));
    expect(nonceRes.status).toBe(200);
    const { message } = (await nonceRes.json()) as { message: string };
    expect(message.startsWith("localhost:3000 wants you to sign in to Stumari\n")).toBe(true);

    const signature = base58.encode(ed25519.sign(new TextEncoder().encode(message), secret));
    const verify = await verifyRoute.POST(request("POST", "/api/auth/verify", { body: { wallet: me, message, signature } }));
    expect(verify.status).toBe(200);
    const setCookie = verify.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^stumari_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
    expect(await verify.json()).toEqual({ wallet: me, is_admin: false });

    const replay = await verifyRoute.POST(request("POST", "/api/auth/verify", { body: { wallet: me, message, signature } }));
    expect(replay.status).toBe(401);

    const meRes = await meRoute.GET(request("GET", "/api/me", { cookie: setCookie.split(";")[0] }));
    expect(await meRes.json()).toEqual({ wallet: me, is_admin: false, hotels: [{ id: a.hotelId, slug: "hotel-a", name: "Test Guesthouse" }] });
    expect((await meRoute.GET(request("GET", "/api/me"))).status).toBe(401);
  });
});
