import { dayNumber } from "@stumari/core";
import { z } from "zod";
import { bookingStatuses } from "../db/schema";

const date = z.string().refine(
  (v) => {
    try {
      dayNumber(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Use YYYY-MM-DD" },
);

/** GET /api/admin/bookings filters (empty strings, as a plain form sends them, mean "any"). */
export const adminBookingQuery = z.object({
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(bookingStatuses).optional()),
  hotel_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  checkin_from: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
  checkin_to: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
});
export type AdminBookingQuery = z.output<typeof adminBookingQuery>;

/** POST /api/admin/bookings/{id}/{action}; only `resolve` has a body. */
export const adminBookingAction = z.enum(["resolve", "void", "confirm", "release"]);
export const resolveRequest = z.object({ guest_bps: z.number().int().min(0).max(10_000) });
