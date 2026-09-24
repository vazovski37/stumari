import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, type Db } from "@/lib/db/client";
import { bookings, DEFAULT_HOTEL_POLICY, hotels, quotes, rooms, roomTypes } from "@/lib/db/schema";

/** A migrated file database in a temp dir (libsql transactions on ":memory:" open empty connections). */
export async function tempDb(): Promise<{ db: Db; path: string; close: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "stumari-web-"));
  const path = join(dir, "test.db");
  const db = createDb(`file:${path}`);
  await migrate(db, { migrationsFolder: "drizzle" });
  return {
    db,
    path,
    close: () => {
      db.$client.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may keep the SQLite file locked until the native handle is collected.
      }
    },
  };
}

export const T0 = 1_790_000_000; // 2026-09-22T…Z, before every stay used in tests

export interface Seeded {
  hotelId: string;
  double: string;
  twin: string;
  units: { D1: string; D2: string; T1: string };
}

/** The demo hotel shape: Double room (D1, D2, weekend rate) and Twin room (T1). */
export async function seedHotel(db: Db, slug = "test-hotel"): Promise<Seeded> {
  const hotelId = randomUUID();
  const double = randomUUID();
  const twin = randomUUID();
  const units = { D1: randomUUID(), D2: randomUUID(), T1: randomUUID() };
  await db.insert(hotels).values({
    id: hotelId,
    slug,
    name: "Test Guesthouse",
    city: "Tbilisi",
    address: "Sololaki",
    phone: "+995 555 000 000",
    status: "active",
    policy: DEFAULT_HOTEL_POLICY,
    onchain_hotel: "11111111111111111111111111111111",
    payout_wallet: "11111111111111111111111111111111",
    created_at: T0,
    updated_at: T0,
  });
  await db.insert(roomTypes).values([
    { id: double, hotel_id: hotelId, name: "Double room", base_rate_minor: "65000000", weekend_rate_minor: "75000000", max_adults: 2, sort: 0, created_at: T0 },
    { id: twin, hotel_id: hotelId, name: "Twin room", base_rate_minor: "60000000", max_adults: 2, sort: 1, created_at: T0 },
  ]);
  await db.insert(rooms).values([
    { id: units.D2, room_type_id: double, label: "D2", export_token: randomBytes(32).toString("hex") },
    { id: units.D1, room_type_id: double, label: "D1", export_token: randomBytes(32).toString("hex") },
    { id: units.T1, room_type_id: twin, label: "T1", export_token: randomBytes(32).toString("hex") },
  ]);
  return { hotelId, double, twin, units };
}

/** A quote row holding `roomId` (body/signature are placeholders: availability ignores them). */
export async function insertQuote(
  db: Db,
  s: Seeded,
  opts: { roomId: string; roomTypeId: string; checkin: string; checkout: string; clientId: string; expiresAt: number; status?: "active" | "used" | "expired" },
): Promise<string> {
  const id = randomUUID();
  await db.insert(quotes).values({
    id,
    hotel_id: s.hotelId,
    room_type_id: opts.roomTypeId,
    room_id: opts.roomId,
    checkin_date: opts.checkin,
    checkout_date: opts.checkout,
    body: {},
    signature: "sig",
    hash: "hash",
    booking_id: randomBytes(16).toString("hex"),
    client_id: opts.clientId,
    status: opts.status ?? "active",
    expires_at: opts.expiresAt,
    created_at: opts.expiresAt - 600,
  });
  return id;
}

/** A booking on `roomId` (with its quote) in the given status. */
export async function insertBooking(
  db: Db,
  s: Seeded,
  opts: {
    roomId: string;
    roomTypeId: string;
    checkin: string;
    checkout: string;
    status: (typeof bookings.$inferSelect)["status"];
    quoteExpiresAt?: number;
    createdAt?: number;
    guestWallet?: string;
    id?: string;
  },
): Promise<string> {
  const quoteId = await insertQuote(db, s, {
    roomId: opts.roomId,
    roomTypeId: opts.roomTypeId,
    checkin: opts.checkin,
    checkout: opts.checkout,
    clientId: `booking-${randomUUID()}`,
    expiresAt: opts.quoteExpiresAt ?? T0 + 600,
    status: "used",
  });
  const id = opts.id ?? randomBytes(16).toString("hex");
  await db.insert(bookings).values({
    id,
    quote_id: quoteId,
    option_index: 0,
    option_id: "standard",
    hotel_id: s.hotelId,
    room_type_id: opts.roomTypeId,
    room_id: opts.roomId,
    guest_wallet: opts.guestWallet ?? "GuestWa11et1111111111111111111111111111111",
    checkin_date: opts.checkin,
    checkout_date: opts.checkout,
    checkin_ts: T0 + 86_400 * 30,
    checkout_ts: T0 + 86_400 * 32,
    amount_minor: "130000000",
    tiers: [{ secs_before: 0, refund_bps: 0 }],
    status: opts.status,
    created_at: opts.createdAt ?? T0,
    updated_at: opts.createdAt ?? T0,
  });
  return id;
}
