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
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { rooms } from "../db/schema";
import { hasConflicts, unitConflicts } from "../inventory/availability";
import { syncUnitIfStale } from "../inventory/ical-sync";
import { isMewsHotel } from "../inventory/mews";
import { mewsPort } from "../mews/client";
import { onchainConfig } from "../solana/chain-config";
import { chainNow } from "../solana/clock";
import type { Chain } from "../solana/context";
import { confirmRequestMessage, notifyTelegram } from "../telegram";
import { ensureMewsReservation, settleMewsAfterExit } from "./mews-sync";
import { applyChainState, loadBookingRecord, recordConfirmRequest, recordSyncConflict, type SigField } from "./store";
import { publicBookingView, type BookingRecord, type BookingRow, type PublicBookingView } from "./view";

export const bookingPdaOf = (id: string) => findBookingPda(hexToBytes(id));

export async function fetchChainBooking(c: Chain, id: string): Promise<ChainBooking | null> {
  return fetchMaybeBooking(c.rpc, await bookingPdaOf(id));
}

export function viewOf(c: Chain, record: BookingRecord, now: number): PublicBookingView {
  return publicBookingView(record, { now, cluster: c.env.cluster, rpcUrl: c.env.rpcUrl });
}

/**
 * Re-reads the chain and mirrors it into the DB. A cancelled or voided booking linked to a Mews
 * reservation gets that reservation cancelled (mews-inventory.md "Cancel"); the sync cron retries.
 */
export async function syncFromChain(
  c: Chain,
  db: Db,
  row: BookingRow,
  sig?: { field: SigField; value: string },
): Promise<{ row: BookingRow; account: ChainBooking | null }> {
  const account = await fetchChainBooking(c, row.id);
  const next = await applyChainState(db, row, account, sig);
  // The row may predate the Mews columns' latest writes, so settleMewsAfterExit reads them itself.
  if (next.status === "cancelled" || next.status === "voided") await settleMewsAfterExit(db, next.id, mewsPort);
  return { row: next, account };
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
 * A conflict leaves the booking pending and is logged once as `sync_conflict`. At a hotel in
 * `manual` confirm mode the server never confirms: it alerts the founders once (Telegram) so
 * someone enters the booking in the hotel's own system and confirms from the dashboard.
 */
async function requestManualConfirm(c: Chain, db: Db, record: BookingRecord, deadlineTs: number, conflict: boolean): Promise<void> {
  if (!(await recordConfirmRequest(db, record.booking.id, { deadline_ts: deadlineTs, conflict }))) return;
  const telegram = c.env.telegram;
  if (!telegram) {
    console.warn(`booking ${record.booking.id} waits for a manual confirm, but no Telegram chat is configured`);
    return;
  }
  const unit = await db.query.rooms.findFirst({ where: eq(rooms.id, record.booking.room_id), columns: { label: true } });
  await notifyTelegram(telegram, confirmRequestMessage(record, { unitLabel: unit?.label ?? null, deadlineTs, siteUrl: c.env.siteUrl, conflict }));
}

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
  const conflict = hasConflicts(conflicts);
  if (conflict) await recordSyncConflict(db, row.id, { blocks: conflicts.blocks, bookings: conflicts.bookings });
  if (isMewsHotel(record.hotel)) {
    if (!conflict) await confirmThroughMews(c, db, { ...record, booking: row }, account, now);
    return;
  }
  if (record.hotel.confirm_mode === "manual") {
    await requestManualConfirm(c, db, { ...record, booking: row }, Number(account.confirmDeadlineTs), conflict);
    return;
  }
  if (conflict) return;
  try {
    const { signature } = await sendBuiltTx(c.rpc, await buildConfirmTx({ rpc: c.rpc, operator: c.operator, booking: account }));
    await syncFromChain(c, db, row, { field: "confirm_sig", value: signature });
  } catch (e) {
    logCrankFailure("confirm", row.id, e);
  }
}

/**
 * Do not start a Mews confirm attempt this close to the confirm deadline (confirm_booking could miss
 * it). Longer than the attempt budget (mews-sync.ts MEWS_ATTEMPT_BUDGET_MS, 60 s), so an attempt that
 * starts just before the margin still leaves about a minute for confirm_booking.
 */
export const MEWS_CONFIRM_MARGIN_SECS = 120;

/**
 * Mews hotels (mews-inventory.md "Confirm"): create the Confirmed Mews reservation (at most one per
 * booking), then `confirm_booking`. No Mews availability, or a business-rule refusal of
 * `reservations/add` (minimum stay, closed to arrival, …) → admin `void_booking` right away (full
 * refund; the program lets the admin void a pending booking at any time). A transient Mews error
 * leaves the booking pending for the sync cron to retry until the deadline, after which the
 * permissionless void refunds the guest and cancels any reservation that was created.
 */
async function confirmThroughMews(c: Chain, db: Db, record: BookingRecord, account: ChainBooking, now: number): Promise<void> {
  const id = record.booking.id;
  if (BigInt(now) + BigInt(MEWS_CONFIRM_MARGIN_SECS) >= account.confirmDeadlineTs && !record.booking.mews_reservation_id) return;
  const outcome = await ensureMewsReservation(db, record, mewsPort());
  if (outcome.kind === "retry") {
    console.warn(`Mews reservation for booking ${id} not created yet (retrying until the deadline): ${outcome.reason}`);
    return;
  }
  if (outcome.kind === "unavailable") {
    await recordSyncConflict(db, id, { mews: { free: outcome.free, ...(outcome.refusal ? { refusal: outcome.refusal } : {}) } });
    // A Mews refusal while rooms look free may be a mapping or configuration mistake: make it loud.
    if (outcome.refusal) console.error(`Mews refused booking ${id} at hotel ${record.hotel.id} (voiding, full refund): ${outcome.refusal}`);
    try {
      const config = (await onchainConfig(c.rpc)) ?? undefined;
      const built = await buildVoidTx({ rpc: c.rpc, operator: c.operator, booking: account, config, authority: c.admin });
      const { signature } = await sendBuiltTx(c.rpc, built);
      await syncFromChain(c, db, record.booking, { field: "final_sig", value: signature });
    } catch (e) {
      logCrankFailure("void (no Mews availability)", id, e);
    }
    return;
  }
  try {
    const { signature } = await sendBuiltTx(c.rpc, await buildConfirmTx({ rpc: c.rpc, operator: c.operator, booking: account }));
    await syncFromChain(c, db, record.booking, { field: "confirm_sig", value: signature });
  } catch (e) {
    logCrankFailure("confirm", id, e);
  }
}
