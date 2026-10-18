/**
 * Demo data (configuration.md "Demo data"): hotel `stumari-demo` plus three more Tbilisi hotels with
 * different areas, amenities and prices, so an AI assistant has real requirements to match
 * (ADR-0020). Seeding only inserts what is missing, so edits made in the admin console survive a re-run.
 */
import { randomBytes } from "node:crypto";
import { toMinor, uuidV4 } from "@stumari/core";
import { schema, type Db } from "./db";

export const DEMO_SLUG = "stumari-demo";

interface DemoRoomType {
  name: string;
  description: string;
  max_adults: number;
  max_children: number;
  base: string;
  weekend: string | null;
  meal?: "BB" | "HB" | "FB" | "SC";
  units: string[];
}

interface DemoHotelSpec {
  hotel: {
    slug: string;
    name: string;
    address: string;
    description: string;
    neighborhood: string;
    amenities: string[];
  };
  roomTypes: DemoRoomType[];
}

const COMMON = {
  city: "Tbilisi",
  country: "Georgia",
  timezone: "Asia/Tbilisi",
  checkin_time: "14:00",
  checkout_time: "12:00",
  hotel_type: "City Hotel",
  status: "active",
  policy: schema.DEFAULT_HOTEL_POLICY,
} as const;

const DEMO_HOTELS: DemoHotelSpec[] = [
  {
    hotel: {
      slug: DEMO_SLUG,
      name: "Stumari Demo Guesthouse",
      address: "Sololaki, Tbilisi",
      neighborhood: "Sololaki",
      description: "Family-run guesthouse in a restored Sololaki courtyard house. Quiet street, ten minutes on foot to the old town and the sulphur baths.",
      amenities: ["wifi", "air-conditioning", "breakfast", "quiet", "old-town", "courtyard"],
    },
    roomTypes: [
      { name: "Double room", description: "Double bed, private bathroom, breakfast included.", max_adults: 2, max_children: 0, base: "65.00", weekend: "75.00", units: ["D1", "D2"] },
      { name: "Twin room", description: "Two single beds, private bathroom, breakfast included.", max_adults: 2, max_children: 0, base: "60.00", weekend: null, units: ["T1"] },
      { name: "Family suite", description: "Double bed and two singles, sitting area, breakfast included.", max_adults: 2, max_children: 2, base: "110.00", weekend: null, units: ["F1"] },
    ],
  },
  {
    hotel: {
      slug: "vera-garden-hotel",
      name: "Vera Garden Hotel",
      address: "Vera, Tbilisi",
      neighborhood: "Vera",
      description: "Small hotel with a shaded garden in the leafy Vera district. Free parking, pets welcome, a short walk to Rustaveli Avenue.",
      amenities: ["wifi", "air-conditioning", "breakfast", "parking", "pets-allowed", "garden", "quiet"],
    },
    roomTypes: [
      { name: "Garden double", description: "Double bed, balcony over the garden, breakfast included.", max_adults: 2, max_children: 1, base: "88.00", weekend: "98.00", units: ["G1", "G2"] },
      { name: "Superior suite", description: "Large suite with a work desk and bathtub, breakfast included.", max_adults: 3, max_children: 1, base: "145.00", weekend: null, units: ["S1"] },
    ],
  },
  {
    hotel: {
      slug: "rustaveli-boutique-rooms",
      name: "Rustaveli Boutique Rooms",
      address: "Rustaveli Avenue, Tbilisi",
      neighborhood: "Rustaveli",
      description: "Design-led rooms on Rustaveli Avenue next to the opera, cafes and the metro. Lively location, soundproof windows, lift to every floor.",
      amenities: ["wifi", "air-conditioning", "breakfast", "lift", "central", "metro-nearby", "work-desk"],
    },
    roomTypes: [
      { name: "City double", description: "Double bed, soundproof windows, work desk, breakfast included.", max_adults: 2, max_children: 0, base: "98.00", weekend: "112.00", units: ["C1", "C2", "C3"] },
      { name: "Loft studio", description: "Split-level studio with kitchenette, breakfast included.", max_adults: 2, max_children: 2, base: "135.00", weekend: null, units: ["L1"] },
    ],
  },
  {
    hotel: {
      slug: "marjanishvili-budget-inn",
      name: "Marjanishvili Budget Inn",
      address: "Marjanishvili, Tbilisi",
      neighborhood: "Marjanishvili",
      description: "Simple, clean rooms near Marjanishvili metro. Shared kitchen and laundry, good for longer stays on a budget.",
      amenities: ["wifi", "kitchen", "laundry", "budget", "metro-nearby", "air-conditioning"],
    },
    roomTypes: [
      { name: "Private room", description: "Double bed, shared bathroom on the corridor. Use the shared kitchen for meals.", max_adults: 2, max_children: 0, base: "34.00", weekend: null, meal: "SC", units: ["P1", "P2", "P3"] },
      { name: "Private room with bathroom", description: "Double bed, private bathroom, kettle and fridge.", max_adults: 2, max_children: 1, base: "48.00", weekend: "54.00", meal: "SC", units: ["B1", "B2"] },
    ],
  },
];

export type DemoHotel = typeof schema.hotels.$inferSelect;

export interface SeedResult {
  /** The primary demo hotel `stumari-demo`. */
  hotel: DemoHotel;
  /** Every demo hotel (the primary one first). */
  hotels: DemoHotel[];
  /** What was inserted or updated (empty on a no-op run). */
  changes: string[];
}

async function seedOne(db: Db, spec: DemoHotelSpec, payoutWallet: string, now: number, changes: string[]): Promise<DemoHotel> {
  const slug = spec.hotel.slug;
  // Operators come from the query callbacks and updates are upserts on the primary key: drizzle-orm
  // itself only resolves from apps/web, so this module never imports it.
  let hotel = await db.query.hotels.findFirst({ where: (h, { eq }) => eq(h.slug, slug) });
  if (!hotel) {
    [hotel] = await db
      .insert(schema.hotels)
      .values({ id: uuidV4(), ...COMMON, ...spec.hotel, payout_wallet: payoutWallet, created_at: now, updated_at: now })
      .returning();
    changes.push(`hotel ${slug}`);
  } else {
    // An existing hotel only gains what it lacks: the payout wallet, and the search attributes
    // (description, area, amenities) that older databases do not have. Admin edits are never overwritten.
    const set: Partial<DemoHotel> = {};
    if (hotel.payout_wallet !== payoutWallet) set.payout_wallet = payoutWallet;
    if (hotel.description === null && hotel.neighborhood === null && hotel.amenities.length === 0) {
      set.description = spec.hotel.description;
      set.neighborhood = spec.hotel.neighborhood;
      set.amenities = spec.hotel.amenities;
    }
    if (Object.keys(set).length > 0) {
      [hotel] = await db
        .insert(schema.hotels)
        .values(hotel)
        .onConflictDoUpdate({ target: schema.hotels.id, set: { ...set, updated_at: now } })
        .returning();
      changes.push(`${slug}: ${Object.keys(set).join(", ")}`);
    }
  }
  if (!hotel) throw new Error(`hotel ${slug} insert returned no row`);
  const hotelId = hotel.id;

  for (const [sort, rt] of spec.roomTypes.entries()) {
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
          meal: rt.meal ?? "BB",
          sort,
          created_at: now,
        })
        .returning();
      changes.push(`${slug}: room type ${rt.name}`);
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
      changes.push(`${slug}: unit ${label}`);
    }
  }
  return hotel;
}

export async function seedDemoHotel(db: Db, payoutWallet: string): Promise<SeedResult> {
  const now = Math.floor(Date.now() / 1000);
  const changes: string[] = [];
  const hotels: DemoHotel[] = [];
  for (const spec of DEMO_HOTELS) hotels.push(await seedOne(db, spec, payoutWallet, now, changes));
  return { hotel: hotels[0]!, hotels, changes };
}

/** Records the on-chain registration (Hotel PDA, and the signature when this run registered it). */
export async function recordRegistration(db: Db, hotel: DemoHotel, hotelPda: string, signature: string | null) {
  const registeredSig = signature ?? hotel.registered_sig;
  if (hotel.onchain_hotel === hotelPda && hotel.registered_sig === registeredSig) return false;
  const set = { onchain_hotel: hotelPda, registered_sig: registeredSig, updated_at: Math.floor(Date.now() / 1000) };
  await db.insert(schema.hotels).values(hotel).onConflictDoUpdate({ target: schema.hotels.id, set });
  return true;
}
