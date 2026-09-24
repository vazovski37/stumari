import { randomUUID } from "node:crypto";
import type { BuiltTx } from "@stumari/escrow-client";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { builtTxs } from "../db/schema";

export type BuiltTxRow = typeof builtTxs.$inferSelect;
export type BuiltTxAction = BuiltTxRow["action"];

/**
 * `built_txs` is both the cache of `(booking, action)` → bytes and the allow-list of
 * `/api/tx/send` (api.md). A blockhash lives ~150 blocks (≈ 60–90 s); the row outlives it a
 * little so a slow wallet's signature still reaches the relay, which reports the expiry itself.
 */
export const BUILT_TX_TTL_SECS = 120;
/** A cached transaction is handed out again only while this many blocks of life remain. */
export const REUSE_MIN_BLOCKS = 60n;

export async function saveBuiltTx(
  db: Db,
  row: { bookingId: string; quoteId: string | null; action: BuiltTxAction; built: BuiltTx; now: number },
): Promise<void> {
  await db.insert(builtTxs).values({
    id: randomUUID(),
    booking_id: row.bookingId,
    quote_id: row.quoteId,
    action: row.action,
    message_hash: row.built.messageHashHex,
    tx_base64: row.built.txBase64,
    last_valid_block_height: Number(row.built.lastValidBlockHeight),
    expires_at: row.now + BUILT_TX_TTL_SECS,
    created_at: row.now,
  });
}

/** The newest unexpired transaction for `(booking, action)`, if its blockhash has enough life left. */
export async function reusableTx(
  db: Db,
  bookingId: string,
  action: BuiltTxAction,
  now: number,
  blockHeight: () => Promise<bigint>,
): Promise<BuiltTxRow | null> {
  const [row] = await db
    .select()
    .from(builtTxs)
    .where(and(eq(builtTxs.booking_id, bookingId), eq(builtTxs.action, action), gt(builtTxs.expires_at, now)))
    .orderBy(desc(builtTxs.created_at))
    .limit(1);
  if (!row) return null;
  return BigInt(row.last_valid_block_height) - (await blockHeight()) >= REUSE_MIN_BLOCKS ? row : null;
}

/** Drops cached transactions for `(booking, action)` (the payer or option changed). */
export async function discardBuiltTxs(db: Db, bookingId: string, action: BuiltTxAction): Promise<void> {
  await db.delete(builtTxs).where(and(eq(builtTxs.booking_id, bookingId), eq(builtTxs.action, action)));
}

/** The allow-list lookup of `/api/tx/send`. */
export async function allowedTx(db: Db, messageHashHex: string, now: number): Promise<BuiltTxRow | null> {
  const [row] = await db
    .select()
    .from(builtTxs)
    .where(and(eq(builtTxs.message_hash, messageHashHex), gt(builtTxs.expires_at, now)))
    .limit(1);
  return row ?? null;
}
