import "server-only";
import { ApiError } from "../api/errors";
import { getDb } from "../db";
import { chain } from "../solana/context";
import { refreshRecord, viewOf } from "./lifecycle";
import { isTerminal, loadBookingRecord } from "./store";
import type { PublicBookingView } from "./view";

/**
 * The public view after re-reading the chain (and cranking release/void when due). Terminal
 * bookings are served from the DB unless `force` (POST …/refresh).
 */
export async function currentBookingView(id: string, { force }: { force: boolean }): Promise<PublicBookingView> {
  const db = getDb();
  const record = await loadBookingRecord(db, id);
  if (!record) throw new ApiError(404, "NOT_FOUND", "No such booking");
  const c = await chain();
  if (!force && isTerminal(record.booking.status)) {
    return viewOf(c, record, Math.floor(Date.now() / 1000));
  }
  const refreshed = await refreshRecord(c, db, record, { crank: true });
  return viewOf(c, refreshed.record, refreshed.now);
}
