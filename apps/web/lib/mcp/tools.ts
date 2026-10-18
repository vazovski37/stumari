import { TEMPLATES, type QuoteEnvelope } from "@stumari/core";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { termsText } from "../bookings/terms";
import type { PublicBookingView } from "../bookings/view";
import { filterHotels, findPublicHotel, listPublicHotels, type HotelFilters } from "../hotels";
import { availabilityRows } from "../inventory/search";
import type { QuoteRequest } from "../quotes/create";
import { clip, usdc, usdcToMinor } from "./text";

/**
 * Tools of the remote MCP endpoint (ADR-0020). They search, quote and prepare. They never move
 * money: `book` returns a link to the website's checkout, where the guest's wallet signs.
 */
export interface ConciergeDeps {
  db: Db;
  /** Public site origin, no trailing slash. */
  siteUrl: string;
  /** The wallet the connector token was minted for: the only wallet that may pay these quotes. */
  wallet: string;
  /** Hold owner for quotes made through this connector. */
  clientId: string;
  now: number;
  createQuote: (input: QuoteRequest) => Promise<QuoteEnvelope>;
  loadQuote: (id: string) => Promise<{ envelope: QuoteEnvelope; status: string } | null>;
  bookingView: (id: string) => Promise<PublicBookingView>;
  walletBookings: () => Promise<PublicBookingView[]>;
}

export interface ToolOutput {
  summary: string;
  data: Record<string, unknown>;
}

/** A refusal decided by the tool layer (as opposed to an `ApiError` from the app). */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** At most this many hotels get an availability check per search. */
const MAX_HOTELS = 8;

const bookingUrl = (d: ConciergeDeps, id: string) => `${d.siteUrl}/b/${id}`;
export const checkoutUrl = (d: Pick<ConciergeDeps, "siteUrl">, slug: string, quoteId: string, option: number) =>
  `${d.siteUrl}/h/${encodeURIComponent(slug)}?quote=${quoteId}&option=${option}`;

// ---------------------------------------------------------------------------------------------

export interface FindHotelsInput {
  checkin: string;
  checkout: string;
  adults: number;
  children?: number;
  text?: string;
  neighborhood?: string;
  amenities?: string[];
  max_nightly_usdc?: number;
  meal?: HotelFilters["meal"];
  city?: string;
}

export async function findHotels(d: ConciergeDeps, input: FindHotelsInput): Promise<ToolOutput> {
  const children = input.children ?? 0;
  const all = await listPublicHotels(d.db, input.city ?? "Tbilisi");
  const knownAmenities = [...new Set(all.flatMap((h) => h.amenities))].sort();
  const matched = filterHotels(all, {
    text: input.text,
    neighborhood: input.neighborhood,
    amenities: input.amenities,
    meal: input.meal,
    max_nightly_minor: input.max_nightly_usdc === undefined ? undefined : usdcToMinor(input.max_nightly_usdc),
  });
  const searched = matched.slice(0, MAX_HOTELS);
  // The hotel filter looks at each hotel's cheapest rate; the budget must also hold for the rooms shown,
  // at the real per-night price of these dates (weekend rates included).
  const maxNightly = input.max_nightly_usdc === undefined ? null : BigInt(usdcToMinor(input.max_nightly_usdc));
  const results = (
    await Promise.all(
      searched.map(async (h) => {
        const found = await findPublicHotel(d.db, h.slug);
        if (!found) return null;
        const rows = (
          await availabilityRows(d.db, found, { checkin: input.checkin, checkout: input.checkout, adults: input.adults, children }, d.clientId, d.now)
        ).filter((r) => r.available && (maxNightly === null || BigInt(r.base_price_minor) / BigInt(r.nights) <= maxNightly));
        if (rows.length === 0) return null;
        return {
          hotel_slug: h.slug,
          hotel_name: clip(h.name, 80),
          neighborhood: h.neighborhood ? clip(h.neighborhood, 60) : null,
          description: h.description ? clip(h.description, 300) : null,
          amenities: h.amenities.slice(0, 20),
          rooms: rows.flatMap((r) => {
            const rt = found.roomTypes.find((t) => t.id === r.room_type_id);
            if (!rt) return [];
            const perNight = BigInt(r.base_price_minor) / BigInt(r.nights);
            return [
              {
                room_type_id: rt.id,
                name: clip(rt.name, 60),
                meal: rt.meal,
                max_adults: rt.max_adults,
                max_children: rt.max_children,
                nights: r.nights,
                base_price_minor: r.base_price_minor,
                base_price: usdc(r.base_price_minor),
                base_per_night: usdc(perNight.toString()),
              },
            ];
          }),
        };
      }),
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const lines = results.flatMap((h) =>
    h.rooms.map((r) => `- ${h.hotel_name} (${h.hotel_slug})${h.neighborhood ? `, ${h.neighborhood}` : ""}: ${r.name} [${r.room_type_id}] ${r.base_price} for ${r.nights} night(s), ${r.base_per_night}/night`),
  );
  const summary =
    results.length === 0
      ? `No hotel matches. ${matched.length} of ${all.length} hotel(s) fit the requirements but none has a free room for ${input.checkin} → ${input.checkout} (${input.adults} adult(s), ${children} child(ren)). Try other dates or loosen the requirements. Known amenity keys: ${knownAmenities.join(", ") || "none"}.`
      : `${results.length} hotel(s) with a free room for ${input.checkin} → ${input.checkout}, cheapest first. Base prices are the hotel's reference rate; call get_quote for the signed menu of cancellation options.\n${lines.join("\n")}`;
  return {
    summary,
    data: {
      checkin: input.checkin,
      checkout: input.checkout,
      adults: input.adults,
      children,
      hotels_in_city: all.length,
      hotels_matching_requirements: matched.length,
      known_amenities: knownAmenities,
      results,
    },
  };
}

// ---------------------------------------------------------------------------------------------

export interface GetQuoteInput {
  hotel_slug: string;
  room_type_id: string;
  checkin: string;
  checkout: string;
  adults: number;
  children?: number;
}

export async function getQuote(d: ConciergeDeps, input: GetQuoteInput): Promise<ToolOutput> {
  const children = input.children ?? 0;
  const env = await d.createQuote({
    hotel_slug: input.hotel_slug,
    room_type_id: input.room_type_id,
    checkin_date: input.checkin,
    checkout_date: input.checkout,
    adults: input.adults,
    children,
    buyer_type: "agent",
    buyer_wallet: d.wallet,
  });
  const q = env.quote;
  const found = await findPublicHotel(d.db, q.hotel_slug);
  const timeZone = found?.hotel.timezone ?? "Asia/Tbilisi";
  const options = q.options.map((o, index) => ({
    index,
    id: o.id,
    name: TEMPLATES[o.id].name,
    price_minor: o.price_minor,
    price: usdc(o.price_minor),
    is_hotels_usual: o.id === env.explain.reference_template,
    terms: termsText({ tiers: o.tiers, checkinTs: q.checkin_ts, releaseAfterTs: null, timeZone }),
    checkout_url: checkoutUrl(d, q.hotel_slug, q.id, index),
  }));
  // The last two lines (hotel confirmation, time zone) are the same for every option.
  const lines = options.map(
    (o) => `[${o.index}] ${o.name} — ${o.price}${o.is_hotels_usual ? " (the hotel's usual terms)" : ""}: ${o.terms.slice(0, -2).join(" ")}`,
  );
  return {
    summary: [
      `Quote ${q.id}: ${q.nights} night(s) at ${q.hotel_slug}, ${q.checkin_date} → ${q.checkout_date}. The room is held for 10 minutes (until ${new Date(q.expires_at * 1000).toISOString()}).`,
      `Only the linked wallet ${d.wallet} can pay it. Each price is for its own cancellation terms and is signed by Stumari.`,
      "Options (pass quote_id and option_index to book):",
      ...lines,
    ].join("\n"),
    data: {
      quote_id: q.id,
      expires_at: q.expires_at,
      hotel_slug: q.hotel_slug,
      room_type_id: q.room_type_id,
      checkin_date: q.checkin_date,
      checkout_date: q.checkout_date,
      nights: q.nights,
      adults: q.adults,
      children: q.children,
      base_price_minor: q.base_price_minor,
      linked_wallet: d.wallet,
      options,
    },
  };
}

// ---------------------------------------------------------------------------------------------

export interface BookInput {
  quote_id: string;
  option_index: number;
}

/** Prepares the booking: validates the quote and hands back the website checkout link for the guest to pay. */
export async function book(d: ConciergeDeps, input: BookInput): Promise<ToolOutput> {
  const record = await d.loadQuote(input.quote_id);
  if (!record) throw new ToolError("QUOTE_NOT_FOUND", "No such quote. Ask for a new one with get_quote.");
  const q = record.envelope.quote;
  if (record.status === "used") throw new ToolError("ALREADY_BOOKED", "This quote has already been paid. Use booking_status.");
  if (record.status !== "active" || q.expires_at <= d.now) {
    throw new ToolError("QUOTE_EXPIRED", "This quote has expired and its room hold is released. Ask for a new one with get_quote.");
  }
  if (q.buyer_wallet !== null && q.buyer_wallet !== d.wallet) {
    throw new ToolError("WALLET_MISMATCH", "This quote was priced for a different wallet than the one linked to this connector.");
  }
  const option = q.options[input.option_index];
  if (!option) throw new ToolError("NO_SUCH_OPTION", `The quote has options 0..${q.options.length - 1}.`);
  const url = checkoutUrl(d, q.hotel_slug, q.id, input.option_index);
  const minutes = Math.max(0, Math.floor((q.expires_at - d.now) / 60));
  return {
    summary: [
      `Ready to pay: ${TEMPLATES[option.id].name}, ${usdc(option.price_minor)}, ${q.nights} night(s) ${q.checkin_date} → ${q.checkout_date}.`,
      `Nothing has been paid. Tell the guest to open this link, review the terms and approve the payment in their wallet (${d.wallet}): ${url}`,
      `The room is held for about ${minutes} more minute(s).`,
    ].join("\n"),
    data: {
      status: "awaiting_payment_on_website",
      checkout_url: url,
      quote_id: q.id,
      option_index: input.option_index,
      option_id: option.id,
      amount_minor: option.price_minor,
      amount: usdc(option.price_minor),
      wallet: d.wallet,
      expires_at: q.expires_at,
    },
  };
}

// ---------------------------------------------------------------------------------------------

function viewData(d: ConciergeDeps, v: PublicBookingView) {
  return {
    booking_id: v.id,
    status: v.status,
    hotel: { name: clip(v.hotel.name, 80), address: v.hotel.address ? clip(v.hotel.address, 120) : null },
    room_type: clip(v.room_type.name, 60),
    checkin_date: v.checkin_date,
    checkout_date: v.checkout_date,
    amount_minor: v.amount_minor,
    amount: usdc(v.amount_minor),
    terms: v.terms.text,
    refund_if_cancel_now_minor: v.refund_if_cancel_now_minor,
    can_cancel: v.can_cancel,
    booking_url: bookingUrl(d, v.id),
    explorer_url: v.explorer.booking,
  };
}

const viewLine = (v: PublicBookingView) =>
  `${v.id}: ${clip(v.hotel.name, 60)}, ${clip(v.room_type.name, 40)}, ${v.checkin_date} → ${v.checkout_date}, ${usdc(v.amount_minor)}, ${v.status}`;

export async function bookingStatus(d: ConciergeDeps, input: { booking_id: string }): Promise<ToolOutput> {
  const v = await d.bookingView(input.booking_id);
  return {
    summary: [
      `Booking ${viewLine(v)}.`,
      ...v.terms.text,
      v.can_cancel
        ? `Cancelling now refunds ${v.refund_if_cancel_now_minor ? usdc(v.refund_if_cancel_now_minor) : "per the terms above"}. The guest cancels on ${bookingUrl(d, v.id)}.`
        : "It can no longer be cancelled.",
    ].join("\n"),
    data: viewData(d, v),
  };
}

export async function myBookings(d: ConciergeDeps): Promise<ToolOutput> {
  const views = await d.walletBookings();
  return {
    summary: views.length === 0 ? `No bookings yet for ${d.wallet}.` : `${views.length} booking(s) for ${d.wallet}:\n${views.map(viewLine).join("\n")}`,
    data: { wallet: d.wallet, bookings: views.map((v) => viewData(d, v)) },
  };
}

/** Cancelling moves money, so it happens on the website: the tool shows the refund and the link. */
export async function cancel(d: ConciergeDeps, input: { booking_id: string }): Promise<ToolOutput> {
  const v = await d.bookingView(input.booking_id);
  if (!v.can_cancel) throw new ApiError(409, "NOT_ALLOWED", `Booking ${v.id} is ${v.status} and can no longer be cancelled.`);
  const refund = v.refund_if_cancel_now_minor ? usdc(v.refund_if_cancel_now_minor) : null;
  return {
    summary: `Nothing has been cancelled yet. Cancelling booking ${v.id} now refunds at least ${refund ?? "the amount in its terms"} of ${usdc(v.amount_minor)}. Tell the guest to open ${bookingUrl(d, v.id)} and press Cancel, then approve in their wallet.`,
    data: { ...viewData(d, v), status_of_request: "awaiting_cancel_on_website", cancel_url: bookingUrl(d, v.id) },
  };
}
