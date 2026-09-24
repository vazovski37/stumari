import { leadTimeDays, monthOf, nightsBetween, weekdayMon0, weekendNights } from "./dates";
import { CoreError } from "./errors";
import { assertSafeInt } from "./int";
import { exposureDays } from "./windows";

/**
 * The adapter (pricing-and-risk-model.md §2): turns what Stumari knows at quote time into the
 * model's features. `ml/stumari_ml/adapter.py` implements the same table; parity.json checks it.
 */
export type BuyerType = "guest" | "agent";

/** Adapter input — same shape as a `requests[].request` entry of parity.json. */
export interface ModelRequest {
  issued_at: number;
  checkin_ts: number;
  checkin_date: string;
  checkout_date: string;
  adults: number;
  children: number;
  buyer_type: BuyerType;
  /** Hotel setting `City Hotel` | `Resort Hotel`. */
  hotel_type: string;
  /** Room type setting `BB` | `HB` | `FB` | `SC` (the dataset's `Undefined` → `SC` is a training-data rule). */
  meal: string;
  is_repeated_guest: number;
  previous_bookings_not_canceled: number;
}

export interface RequestFeatures {
  lead_time: number;
  arrival_month: number;
  arrival_dow: number;
  weekend_nights: number;
  week_nights: number;
  adults: number;
  children: number;
  is_repeated_guest: number;
  previous_bookings_not_canceled: number;
  market_segment: string;
  distribution_channel: string;
  customer_type: string;
  hotel: string;
  meal: string;
}

export type NumericRequestFeature = {
  [K in keyof RequestFeatures]: RequestFeatures[K] extends number ? K : never;
}[keyof RequestFeatures];
export type CategoricalFeature = Exclude<keyof RequestFeatures, NumericRequestFeature>;

/** Person-period features, one set per window. */
export interface WindowFeatures {
  window: number;
  exposure_days: number;
}

export const NUMERIC_REQUEST_FEATURES: readonly NumericRequestFeature[] = [
  "lead_time",
  "arrival_month",
  "arrival_dow",
  "weekend_nights",
  "week_nights",
  "adults",
  "children",
  "is_repeated_guest",
  "previous_bookings_not_canceled",
];
export const CATEGORICAL_FEATURES: readonly CategoricalFeature[] = [
  "market_segment",
  "distribution_channel",
  "customer_type",
  "hotel",
  "meal",
];

export const PREVIOUS_BOOKINGS_CAP = 3;

/**
 * Wallet history (data-model.md): used only when the quote has a `buyer_wallet`; otherwise
 * both features are 0. `releasedBookings` counts the wallet's `released` bookings across hotels.
 */
export function walletHistoryFeatures(
  buyerWallet: string | null | undefined,
  releasedBookings: number,
): Pick<RequestFeatures, "is_repeated_guest" | "previous_bookings_not_canceled"> {
  assertSafeInt(releasedBookings, "releasedBookings");
  if (!buyerWallet) return { is_repeated_guest: 0, previous_bookings_not_canceled: 0 };
  const prev = Math.min(releasedBookings, PREVIOUS_BOOKINGS_CAP);
  return { is_repeated_guest: prev > 0 ? 1 : 0, previous_bookings_not_canceled: prev };
}

export function adaptRequest(req: ModelRequest): RequestFeatures {
  assertSafeInt(req.issued_at, "issued_at");
  assertSafeInt(req.checkin_ts, "checkin_ts");
  const lead = leadTimeDays(req.issued_at, req.checkin_ts);
  if (lead < 0) throw new CoreError("InvalidInput", "checkin_ts is before issued_at");
  const nights = nightsBetween(req.checkin_date, req.checkout_date);
  if (nights < 1) throw new CoreError("InvalidInput", "checkout_date must be after checkin_date");
  if (req.buyer_type !== "guest" && req.buyer_type !== "agent") {
    throw new CoreError("InvalidInput", `unknown buyer_type ${JSON.stringify(req.buyer_type)}`);
  }
  const weekend = weekendNights(req.checkin_date, req.checkout_date);
  return {
    lead_time: lead,
    arrival_month: monthOf(req.checkin_date),
    arrival_dow: weekdayMon0(req.checkin_date),
    weekend_nights: weekend,
    week_nights: nights - weekend,
    adults: assertSafeInt(req.adults, "adults", 1),
    children: assertSafeInt(req.children, "children"),
    is_repeated_guest: assertSafeInt(req.is_repeated_guest, "is_repeated_guest", 0, 1),
    previous_bookings_not_canceled: Math.min(
      assertSafeInt(req.previous_bookings_not_canceled, "previous_bookings_not_canceled"),
      PREVIOUS_BOOKINGS_CAP,
    ),
    // ADR-0014: agents buy for their own users, so both buyer types are Direct bookings.
    market_segment: "Direct",
    distribution_channel: "Direct",
    customer_type: "Transient",
    hotel: req.hotel_type,
    meal: req.meal,
  };
}

/**
 * One-hot column name, as `ml/stumari_ml/adapter.py` `column_name`: group + "_" + value
 * lowercased with each non-alphanumeric run replaced by "_" and outer "_" stripped
 * ("Offline TA/TO" → `market_segment_offline_ta_to`, window 3 → `window_3`).
 */
export function oneHotColumnName(group: string, value: string): string {
  return `${group}_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

export function windowFeatures(leadTime: number, k: number): WindowFeatures {
  return { window: k, exposure_days: exposureDays(leadTime, k) };
}
