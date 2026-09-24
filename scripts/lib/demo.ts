/**
 * Demo data (configuration.md "Demo data"): hotel `stumari-demo` with its room types and units.
 * Seeding only inserts what is missing, so edits made in the admin console survive a re-run.
 */
import { randomBytes } from "node:crypto";
import { toMinor, uuidV4 } from "@stumari/core";
import { schema, type Db } from "./db";

export const DEMO_SLUG = "stumari-demo";

const DEMO_HOTEL = {
  slug: DEMO_SLUG,
  name: "Stumari Demo Guesthouse",
  city: "Tbilisi",
  country: "Georgia",
  address: "Sololaki, Tbilisi",
  timezone: "Asia/Tbilisi",
  checkin_time: "14:00",
  checkout_time: "12:00",
  hotel_type: "City Hotel",
  status: "active",
  policy: schema.DEFAULT_HOTEL_POLICY,
} as const;

const DEMO_ROOM_TYPES = [
  {
    name: "Double room",
    description: "Double bed, private bathroom, breakfast included.",
    max_adults: 2,
    max_children: 0,
    base: "65.00",
    weekend: "75.00",
    units: ["D1", "D2"],
  },
  {
    name: "Twin room",
    description: "Two single beds, private bathroom, breakfast included.",
    max_adults: 2,
    max_children: 0,
    base: "60.00",
    weekend: null,
    units: ["T1"],
  },
  {
    name: "Family suite",
    description: "Double bed and two singles, sitting area, breakfast included.",
    max_adults: 2,
    max_children: 2,
    base: "110.00",
    weekend: null,
    units: ["F1"],
  },
] as const;

export type DemoHotel = typeof schema.hotels.$inferSelect;

export interface SeedResult {
  hotel: DemoHotel;
  /** What was inserted or updated (empty on a no-op run). */
  changes: string[];
}

export async function seedDemoHotel(db: Db, payoutWallet: string): Promise<SeedResult> {
  const now = Math.floor(Date.now() / 1000);
  const changes: string[] = [];

  // Operators come from the query callbacks and updates are upserts on the primary key: drizzle-orm
  // itself only resolves from apps/web, so this module never imports it.
  let hotel = await db.query.hotels.findFirst({ where: (h, { eq }) => eq(h.slug, DEMO_SLUG) });
  if (!hotel) {
    [hotel] = await db
      .insert(schema.hotels)
      .values({ id: uuidV4(), ...DEMO_HOTEL, payout_wallet: payoutWallet, created_at: now, updated_at: now })
      .returning();
    changes.push(`hotel ${DEMO_SLUG}`);
  } else if (hotel.payout_wallet !== payoutWallet) {
    [hotel] = await db
      .insert(schema.hotels)
      .values(hotel)
      .onConflictDoUpdate({ target: schema.hotels.id, set: { payout_wallet: payoutWallet, updated_at: now } })
      .returning();
    changes.push(`payout wallet -> ${payoutWallet}`);
  }
  if (!hotel) throw new Error("demo hotel insert returned no row");
  const hotelId = hotel.id;

  for (const [sort, rt] of DEMO_ROOM_TYPES.entries()) {
    let roomType = await db.query.roomTypes.findFirst({
      where: (t, { and, eq }) => and(eq(t.hotel_id, hotelId), eq(t.name, rt.name)),
    });
    if (!roomType) {
      [roomType] = await db
        .insert(schema.roomTypes)
        .values({
          id: uuidV4(),
          hotel_id: hotelId,
          name: rt.name,
          description: rt.description,
          max_adults: rt.max_adults,
          max_children: rt.max_children,
          base_rate_minor: toMinor(rt.base).toString(),
          weekend_rate_minor: rt.weekend === null ? null : toMinor(rt.weekend).toString(),
          meal: "BB",
          sort,
          created_at: now,
        })
        .returning();
      changes.push(`room type ${rt.name}`);
    }
    if (!roomType) throw new Error(`room type ${rt.name} insert returned no row`);
    const roomTypeId = roomType.id;
    for (const label of rt.units) {
      const unit = await db.query.rooms.findFirst({
        where: (r, { and, eq }) => and(eq(r.room_type_id, roomTypeId), eq(r.label, label)),
      });
      if (unit) continue;
      await db.insert(schema.rooms).values({
        id: uuidV4(),
        room_type_id: roomTypeId,
        label,
        export_token: randomBytes(32).toString("hex"),
      });
      changes.push(`unit ${label}`);
    }
  }
  return { hotel, changes };
}

/** Records the on-chain registration (Hotel PDA, and the signature when this run registered it). */
export async function recordRegistration(db: Db, hotel: DemoHotel, hotelPda: string, signature: string | null) {
  const registeredSig = signature ?? hotel.registered_sig;
  if (hotel.onchain_hotel === hotelPda && hotel.registered_sig === registeredSig) return false;
  const set = { onchain_hotel: hotelPda, registered_sig: registeredSig, updated_at: Math.floor(Date.now() / 1000) };
  await db.insert(schema.hotels).values(hotel).onConflictDoUpdate({ target: schema.hotels.id, set });
  return true;
}
