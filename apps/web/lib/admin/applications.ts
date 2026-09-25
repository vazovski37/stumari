import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { applicationStatuses } from "../application-fields";
import { applications, hotels } from "../db/schema";
import { createHotel, type HotelRow } from "./hotels";

export type ApplicationRow = typeof applications.$inferSelect;

export const applicationPatch = z
  .object({
    status: z.enum(applicationStatuses).optional(),
    notes: z.string().trim().max(4_000).nullish(),
  })
  .refine((p) => p.status !== undefined || p.notes !== undefined, { message: "Nothing to change" });

/** Applications, newest first, with the draft hotel each one was converted into. */
export async function listApplications(db: Db, status?: ApplicationRow["status"]) {
  const rows = await db
    .select({ application: applications, hotelId: hotels.id })
    .from(applications)
    .leftJoin(hotels, eq(hotels.application_id, applications.id))
    .where(status ? eq(applications.status, status) : undefined)
    .orderBy(desc(applications.created_at));
  return rows.map((r) => ({ ...r.application, hotel_id: r.hotelId }));
}

export async function patchApplication(db: Db, id: string, patch: z.output<typeof applicationPatch>): Promise<ApplicationRow> {
  const changes = {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
  };
  const [row] = await db.update(applications).set(changes).where(eq(applications.id, id)).returning();
  if (!row) throw new ApiError(404, "NOT_FOUND", "No such application");
  return row;
}

/** A draft hotel prefilled from the application (onboarding step "convert"); once per application. */
export async function convertApplication(db: Db, id: string, now: number): Promise<HotelRow> {
  const app = await db.query.applications.findFirst({ where: eq(applications.id, id) });
  if (!app) throw new ApiError(404, "NOT_FOUND", "No such application");
  const existing = await db.query.hotels.findFirst({ where: eq(hotels.application_id, id), columns: { id: true } });
  if (existing) {
    throw new ApiError(409, "ALREADY_CONVERTED", "This application already has a hotel", { body: { hotel_id: existing.id } });
  }
  return createHotel(
    db,
    {
      name: app.hotel_name,
      city: app.city,
      phone: app.phone,
      contact_email: app.email,
      contact_telegram: app.telegram,
      application_id: app.id,
    },
    now,
  );
}
