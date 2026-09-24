import {
  loadModel,
  modelProvider,
  nightsBetween,
  parseMinor,
  priceMenu,
  walletHistoryFeatures,
  weekendNights,
  type BuyerType,
  type HazardProvider,
  type PriceMenu,
  type PricingPolicy,
} from "@stumari/core";
import modelJson from "@stumari/core/model/model.json";
import { and, count, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings } from "../db/schema";
import type { HotelRow, RoomTypeRow, Stay } from "../hotels";

let provider: HazardProvider | undefined;

/** The committed hazard model (ADR-0007), loaded once per process. */
export function hazardProvider(): HazardProvider {
  provider ??= modelProvider(loadModel(modelJson));
  return provider;
}

/** B = sum of nightly base rates; the weekend rate applies to nights starting Friday or Saturday. */
export function basePriceMinor(rt: Pick<RoomTypeRow, "base_rate_minor" | "weekend_rate_minor">, stay: Pick<Stay, "checkin" | "checkout">): bigint {
  const nights = nightsBetween(stay.checkin, stay.checkout);
  const weekend = weekendNights(stay.checkin, stay.checkout);
  const base = parseMinor(rt.base_rate_minor);
  const weekendRate = rt.weekend_rate_minor ? parseMinor(rt.weekend_rate_minor) : base;
  return BigInt(nights - weekend) * base + BigInt(weekend) * weekendRate;
}

/** data-model.md "Wallet history": the wallet's `released` bookings across all hotels. */
export async function releasedBookingsCount(db: Db, wallet: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.guest_wallet, wallet), eq(bookings.status, "released")));
  return row?.n ?? 0;
}

export interface PricingRequest {
  hotel: HotelRow;
  roomType: RoomTypeRow;
  stay: Stay;
  adults: number;
  children: number;
  buyerType: BuyerType;
  buyerWallet: string | null;
  issuedAt: number;
  policy: PricingPolicy;
}

/** The menu for one request: the hotel's policy, its rates and the buyer's wallet history. */
export async function priceRequest(db: Db, r: PricingRequest, hazard: HazardProvider = hazardProvider()): Promise<PriceMenu & { basePrice: bigint }> {
  const released = r.buyerWallet ? await releasedBookingsCount(db, r.buyerWallet) : 0;
  const basePrice = basePriceMinor(r.roomType, r.stay);
  const menu = priceMenu({
    provider: hazard,
    policy: r.policy,
    basePriceMinor: basePrice,
    request: {
      issued_at: r.issuedAt,
      checkin_ts: r.stay.checkinTs,
      checkin_date: r.stay.checkin,
      checkout_date: r.stay.checkout,
      adults: r.adults,
      children: r.children,
      buyer_type: r.buyerType,
      hotel_type: r.hotel.hotel_type,
      meal: r.roomType.meal,
      ...walletHistoryFeatures(r.buyerWallet, released),
    },
  });
  return { ...menu, basePrice };
}
