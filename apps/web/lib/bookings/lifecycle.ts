import "server-only";
import { hexToBytes } from "@stumari/core";
import {
  buildConfirmTx,
  buildReleaseTx,
  buildVoidTx,
  EscrowTxError,
  fetchMaybeBooking,
  findBookingPda,
  sendBuiltTx,
  type BookingView as ChainBooking,
} from "@stumari/escrow-client";
import type { Db } from "../db/client";
import { hasConflicts, unitConflicts } from "../inventory/availability";
import { syncUnitIfStale } from "../inventory/ical-sync";
import { onchainConfig } from "../solana/chain-config";
import { chainNow } from "../solana/clock";
import type { Chain } from "../solana/context";
import { applyChainState, loadBookingRecord, recordSyncConflict, type SigField } from "./store";
import { publicBookingView, type BookingRecord, type BookingRow, type PublicBookingView } from "./view";

export const bookingPdaOf = (id: string) => findBookingPda(hexToBytes(id));

export async function fetchChainBooking(c: Chain, id: string): Promise<ChainBooking | null> {
  return fetchMaybeBooking(c.rpc, await bookingPdaOf(id));
}

export function viewOf(c: Chain, record: BookingRecord, now: number): PublicBookingView {
  return publicBookingView(record, { now, cluster: c.env.cluster, rpcUrl: c.env.rpcUrl });
}

/** Re-reads the chain and mirrors it into the DB. */
export async function syncFromChain(
  c: Chain,
  db: Db,
  row: BookingRow,
  sig?: { field: SigField; value: string },
): Promise<{ row: BookingRow; account: ChainBooking | null }> {
  const account = await fetchChainBooking(c, row.id);
  return { row: await applyChainState(db, row, account, sig), account };
}

const logCrankFailure = (what: string, id: string, e: unknown) => {
  // Another crank (cron, a parallel read) may have won the race: the next read shows its result.
  const reason = e instanceof EscrowTxError ? e.failure.name : e instanceof Error ? e.message : String(e);
  console.warn(`${what} of booking ${id} skipped: ${reason}`);
};

/**
 * Lazy crank (api.md): a confirmed booking past `release_after_ts` is released to the hotel, a
 * pending one past `confirm_deadline_ts` is voided (full refund). The operator only pays the fee.
 */
export async function crankIfDue(c: Chain, db: Db, row: BookingRow, account: ChainBooking | null, now: number): Promise<BookingRow> {
  if (!account) return row;
  const due =
    account.status === "confirmed" && BigInt(now) >= account.releaseAfterTs
      ? "release"
      : account.status === "pending" && BigInt(now) >= account.confirmDeadlineTs
        ? "void"
        : null;
  if (!due) return row;
  try {
    const config = (await onchainConfig(c.rpc)) ?? undefined;
    const built =
      due === "release"
        ? await buildReleaseTx({ rpc: c.rpc, operator: c.operator, booking: account, config })
        : await buildVoidTx({ rpc: c.rpc, operator: c.operator, booking: account, config });
    const { signature } = await sendBuiltTx(c.rpc, built);
    return (await syncFromChain(c, db, row, { field: "final_sig", value: signature })).row;
  } catch (e) {
    logCrankFailure(due, row.id, e);
    return row;
  }
}

/** Reads the booking from the chain, cranks it when due, and returns the refreshed record. */
export async function refreshRecord(c: Chain, db: Db, record: BookingRecord, { crank }: { crank: boolean }): Promise<{ record: BookingRecord; now: number }> {
  const now = await chainNow(c.rpc);
  const synced = await syncFromChain(c, db, record.booking);
  const booking = crank ? await crankIfDue(c, db, synced.row, synced.account, now) : synced.row;
  return { record: { ...record, booking }, now };
}

/**
 * inventory-ical.md "Confirmation": after a payment lands, re-sync the unit's imports; with no
 * overlap with a block or an earlier occupying booking, the operator confirms before the deadline.
 * A conflict leaves the booking pending and is logged once as `sync_conflict`.
 */
export async function autoConfirm(c: Chain, db: Db, bookingId: string): Promise<void> {
  const record = await loadBookingRecord(db, bookingId);
  if (!record) return;
  const now = await chainNow(c.rpc);
  const { row, account } = await syncFromChain(c, db, record.booking);
  if (!account || account.status !== "pending" || BigInt(now) >= account.confirmDeadlineTs) return;

  await syncUnitIfStale(db, row.room_id, 0);
  const conflicts = await unitConflicts(db, {
    roomId: row.room_id,
    stay: { checkin: row.checkin_date, checkout: row.checkout_date },
    now: Math.floor(Date.now() / 1000),
    bookingId: row.id,
    createdBefore: { createdAt: row.created_at },
  });
  if (hasConflicts(conflicts)) {
    await recordSyncConflict(db, row.id, { blocks: conflicts.blocks, bookings: conflicts.bookings });
    return;
  }
  try {
    const { signature } = await sendBuiltTx(c.rpc, await buildConfirmTx({ rpc: c.rpc, operator: c.operator, booking: account }));
    await syncFromChain(c, db, row, { field: "confirm_sig", value: signature });
  } catch (e) {
    logCrankFailure("confirm", row.id, e);
  }
}
