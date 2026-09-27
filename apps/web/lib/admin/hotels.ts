import { randomBytes, randomUUID } from "node:crypto";
import { isAddress, type Address } from "@solana/kit";
import { U64_MAX, uuidToBytes } from "@stumari/core";
import {
  buildRegisterHotelTx,
  buildUpdateHotelTx,
  fetchMaybeHotel,
  findHotelPda,
  sendBuiltTx,
} from "@stumari/escrow-client";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import type { ServerEnv } from "../env-schema";
import { DEFAULT_HOTEL_POLICY, hotels, rooms, roomTypes } from "../db/schema";
import { exportUrl, importUrls } from "../dashboard/units";
import { SLUG, type HotelRow, type RoomTypeRow } from "../hotels";
import type { Chain } from "../solana/context";
import { slugify } from "./slug";

export type { HotelRow };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Use HH:MM (24 h)" });

const timeZone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unknown IANA timezone" },
);

const hotelFields = {
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(SLUG, { message: "Lowercase letters, digits and dashes" }),
  city: text(80),
  country: text(80),
  address: text(200),
  phone: text(40),
  timezone: timeZone,
  checkin_time: hhmm,
  checkout_time: hhmm,
  hotel_type: z.enum(["City Hotel", "Resort Hotel"]),
  confirm_mode: z.enum(["auto", "manual"]),
  contact_email: text(200).pipe(z.email().nullish()),
  contact_telegram: text(64),
};

/** POST /api/admin/hotels: a draft; everything but the name has a default. */
export const hotelCreate = z.object(hotelFields).partial().required({ name: true });
export type HotelCreate = z.output<typeof hotelCreate> & { application_id?: string };

/** PATCH /api/admin/hotels/{id}: details, status and payout wallet (the latter two reach the chain once registered). */
export const hotelPatch = z
  .object({
    ...hotelFields,
    status: z.enum(["draft", "active", "paused"]),
    payout_wallet: z.string().trim().nullable(),
  })
  .partial();
export type HotelPatch = z.output<typeof hotelPatch>;

async function slugTaken(db: Db, slug: string, exceptId?: string): Promise<boolean> {
  const row = await db.query.hotels.findFirst({ where: eq(hotels.slug, slug), columns: { id: true } });
  return row !== undefined && row.id !== exceptId;
}

async function freeSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 60)}-${n}`;
    if (!(await slugTaken(db, slug))) return slug;
  }
  return `${base.slice(0, 55)}-${randomBytes(3).toString("hex")}`;
}

/** Inserts a draft hotel with the default policy (data-model.md defaults for the rest). */
export async function createHotel(db: Db, input: HotelCreate, now: number): Promise<HotelRow> {
  if (input.slug && (await slugTaken(db, input.slug))) throw new ApiError(409, "SLUG_TAKEN", "Another hotel uses this URL");
  const [row] = await db
    .insert(hotels)
    .values({
      ...input,
      id: randomUUID(),
      slug: input.slug ?? (await freeSlug(db, input.name)),
      status: "draft",
      policy: DEFAULT_HOTEL_POLICY,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return row!;
}

/**
 * A payout wallet: a base58 address that is not one of our keys. It must be the owner's
 * self-custody wallet (it signs in to the dashboard) — never an exchange deposit address.
 */
export function parsePayoutWallet(value: string, serverKeys: ReadonlySet<string>): string {
  if (!isAddress(value)) throw new ApiError(400, "INVALID_WALLET", "The payout wallet must be a base58 Solana address");
  if (serverKeys.has(value)) throw new ApiError(400, "INVALID_WALLET", "The payout wallet cannot be one of Stumari's keys");
  return value;
}

/** Our own key addresses (operator, admin), which are never a hotel's payout wallet. */
export function serverKeysOf(env: Pick<ServerEnv, "operator" | "admin">): Set<string> {
  return new Set([env.operator?.publicKey, env.admin?.publicKey].filter((k): k is string => k !== undefined));
}

export interface ChainUpdate {
  signature: string;
  active?: boolean;
  authority?: string;
}

/**
 * Applies a hotel patch. On a registered hotel a status change (active ⇄ paused) sends
 * `update_hotel(active)` and a new payout wallet sends `update_hotel(authority)` + its ATA
 * (affects new bookings only); the DB is written only after the transaction lands. An unregistered
 * hotel cannot be activated (register it first).
 */
export async function patchHotel(
  db: Db,
  hotel: HotelRow,
  patch: HotelPatch,
  deps: { chain: () => Promise<Chain>; serverKeys: ReadonlySet<string>; now: number },
): Promise<{ hotel: HotelRow; chain: ChainUpdate | null }> {
  const payout =
    patch.payout_wallet === undefined || patch.payout_wallet === null ? patch.payout_wallet : parsePayoutWallet(patch.payout_wallet, deps.serverKeys);
  if (patch.slug !== undefined && patch.slug !== hotel.slug && (await slugTaken(db, patch.slug, hotel.id))) {
    throw new ApiError(409, "SLUG_TAKEN", "Another hotel uses this URL");
  }

  let update: ChainUpdate | null = null;
  if (hotel.onchain_hotel) {
    if (patch.status === "draft") throw new ApiError(409, "INVALID_STATUS", "A registered hotel is active or paused, never draft");
    if (payout === null) throw new ApiError(409, "PAYOUT_WALLET_REQUIRED", "A registered hotel needs a payout wallet");
    const active = patch.status !== undefined && patch.status !== hotel.status ? patch.status === "active" : undefined;
    const authority = payout !== undefined && payout !== hotel.payout_wallet ? payout : undefined;
    if (active !== undefined || authority !== undefined) {
      const c = await deps.chain();
      const built = await buildUpdateHotelTx({
        rpc: c.rpc,
        operator: c.operator,
        admin: c.admin,
        hotelId: uuidToBytes(hotel.id),
        authority: authority as Address | undefined,
        active,
      });
      const { signature } = await sendBuiltTx(c.rpc, built);
      update = { signature, ...(active !== undefined ? { active } : {}), ...(authority !== undefined ? { authority } : {}) };
    }
  } else if (patch.status === "active") {
    throw new ApiError(409, "NOT_REGISTERED", "Register the hotel on-chain before activating it");
  }

  // `payout` is `patch.payout_wallet` once validated, so the patch is written as is.
  const [row] = await db
    .update(hotels)
    .set({ ...patch, updated_at: deps.now })
    .where(eq(hotels.id, hotel.id))
    .returning();
  return { hotel: row!, chain: update };
}

// ---------------------------------------------------------------- room types and units

const minor = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/, { message: "A positive amount in base units (45 USD = 45000000)" })
  .refine((v) => BigInt(v) <= U64_MAX, { message: "Amount too large" });

const roomTypeFields = {
  name: z.string().trim().min(1).max(80),
  description: text(1_000),
  max_adults: z.number().int().min(1).max(20),
  max_children: z.number().int().min(0).max(20),
  base_rate_minor: minor,
  weekend_rate_minor: minor.nullish(),
  meal: z.enum(["BB", "HB", "FB", "SC"]),
  photo_url: text(2_000).pipe(z.url({ protocol: /^https$/ }).nullish()),
  sort: z.number().int().min(0).max(1_000),
};

/** Nightly rates are USD = USDC base units (6 decimals); Fri/Sat nights use `weekend_rate_minor` when set. */
export const roomTypeCreate = z.object(roomTypeFields).partial().required({ name: true, base_rate_minor: true });
export const roomTypePatch = z.object({ ...roomTypeFields, active: z.boolean() }).partial();

export async function createRoomType(db: Db, hotelId: string, input: z.output<typeof roomTypeCreate>, now: number): Promise<RoomTypeRow> {
  const [row] = await db
    .insert(roomTypes)
    .values({ ...input, id: randomUUID(), hotel_id: hotelId, created_at: now })
    .returning();
  return row!;
}

export async function patchRoomType(db: Db, hotelId: string, roomTypeId: string, patch: z.output<typeof roomTypePatch>): Promise<RoomTypeRow> {
  const [row] = await db
    .update(roomTypes)
    .set(patch)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.hotel_id, hotelId)))
    .returning();
  if (!row) throw new ApiError(404, "NOT_FOUND", "No such room type");
  return row;
}

export const unitCreate = z.object({
  label: z.string().trim().min(1).max(20),
  ical_import_urls: importUrls.optional(),
});

/** A physical unit with its own export feed token (32 random bytes). Labels are unique per room type. */
export async function createUnit(
  db: Db,
  hotelId: string,
  roomTypeId: string,
  input: z.output<typeof unitCreate>,
  siteUrl: string,
): Promise<{ id: string; export_url: string }> {
  const rt = await db.query.roomTypes.findFirst({ where: and(eq(roomTypes.id, roomTypeId), eq(roomTypes.hotel_id, hotelId)) });
  if (!rt) throw new ApiError(404, "NOT_FOUND", "No such room type");
  const clash = await db.query.rooms.findFirst({ where: and(eq(rooms.room_type_id, rt.id), eq(rooms.label, input.label)) });
  if (clash) throw new ApiError(409, "LABEL_TAKEN", `This room type already has a unit "${input.label}"`);
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  await db.insert(rooms).values({ id, room_type_id: rt.id, label: input.label, ical_import_urls: input.ical_import_urls ?? [], export_token: token });
  return { id, export_url: exportUrl(siteUrl, token) };
}

// ---------------------------------------------------------------- on-chain registration

async function activeUnitCount(db: Db, hotelId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
    .where(and(eq(roomTypes.hotel_id, hotelId), eq(rooms.active, true), eq(roomTypes.active, true)));
  return Number(row?.n ?? 0);
}

/**
 * Onboarding "register": the payout wallet's ATA (idempotent) + `register_hotel`, then status
 * `active`. Idempotent: an existing Hotel account is brought in line (authority, active) with
 * `update_hotel` instead.
 */
export async function registerHotel(c: Chain, db: Db, hotel: HotelRow, now: number): Promise<{ hotel: HotelRow; signature: string | null }> {
  if (!hotel.payout_wallet) throw new ApiError(409, "NO_PAYOUT_WALLET", "Set the hotel's payout wallet first");
  if ((await activeUnitCount(db, hotel.id)) === 0) throw new ApiError(409, "NO_UNITS", "Add at least one room type with a unit first");
  const authority = hotel.payout_wallet as Address;
  const hotelId = uuidToBytes(hotel.id);
  const pda = await findHotelPda(hotelId);
  const existing = await fetchMaybeHotel(c.rpc, pda, { commitment: "confirmed" });
  const ctx = { rpc: c.rpc, operator: c.operator, admin: c.admin, hotelId };
  // Re-checking an already registered hotel that an admin paused must not re-activate it
  // (a real pilot hotel stays paused on devnet except during supervised test bookings).
  const keepPaused = existing !== null && hotel.status === "paused";

  let signature: string | null = null;
  if (!existing) {
    signature = (await sendBuiltTx(c.rpc, await buildRegisterHotelTx({ ...ctx, authority }))).signature;
  } else if (existing.authority !== authority || (!existing.active && !keepPaused)) {
    const built = await buildUpdateHotelTx({
      ...ctx,
      authority: existing.authority !== authority ? authority : undefined,
      active: existing.active || keepPaused ? undefined : true,
    });
    signature = (await sendBuiltTx(c.rpc, built)).signature;
  }
  const status = keepPaused ? "paused" : "active";
  const [row] = await db
    .update(hotels)
    .set({ onchain_hotel: pda, registered_sig: signature ?? hotel.registered_sig, status, updated_at: now })
    .where(eq(hotels.id, hotel.id))
    .returning();
  return { hotel: row!, signature };
}

// ---------------------------------------------------------------- lists

/** Admin hotels list with onboarding progress. */
export async function listHotels(db: Db) {
  const rows = await db
    .select({
      hotel: hotels,
      // Qualified by hand: drizzle renders a lone table's column unqualified, which the subquery would rebind.
      roomTypes: sql<number>`(SELECT COUNT(*) FROM ${roomTypes} rt WHERE rt.hotel_id = ${hotels}.id)`,
      units: sql<number>`(SELECT COUNT(*) FROM ${rooms} r JOIN ${roomTypes} rt ON rt.id = r.room_type_id WHERE rt.hotel_id = ${hotels}.id)`,
    })
    .from(hotels)
    .orderBy(asc(hotels.name));
  return rows.map((r) => ({ ...r.hotel, room_type_count: Number(r.roomTypes), unit_count: Number(r.units) }));
}

export async function findHotel(db: Db, id: string): Promise<HotelRow> {
  const hotel = await db.query.hotels.findFirst({ where: eq(hotels.id, id) });
  if (!hotel) throw new ApiError(404, "NOT_FOUND", "Hotel not found");
  return hotel;
}
