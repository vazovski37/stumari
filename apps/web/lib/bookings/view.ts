import { minRefundForCancel, parseMinor, type Tier } from "@stumari/core";
import type { bookings } from "../db/schema";
import type { Cluster } from "../env-schema";
import { explorerUrl } from "../explorer";
import type { HotelRow, RoomTypeRow } from "../hotels";
import { termsText } from "./terms";

export type BookingRow = typeof bookings.$inferSelect;
export type BookingStatus = BookingRow["status"];

export interface BookingRecord {
  booking: BookingRow;
  hotel: HotelRow;
  roomType: RoomTypeRow;
}

/** The public booking view of api.md (`apps/mcp/src/schemas.ts` parses exactly this). */
export interface PublicBookingView {
  id: string;
  status: BookingStatus;
  hotel: { name: string; address: string | null; phone: string | null; checkin_time: string; timezone: string };
  room_type: { id: string; name: string };
  checkin_date: string;
  checkout_date: string;
  checkin_ts: number;
  amount_minor: string;
  option_id: string;
  terms: { tiers: Tier[]; text: string[] };
  refund_if_cancel_now_minor: string | null;
  can_cancel: boolean;
  can_dispute: boolean;
  can_void: boolean;
  confirm_deadline_ts: number | null;
  release_after_ts: number | null;
  booking_pda: string;
  explorer: { booking: string; create_tx: string | null; exit_tx: string | null };
  /** How the escrow was paid out once the booking closed (from the on-chain account). */
  settled: { refund_minor: string; hotel_minor: string; fee_minor: string } | null;
  /** The chain clock (unix seconds) this view was built at: clients time the refund schedule by it. */
  now: number;
}

export interface ViewContext {
  /** Chain clock (unix seconds): the program's deadlines are checked against it. */
  now: number;
  cluster: Cluster;
  rpcUrl: string;
}

/** What the guest may do now, by the same clock rules as the program (escrow-program.md). */
export function allowedActions(b: BookingRow, now: number) {
  const open = b.status === "pending" || b.status === "confirmed";
  return {
    can_cancel: open && now < b.checkin_ts,
    can_dispute: b.status === "confirmed" && b.release_after_ts !== null && b.checkin_ts <= now && now < b.release_after_ts,
    can_void: b.status === "pending" && b.confirm_deadline_ts !== null && now >= b.confirm_deadline_ts,
  };
}

/** Never includes the guest's name, email, phone or wallet. */
export function publicBookingView({ booking: b, hotel, roomType }: BookingRecord, ctx: ViewContext): PublicBookingView {
  const actions = allowedActions(b, ctx.now);
  // What a cancel guarantees: its min_refund, the refund by the tier schedule at now + 90 s
  // (escrow-program.md). A pending booking gets everything back if the hotel has not confirmed
  // when the cancel lands, but that is not promised, because an auto-confirm may land first
  // (ADR-0012). Near a tier boundary the cancel may pay more than this, never less.
  const refund = actions.can_cancel
    ? minRefundForCancel({
        booking: { amount: parseMinor(b.amount_minor), feeBps: b.fee_bps ?? 0, tiers: b.tiers, checkinTs: b.checkin_ts },
        now: ctx.now,
      }).toString()
    : null;
  const bookingPda = b.booking_pda ?? "";
  return {
    id: b.id,
    status: b.status,
    hotel: {
      name: hotel.name,
      address: hotel.address,
      phone: hotel.phone,
      checkin_time: hotel.checkin_time,
      timezone: hotel.timezone,
    },
    room_type: { id: roomType.id, name: roomType.name },
    checkin_date: b.checkin_date,
    checkout_date: b.checkout_date,
    checkin_ts: b.checkin_ts,
    amount_minor: b.amount_minor,
    option_id: b.option_id,
    terms: {
      tiers: b.tiers.map((t) => ({ secs_before: t.secs_before, refund_bps: t.refund_bps })),
      text: termsText({ tiers: b.tiers, checkinTs: b.checkin_ts, releaseAfterTs: b.release_after_ts, timeZone: hotel.timezone }),
    },
    refund_if_cancel_now_minor: refund,
    ...actions,
    confirm_deadline_ts: b.confirm_deadline_ts,
    release_after_ts: b.release_after_ts,
    booking_pda: bookingPda,
    explorer: {
      booking: explorerUrl("address", bookingPda, ctx.cluster, ctx.rpcUrl),
      create_tx: b.create_sig ? explorerUrl("tx", b.create_sig, ctx.cluster, ctx.rpcUrl) : null,
      exit_tx: b.final_sig ? explorerUrl("tx", b.final_sig, ctx.cluster, ctx.rpcUrl) : null,
    },
    settled:
      b.refund_minor !== null && b.hotel_minor !== null && b.fee_minor !== null
        ? { refund_minor: b.refund_minor, hotel_minor: b.hotel_minor, fee_minor: b.fee_minor }
        : null,
    now: ctx.now,
  };
}
