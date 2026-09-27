/**
 * DEMO-only smoke test of the web app's Mews inventory integration (docs/architecture/mews-inventory.md)
 * against the public Mews demo environment, on a throwaway SQLite database. No chain involved.
 *
 *   MEWS_CLIENT_TOKEN=… MEWS_ACCESS_TOKEN=… \
 *     pnpm --filter web exec tsx scripts/mews-smoke.ts [--room-type "Double Room"]
 *
 * Steps: "Test Mews connection" report → free units for a 2-night stay → reserve (fake guest
 * "Test Stumari") → re-run (must not create a second reservation) → a second booking whose
 * `reservations/add` answer was "lost" is recovered by customer → both are cancelled as after a
 * void. Refuses anything but api.mews-demo.com. Never prints tokens.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { addDays, localDate } from "@stumari/core";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, type Db } from "../lib/db/client";
import { bookings, DEFAULT_HOTEL_POLICY, hotels, quotes, rooms, roomTypes } from "../lib/db/schema";
import type { MewsPort } from "../lib/mews/client";

// Next resolves `server-only` at build time; outside Next it is the same no-op stub the tests use.
const stub = resolve(__dirname, "../test/server-only-stub.ts");
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? stub : resolveFilename.call(this, request, ...rest);
};

const { values } = parseArgs({ options: { "room-type": { type: "string", default: "Double Room" } } });

async function main() {
  const { serverEnv } = await import("../lib/env");
  const { mewsPort } = await import("../lib/mews/client");
  const env = serverEnv();
  if (!env.mews) throw new Error("set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN (demo tokens from docs.mews.com → Environments)");
  if (env.mews.production) throw new Error("this smoke test runs against the Mews demo environment only");
  const port = mewsPort()!;
  const dir = mkdtempSync(join(tmpdir(), "stumari-mews-smoke-"));
  const db = createDb(`file:${join(dir, "smoke.db")}`);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await run(db, port);
  } finally {
    db.$client.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold the file a moment longer */
    }
  }
}

async function run(db: Db, port: MewsPort) {
  const { testMewsConnection } = await import("../lib/admin/mews");
  const { ensureMewsReservation, settleMewsAfterExit } = await import("../lib/bookings/mews-sync");
  const { loadBookingRecord } = await import("../lib/bookings/store");
  const { checkMewsStay } = await import("../lib/inventory/mews");
  const { stumariReservationNotes } = await import("../lib/mews/client");
  const now = Math.floor(Date.now() / 1000);
  const setup = await port.getSetup();
  const mewsType = setup.roomTypes.find((r) => r.name === values["room-type"]) ?? setup.roomTypes[0]!;
  const rate = setup.rates[0]!;
  console.log(`mews: ${port.host} (demo) · ${setup.enterpriseName} · ${setup.timeZone} · service ${setup.serviceName}`);
  console.log(`mapping: room type ${mewsType.name} (${mewsType.id}) · rate ${rate.name} (${rate.id})`);

  // A hotel mapped to the demo property, one room type with two virtual slots.
  const hotelId = randomUUID();
  const rtId = randomUUID();
  const units = [randomUUID(), randomUUID()];
  await db.insert(hotels).values({
    id: hotelId,
    slug: "mews-smoke",
    name: "Mews smoke hotel",
    timezone: setup.timeZone,
    status: "active",
    policy: DEFAULT_HOTEL_POLICY,
    inventory_provider: "mews",
    mews_service_id: setup.serviceId,
    mews_rate_id: rate.id,
    onchain_hotel: "11111111111111111111111111111111",
    created_at: now,
    updated_at: now,
  });
  await db.insert(roomTypes).values({ id: rtId, hotel_id: hotelId, name: mewsType.name, base_rate_minor: "65000000", mews_room_type_id: mewsType.id, created_at: now });
  await db.insert(rooms).values(units.map((id, i) => ({ id, room_type_id: rtId, label: `M${i + 1}`, export_token: randomBytes(32).toString("hex") })));

  const hotel = (await db.query.hotels.findFirst({ where: eq(hotels.id, hotelId) }))!;
  const roomType = (await db.query.roomTypes.findFirst({ where: eq(roomTypes.id, rtId) }))!;

  const report = await testMewsConnection(db, hotel, port, now);
  console.log(`\nTest Mews connection: ${report.environment} ${report.host}, timezone matches: ${report.timezone_matches}`);
  console.log(`  problems: ${report.problems.length === 0 ? "none" : report.problems.join("; ")}`);
  for (const rt of report.room_types) console.log(`  ${rt.name} → ${rt.mews_name}: ${report.nights.map((n, i) => `${n.slice(5)} ${rt.free?.[i] ?? "–"}`).join(" · ")}`);

  // First 2-night stay ≥ 30 days out with at least 2 free units (two bookings below).
  let found: { checkin: string; checkout: string } | null = null;
  const today = localDate(now, hotel.timezone);
  for (let d = 30; d < 90 && !found; d += 1) {
    const candidate = { checkin: addDays(today, d), checkout: addDays(today, d + 2) };
    if ((await checkMewsStay(db, port, hotel, roomType, candidate, now)).free >= 2) found = candidate;
  }
  if (!found) throw new Error("no 2-night stay with 2 free units in the next 90 days");
  const stay = found;
  const before = await checkMewsStay(db, port, hotel, roomType, stay, now);
  console.log(`\nstay ${stay.checkin} → ${stay.checkout}: Mews free ${before.free}, Stumari claims not in Mews ${before.claims}`);

  const booking = async (unit: string) => {
    const id = randomBytes(16).toString("hex");
    const quoteId = randomUUID();
    await db.insert(quotes).values({
      id: quoteId,
      hotel_id: hotelId,
      room_type_id: rtId,
      room_id: unit,
      checkin_date: stay.checkin,
      checkout_date: stay.checkout,
      body: { adults: 2, children: 0 },
      signature: "sig",
      hash: "hash",
      booking_id: id,
      client_id: "smoke",
      status: "used",
      expires_at: now + 600,
      created_at: now,
    });
    await db.insert(bookings).values({
      id,
      quote_id: quoteId,
      option_index: 0,
      option_id: "standard",
      hotel_id: hotelId,
      room_type_id: rtId,
      room_id: unit,
      guest_wallet: "5BF9MezdLaLG2LRNWMnuEp8q53dW7cReMVcDFSKs5NDv",
      guest_name: "Test Stumari",
      checkin_date: stay.checkin,
      checkout_date: stay.checkout,
      checkin_ts: now + 30 * 86_400,
      checkout_ts: now + 32 * 86_400,
      amount_minor: "130000000",
      tiers: [{ secs_before: 0, refund_bps: 0 }],
      status: "pending",
      create_sig: "5SmokeCreateSig",
      created_at: now,
      updated_at: now,
    });
    return id;
  };

  // 1. Reserve, then re-run: exactly one reservation.
  const a = await booking(units[0]!);
  const first = await ensureMewsReservation(db, (await loadBookingRecord(db, a))!, port);
  const again = await ensureMewsReservation(db, (await loadBookingRecord(db, a))!, port);
  const rowA = (await db.query.bookings.findFirst({ where: eq(bookings.id, a) }))!;
  const listed = await untilListed(port, rowA.mews_customer_id!);
  const ofA = listed.list;
  console.log(`\nbooking A ${a}: ${JSON.stringify(first)} · re-run ${JSON.stringify(again)}`);
  console.log(`  listed by customer after ${listed.secs} s`);
  console.log(`  customer ${rowA.mews_customer_id}: ${ofA.map((r) => `${r.id} #${r.number} ${r.state} ${r.scheduledStartUtc} → ${r.scheduledEndUtc}`).join(", ")}`);
  const afterA = await checkMewsStay(db, port, hotel, roomType, stay, now);
  console.log(`  Mews free now ${afterA.free} (was ${before.free}), Stumari claims not in Mews ${afterA.claims}`);

  // 2. A reservations/add whose answer was lost: customer stored, reservation id not; recovered by customer.
  const b = await booking(units[1]!);
  const customerB = await port.addCustomer({ firstName: "Test", lastName: "Stumari" });
  await db.update(bookings).set({ mews_customer_id: customerB }).where(eq(bookings.id, b));
  const lost = await port.addReservation(setup, customerB, {
    roomTypeId: mewsType.id,
    rateId: rate.id,
    ...stay,
    adults: 2,
    children: 0,
    notes: stumariReservationNotes({ bookingId: b, txSig: "5SmokeCreateSig" }),
  });
  // As after an ambiguous failure: the cool-down lets Mews list it by customer before the retry.
  const listedB = await untilListed(port, customerB);
  const recovered = await ensureMewsReservation(db, (await loadBookingRecord(db, b))!, port);
  const ofB = await port.reservationsOfCustomer(customerB);
  console.log(`  listed by customer after ${listedB.secs} s`);
  console.log(`\nbooking B ${b}: created ${lost.reservationId} out of band · ensure → ${JSON.stringify(recovered)} · customer has ${ofB.length} reservation(s)`);

  // 3. Void both on "chain" (status only): the Mews reservations are cancelled, no fee, no email.
  await db.update(bookings).set({ status: "voided" }).where(eq(bookings.id, a));
  await db.update(bookings).set({ status: "voided" }).where(eq(bookings.id, b));
  for (const [name, id] of [["A", a], ["B", b]] as const) {
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await settleMewsAfterExit(db, id, () => port);
      results.push(r);
      if (r !== "failed") break;
      await new Promise((done) => setTimeout(done, 3_000)); // the sync cron's retry, compressed
    }
    const again = await settleMewsAfterExit(db, id, () => port);
    console.log(`settle ${name}: ${results.join(" -> ")}, again: ${again}`);
  }
  await new Promise((done) => setTimeout(done, 3_000)); // listings lag writes by a second or two
  for (const [name, customer] of [["A", rowA.mews_customer_id!], ["B", customerB]] as const) {
    const list = await port.reservationsOfCustomer(customer);
    console.log(`  ${name}: ${list.map((r) => `${r.id} ${r.state} cancelled ${r.cancelledUtc}`).join(", ")}`);
  }
  const end = await checkMewsStay(db, port, hotel, roomType, stay, now);
  console.log(`  Mews free after cancel ${end.free} (started at ${before.free})`);
}

/** Polls `reservations/getAll` by customer until it lists something (at most 60 s). */
async function untilListed(port: MewsPort, customerId: string) {
  const start = Date.now();
  for (;;) {
    const list = await port.reservationsOfCustomer(customerId);
    if (list.length > 0 || Date.now() - start > 60_000) return { list, secs: Math.round((Date.now() - start) / 1000) };
    await new Promise((done) => setTimeout(done, 1_000));
  }
}

main().catch((e: unknown) => {
  console.error(`mews smoke failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
