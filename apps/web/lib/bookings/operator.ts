import "server-only";
import {
  buildConfirmTx,
  buildReleaseTx,
  buildResolveTx,
  buildVoidTx,
  sendBuiltTx,
  type BookingView as ChainBooking,
  type BuiltTx,
} from "@stumari/escrow-client";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { dueBookings } from "../dashboard/bookings";
import { onchainConfig } from "../solana/chain-config";
import { chainNow } from "../solana/clock";
import type { Chain } from "../solana/context";
import { crankIfDue, syncFromChain } from "./lifecycle";
import { loadBookingRecord } from "./store";
import type { BookingRow } from "./view";

/** Actions our keys sign (dashboard confirm; admin confirm / void / release / resolve). */
export type OperatorAction = "confirm" | "void" | "release" | "resolve";

const notAllowed = (reason: string, message: string) => new ApiError(409, "NOT_ALLOWED", message, { body: { reason } });

/** The program's rules for each operator action (escrow-program.md "Status machine"), by the chain clock. */
export function assertOperatorAllowed(action: OperatorAction, account: Pick<ChainBooking, "status" | "confirmDeadlineTs" | "releaseAfterTs">, now: bigint): void {
  const { status } = account;
  switch (action) {
    case "confirm":
      if (status !== "pending") throw notAllowed("STATUS", `A ${status} booking cannot be confirmed`);
      if (now >= account.confirmDeadlineTs) throw notAllowed("TOO_LATE", "The confirm window has closed; the booking can only be voided");
      return;
    case "void":
      // The admin may void a pending booking at any time (full refund).
      if (status !== "pending") throw notAllowed("STATUS", `Only an unconfirmed booking can be voided, this one is ${status}`);
      return;
    case "release":
      if (status !== "confirmed") throw notAllowed("STATUS", `A ${status} booking cannot be released`);
      if (now < account.releaseAfterTs) throw notAllowed("TOO_EARLY", "The payout is not due yet");
      return;
    case "resolve":
      if (status !== "disputed") throw notAllowed("STATUS", `Only a disputed booking can be resolved, this one is ${status}`);
      return;
  }
}

const SIG_FIELD = { confirm: "confirm_sig", void: "final_sig", release: "final_sig", resolve: "final_sig" } as const;

/**
 * Sends one operator/admin transaction for a booking and mirrors the result. `hotelId` scopes the
 * booking to a dashboard (another hotel's booking is "not found"); `guestBps` is the resolve split.
 */
export async function operatorAction(
  c: Chain,
  db: Db,
  bookingId: string,
  action: OperatorAction,
  opts: { hotelId?: string; guestBps?: number } = {},
): Promise<BookingRow> {
  const record = await loadBookingRecord(db, bookingId);
  if (!record || (opts.hotelId !== undefined && record.booking.hotel_id !== opts.hotelId)) {
    throw new ApiError(404, "NOT_FOUND", "No such booking");
  }
  const { row, account } = await syncFromChain(c, db, record.booking);
  if (!account) throw notAllowed("NOT_ON_CHAIN", "This booking has not been paid");
  assertOperatorAllowed(action, account, BigInt(await chainNow(c.rpc)));

  const ctx = { rpc: c.rpc, operator: c.operator, booking: account };
  const config = (await onchainConfig(c.rpc)) ?? undefined;
  let built: BuiltTx;
  if (action === "confirm") built = await buildConfirmTx(ctx);
  else if (action === "void") built = await buildVoidTx({ ...ctx, config, authority: c.admin });
  else if (action === "release") built = await buildReleaseTx({ ...ctx, config });
  else built = await buildResolveTx({ ...ctx, config, admin: c.admin, guestBps: opts.guestBps ?? 0 });

  const { signature } = await sendBuiltTx(c.rpc, built);
  return (await syncFromChain(c, db, row, { field: SIG_FIELD[action], value: signature })).row;
}

/** Lazy crank for a hotel's dashboard: release / void what is due (at most `limit`). */
export async function crankHotel(c: Chain, db: Db, hotelId: string, limit = 5): Promise<void> {
  const now = await chainNow(c.rpc);
  for (const due of await dueBookings(db, hotelId, now, limit)) {
    const { row, account } = await syncFromChain(c, db, due);
    await crankIfDue(c, db, row, account, now);
  }
}
