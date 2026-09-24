import { CoreError } from "./errors";
import { toI64 } from "./int";
import { assertU64, BPS_DENOM, mulBpsFloor } from "./money";
import { refundBpsFor, type Tier } from "./tiers";

/** Mirrors `BookingStatus` in the program (lowercased; numeric values in `BOOKING_STATUS_CODES`). */
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "released" | "disputed" | "resolved" | "voided";

export const BOOKING_STATUS_CODES: Readonly<Record<BookingStatus, number>> = {
  pending: 0,
  confirmed: 1,
  cancelled: 2,
  released: 3,
  disputed: 4,
  resolved: 5,
  voided: 6,
};

/** How an escrowed amount is divided on exit. Invariant: refund + hotelNet + fee == amount. */
export interface Split {
  refund: bigint;
  hotelNet: bigint;
  fee: bigint;
}

export interface CancelSplit extends Split {
  secsBefore: bigint;
  refundBps: number;
}

export interface CancelInput {
  status: BookingStatus;
  amount: bigint;
  feeBps: number;
  tiers: readonly Tier[];
  checkinTs: bigint | number;
  now: bigint | number;
}

/** Seconds before `now` at which the server evaluates the refund it promises (escrow-program.md). */
export const MIN_REFUND_LEAD_SECS = 90n;

function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOM) {
    throw new CoreError("InvalidBps", `bps must be an integer in 0..=${BPS_DENOM}, got ${bps}`);
  }
}

/** refund = ⌊amount·refund_bps/10⁴⌋; fee = ⌊(amount − refund)·fee_bps/10⁴⌋; dust goes to the hotel. */
function split(amount: bigint, refundBps: number, feeBps: number): Split {
  assertBps(refundBps);
  assertBps(feeBps);
  assertU64(amount);
  const refund = mulBpsFloor(amount, refundBps);
  const fee = mulBpsFloor(amount - refund, feeBps);
  return { refund, hotelNet: amount - refund - fee, fee };
}

/** `cancel_booking`: Pending refunds 100%, Confirmed follows its tiers; only before check-in. */
export function splitCancel({ status, amount, feeBps, tiers, checkinTs, now }: CancelInput): CancelSplit {
  if (status !== "pending" && status !== "confirmed") {
    throw new CoreError("InvalidStatus", `cannot cancel a ${status} booking`);
  }
  const checkin = toI64(checkinTs, "checkin_ts");
  const nowTs = toI64(now, "now");
  if (nowTs >= checkin) throw new CoreError("TooLateToCancel", "check-in time has passed");
  const secsBefore = toI64(checkin - nowTs, "secs_before");
  const refundBps = status === "pending" ? BPS_DENOM : refundBpsFor(tiers, secsBefore);
  return { secsBefore, refundBps, ...split(amount, refundBps, feeBps) };
}

/** `release`: everything to the hotel minus the snapshotted fee. */
export function splitRelease({ amount, feeBps }: { amount: bigint; feeBps: number }): Split {
  return split(amount, 0, feeBps);
}

/** `resolve_dispute(guest_bps)`: the arbiter's split, fee only on the hotel's share. */
export function splitResolve({ amount, feeBps, guestBps }: { amount: bigint; feeBps: number; guestBps: number }): Split {
  return split(amount, guestBps, feeBps);
}

export interface CancellableBooking {
  amount: bigint;
  feeBps: number;
  tiers: readonly Tier[];
  checkinTs: bigint | number;
}

/**
 * The `min_refund` argument for `cancel_booking`: the refund by the booking's **tier schedule**
 * at now + 90 s (never the Pending 100%), so a confirm or a tier boundary landing between
 * building and sending cannot cut what the guest was shown. Past check-in the cancel itself
 * would fail, so this throws `TooLateToCancel`; inside the last 90 s the last tier applies.
 */
export function minRefundForCancel({ booking, now }: { booking: CancellableBooking; now: bigint | number }): bigint {
  const checkin = toI64(booking.checkinTs, "checkin_ts");
  const nowTs = toI64(now, "now");
  if (nowTs >= checkin) throw new CoreError("TooLateToCancel", "check-in time has passed");
  const later = checkin - nowTs - MIN_REFUND_LEAD_SECS;
  const refundBps = refundBpsFor(booking.tiers, later > 0n ? later : 0n);
  return split(booking.amount, refundBps, booking.feeBps).refund;
}
