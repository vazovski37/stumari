/**
 * Mews Connector API from the command line (demo environment by default):
 *   pnpm --filter @stumari/scripts mews setup
 *   pnpm --filter @stumari/scripts mews availability --from 2026-10-28 [--to 2026-10-31] [--room-type Double]
 *   pnpm --filter @stumari/scripts mews price --from 2026-10-28 --to 2026-10-30 [--room-type ..] [--rate ..] [--adults 2] [--children 0]
 *   pnpm --filter @stumari/scripts mews book  --from .. --to .. --name "Test Stumari" [--room-type ..] [--rate ..] [--adults 2] [--notes ".."] [--state Confirmed|Optional]
 *   pnpm --filter @stumari/scripts mews show --id <reservationId>
 *   pnpm --filter @stumari/scripts mews cancel --id <reservationId> [--notes ".."]
 * Global: --service <serviceId> (default: the property's accommodation service).
 * Env: MEWS_PLATFORM_URL (default https://api.mews-demo.com), MEWS_CLIENT_TOKEN, MEWS_ACCESS_TOKEN,
 * MEWS_CLIENT (default "Stumari 0.1.0"); anything but the demo host needs MEWS_ALLOW_PRODUCTION=1 (or true).
 * Dates are YYYY-MM-DD in the Mews enterprise timezone. Tokens are never printed.
 */
import { parseArgs } from "node:util";
import {
  MewsClient,
  MewsError,
  addDays,
  configFromEnv,
  localDate,
  nightsBetween,
  type MewsRate,
  type MewsRoomType,
  type MewsSetup,
} from "../packages/mews-client/src/index";
import { loadEnv } from "./lib/env";

const USAGE = `usage: mews <setup|availability|price|book|show|cancel> [flags]
  --from YYYY-MM-DD  --to YYYY-MM-DD  --room-type <id|name>  --rate <id|name>
  --adults N  --children N  --name "First Last"  --notes "..."  --state Confirmed|Optional
  --id <reservationId>  --service <serviceId>`;

function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(cells[0]!), line(widths.map((w) => "-".repeat(w))), ...cells.slice(1).map(line)].join("\n");
}


function pick<T extends { id: string; name: string }>(kind: string, list: T[], query: string | undefined, fallback: T | undefined): T {
  if (query === undefined) {
    if (!fallback) throw new Error(`no ${kind} available`);
    return fallback;
  }
  const q = query.toLowerCase();
  const exact = list.find((x) => x.id === query) ?? list.filter((x) => x.name.toLowerCase() === q)[0];
  if (exact) return exact;
  const partial = list.filter((x) => x.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0]!;
  const names = list.map((x) => `"${x.name}"`).join(", ");
  throw new Error(partial.length > 1 ? `--${kind} "${query}" is ambiguous (${names})` : `no ${kind} matches "${query}" (${names})`);
}

function intFlag(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`--${name} must be a non-negative integer`);
  return Number(value);
}

function describeStay(setup: MewsSetup, room: MewsRoomType, rate: MewsRate, from: string, to: string, adults: number, children: number) {
  const n = nightsBetween(from, to);
  return `${room.name} · ${rate.name} · ${from} → ${to} (${n} night${n === 1 ? "" : "s"}) · ${adults} adult${adults === 1 ? "" : "s"}${children ? ` + ${children} child${children === 1 ? "" : "ren"}` : ""} · ${setup.timeZone}`;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      "room-type": { type: "string" },
      rate: { type: "string" },
      adults: { type: "string" },
      children: { type: "string" },
      name: { type: "string" },
      notes: { type: "string" },
      state: { type: "string" },
      id: { type: "string" },
      service: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }
  const commands = ["setup", "availability", "price", "book", "show", "cancel"];
  if (!commands.includes(command)) throw new Error(`unknown command "${command}"\n${USAGE}`);

  const config = configFromEnv(loadEnv());
  const client = new MewsClient(config);
  const env = new URL(config.platformUrl).host;
  console.log(`mews: ${env}${client.transport.isProduction ? "  ** PRODUCTION **" : " (demo)"}`);

  if (command === "show" || command === "cancel") {
    if (!values.id) throw new Error(`${command} needs --id <reservationId>`);
    if (command === "cancel") {
      await client.cancelReservation(values.id, values.notes ?? "Cancelled via Stumari (booking refunded)");
      console.log(`cancelled ${values.id} (no cancellation fee, no email)`);
    }
    const found = await client.getReservations([values.id]);
    if (found.length === 0) throw new Error(`reservation ${values.id} not found`);
    console.log(
      table(
        ["reservation", "number", "state", "start (UTC)", "end (UTC)", "cancelled (UTC)"],
        found.map((r) => [r.id, r.number ?? "", r.state, r.scheduledStartUtc ?? "", r.scheduledEndUtc ?? "", r.cancelledUtc ?? ""]),
      ),
    );
    return;
  }

  const setup = await client.getSetup(values.service ? { serviceId: values.service } : {});
  if (command === "setup") {
    console.log(`enterprise: ${setup.enterpriseName} (${setup.enterpriseId})`);
    console.log(`timezone:   ${setup.timeZone}    currency: ${setup.currency ?? "?"}`);
    console.log(`service:    ${setup.serviceName} (${setup.serviceId})  start ${setup.startOffset}  end ${setup.endOffset}`);
    const others = setup.bookableServices.filter((s) => s.id !== setup.serviceId);
    if (others.length > 0) {
      const shown = others.slice(0, 5).map((s) => `${s.name} (${s.id})`);
      const more = others.length > 5 ? `, … ${others.length - 5} more` : "";
      console.log(`other bookable services (--service <id>): ${shown.join(", ")}${more}`);
    }
    console.log(`\nroom types (${setup.roomTypes.length}):`);
    console.log(
      table(
        ["id", "name", "type", "capacity"],
        setup.roomTypes.map((r) => [r.id, r.name, r.type, `${r.capacity ?? "?"}${r.extraCapacity ? `+${r.extraCapacity}` : ""}`]),
      ),
    );
    console.log(`\nrates (${setup.rates.length}):`);
    console.log(
      table(
        ["id", "name", "type", "default"],
        setup.rates.map((r) => [r.id, r.name, r.type, r.isDefault ? "yes" : ""]),
      ),
    );
    console.log(`\nage categories:`);
    console.log(table(["id", "name", "classification"], setup.ageCategories.map((a) => [a.id, a.name, a.classification])));
    return;
  }

  const today = localDate(Math.floor(Date.now() / 1000), setup.timeZone);
  const from = values.from ?? addDays(today, 30);
  const to = values.to ?? addDays(from, command === "availability" ? 7 : 1);

  if (command === "availability") {
    const av = await client.getAvailability(setup, from, to);
    const names = new Map(setup.roomTypes.map((r) => [r.id, r.name]));
    const only = values["room-type"] ? pick("room-type", setup.roomTypes, values["room-type"], undefined).id : undefined;
    const rows = av.roomTypes
      .filter((r) => (only ? r.roomTypeId === only : names.has(r.roomTypeId)))
      .map((r) => [names.get(r.roomTypeId) ?? r.roomTypeId, ...r.raw, Math.max(0, Math.min(...r.raw))]);
    console.log(`free units per night (${setup.timeZone}); negative = overbooked; min = bookable for the whole range`);
    console.log(table(["room type", ...av.nights.map((d) => d.slice(5)), "min"], rows));
    return;
  }

  const room = pick("room-type", setup.roomTypes, values["room-type"], setup.roomTypes[0]);
  const rate = pick("rate", setup.rates, values.rate, setup.rates[0]);
  const adults = intFlag("adults", values.adults, 2);
  const children = intFlag("children", values.children, 0);
  const stay = { roomTypeId: room.id, rateId: rate.id, checkin: from, checkout: to, adults, children };
  console.log(describeStay(setup, room, rate, from, to, adults, children));

  if (command === "price") {
    const total = await client.price(setup, stay);
    console.log(table(["currency", "gross (incl. tax)", "net"], [[total.currency, total.gross, total.net]]));
    return;
  }

  // book
  const fullName = values.name?.trim();
  if (!fullName) throw new Error(`book needs --name "First Last"${client.transport.isProduction ? "" : " (demo: fake data only, e.g. \"Test Stumari\")"}`);
  const parts = fullName.split(/\s+/);
  const guestLastName = parts.pop()!;
  const guestFirstName = parts.join(" ") || undefined;
  const state = (values.state ?? "Confirmed") as "Confirmed" | "Optional";
  if (state !== "Confirmed" && state !== "Optional") throw new Error("--state must be Confirmed or Optional");
  const notes = values.notes ?? "Stumari demo — prepaid in USDC (test)";
  const created = await client.createReservation(setup, { ...stay, guestFirstName, guestLastName, notes, state });
  console.log(
    table(
      ["reservation", "number", "state", "customer", "start (UTC)", "end (UTC)"],
      [[created.reservationId, created.number ?? "", created.state, created.customerId, created.startUtc, created.endUtc]],
    ),
  );
  console.log(`notes: ${notes}`);
}

main().catch((error: unknown) => {
  const msg = error instanceof MewsError || error instanceof Error ? error.message : String(error);
  console.error(`mews failed: ${msg}`);
  process.exit(1);
});
