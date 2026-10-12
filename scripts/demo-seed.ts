/**
 * Seeds the LOCAL demo for a screen recording with real bookings on the local chain. Every booking
 * goes through the public API and the escrow program, exactly like the checkout page; nothing is
 * written to the database by hand, so every status and Explorer link in the recording is real.
 *
 *   Guest B  a same-day stay, released to the hotel 2 minutes after check-in (a repeat guest for the
 *            "two guests, different prices" beat, and the payout beat)
 *   Guest C  a confirmed Flexible stay next week
 *   Guest D  a Standard stay 5 days out, cancelled: the refund by schedule
 *
 * For the same-day stay the hotel's check-in time is moved a few minutes ahead and put back right
 * after payment (docs/submission/demo-video-script.md, "Release beat"); the chain clock is never moved,
 * so new quotes keep working.
 *
 * Writes onchain/keys/demo-browser-wallets.txt (gitignored): console lines that load Guest B and the
 * demo hotel's payout wallet into a browser's Test wallet. Localnet test keys only.
 *
 *   pnpm --filter @stumari/scripts demo-seed [--url http://localhost:3210]
 *
 * Localnet only, after `bootstrap --cluster localnet`, with the web app running at --url (default
 * NEXT_PUBLIC_SITE_URL). Re-running skips Guest B once it has a released stay.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateKeyPairSigner } from "@solana/kit";
import { addDays, formatUsdc, localDate, parseMinor, type QuoteEnvelope } from "@stumari/core";
import { Guest, type BookingView } from "./e2e/guest";
import { Http } from "./e2e/http";
import { sleep } from "./e2e/steps";
import { signIn } from "./e2e/wallet";
import { configuredCluster } from "./lib/cluster";
import { DEMO_SLUG } from "./lib/demo";
import { loadEnv } from "./lib/env";
import { loadKeyFile, loadOperator, loadOrCreateKey } from "./lib/keys";
import { KEYS_DIR, keyPath } from "./lib/paths";

interface AdminHotel {
  id: string;
  slug: string;
  timezone: string;
  checkin_time: string;
}

interface Profile {
  room_types: { id: string; name: string }[];
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** HH:MM and YYYY-MM-DD in the hotel's timezone, `secs` from now, rounded up to the next minute. */
function wallClock(nowSecs: number, tz: string) {
  const at = Math.ceil(nowSecs / 60) * 60;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(at * 1000),
  );
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { hhmm: `${get("hour")}:${get("minute")}`, date: localDate(at, tz) };
}

async function main() {
  // pnpm forwards a literal "--" before the script's own flags.
  const { values } = parseArgs({ args: process.argv.slice(2).filter((a) => a !== "--"), options: { url: { type: "string" } } });
  const env = loadEnv();
  const { cluster } = configuredCluster(env);
  assert.equal(cluster, "localnet", "demo-seed runs on localnet only (STUMARI_CLUSTER=localnet)");
  const url = (values.url ?? env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000").replace(/\/$/, "");

  const pub = await new Http(url, "public").ok<{ cluster: string; demo_mode: boolean }>("GET", "/api/config/public");
  assert.equal(pub.cluster, "localnet", `${url} is not serving localnet`);
  assert.ok(pub.demo_mode, `${url} has STUMARI_DEMO_MODE off`);

  const operator = await loadOperator(env);
  const admin = new Http(url, "admin");
  const me = await signIn(admin, operator.signer);
  assert.ok(me.is_admin, "the operator must be in ADMIN_WALLETS");
  const hotels = await admin.ok<AdminHotel[]>("GET", "/api/admin/hotels");
  const hotel = hotels.find((h) => h.slug === DEMO_SLUG);
  assert.ok(hotel, `${DEMO_SLUG} is missing: run bootstrap --cluster localnet first`);
  const profile = await admin.ok<Profile>("GET", `/api/hotels/${DEMO_SLUG}`);
  const roomType = (name: string) => {
    const rt = profile.room_types.find((r) => r.name === name);
    assert.ok(rt, `room type ${name} is missing`);
    return rt.id;
  };
  const today = localDate(Math.floor(Date.now() / 1000), hotel.timezone);

  const guestB = Guest.fromSigner("Guest B", (await loadOrCreateKey("demo-guest-b")).signer, url);
  const guestC = Guest.fromSigner("Guest C", await generateKeyPairSigner(), url);
  const guestD = Guest.fromSigner("Guest D", await generateKeyPairSigner(), url);

  const fund = async (g: Guest) => {
    const res = await g.http.call<{ balance_minor?: string }>("POST", "/api/demo/faucet", { wallet: g.wallet });
    if (res.status >= 300) console.log(`  faucet for ${g.name}: HTTP ${res.status} (${res.text.slice(0, 120)})`);
  };

  // ------------------------------------------------------------- Guest B: same-day stay → released
  const history = await guestB.http.ok<{ status: string }[] | { bookings: { status: string }[] }>("GET", `/api/wallets/${guestB.wallet}/bookings`);
  const bookingsB = Array.isArray(history) ? history : history.bookings;
  let released: BookingView | null = null;
  let releaseId: string | null = null;
  if (bookingsB.some((b) => b.status === "released")) {
    console.log(`Guest B ${guestB.wallet} already has a released stay: skipped`);
  } else {
    await fund(guestB);
    const original = hotel.checkin_time;
    const soon = wallClock(Math.floor(Date.now() / 1000) + 4 * 60, hotel.timezone);
    assert.equal(soon.date, today, "check-in would fall after midnight: run again in a few minutes");
    console.log(`Guest B: hotel check-in time ${original} -> ${soon.hhmm} for a same-day stay`);
    await admin.ok("PATCH", `/api/admin/hotels/${hotel.id}`, { checkin_time: soon.hhmm });
    let quote: QuoteEnvelope;
    try {
      quote = await guestB.quote(DEMO_SLUG, { room_type_id: roomType("Double room"), checkin_date: today, checkout_date: addDays(today, 1), adults: 2 });
      const booked = await guestB.pay(quote, "standard", { name: "Ana (test guest B)", email: "guest-b@example.com" });
      releaseId = booked.view.id;
    } finally {
      await admin.ok("PATCH", `/api/admin/hotels/${hotel.id}`, { checkin_time: original });
      console.log(`  hotel check-in time back to ${original}`);
    }
    await guestB.waitFor(releaseId!, "confirmed");
  }

  // ------------------------------------------------------------- Guest C: confirmed Flexible stay
  await fund(guestC);
  const quoteC = await guestC.quote(DEMO_SLUG, {
    room_type_id: roomType("Family suite"),
    checkin_date: addDays(today, 9),
    checkout_date: addDays(today, 12),
    adults: 2,
  });
  const bookedC = await guestC.pay(quoteC, "flexible", { name: "Giorgi (test guest C)", email: "guest-c@example.com" });
  await guestC.waitFor(bookedC.view.id, "confirmed");

  // ------------------------------------------------------------- Guest D: Standard stay, cancelled
  await fund(guestD);
  const quoteD = await guestD.quote(DEMO_SLUG, {
    room_type_id: roomType("Twin room"),
    checkin_date: addDays(today, 5),
    checkout_date: addDays(today, 7),
    adults: 2,
  });
  const bookedD = await guestD.pay(quoteD, "standard", { name: "Maria (test guest D)", email: "guest-d@example.com" });
  await guestD.waitFor(bookedD.view.id, "confirmed");
  const cancelled = await guestD.act(bookedD.view.id, "cancel");
  console.log(`  Guest D cancelled ${bookedD.view.id}: refund ${formatUsdc(cancelled.refundMinor ?? 0n)} of ${formatUsdc(bookedD.amount)} (${cancelled.signature})`);

  // ------------------------------------------------------------- Guest B: wait for the release
  if (releaseId) {
    const view = await guestB.view(releaseId);
    const due = (view.release_after_ts ?? 0) + 5;
    const wait = Math.max(0, due - Math.floor(Date.now() / 1000));
    console.log(`Guest B: release due in ${wait} s (check-in + 120 s); reading the booking cranks it`);
    if (wait > 0) await sleep(wait * 1000);
    released = await guestB.waitFor(releaseId, "released", 180_000);
    assert.ok(released.settled, "a released booking reports its settlement");
    console.log(`  released ${releaseId}: hotel received ${formatUsdc(parseMinor(released.settled.hotel_minor))}`);
  }

  // ------------------------------------------------------------- browser wallets
  const hotelKey = await loadKeyFile(keyPath("demo-hotel"));
  const guestBKey = await loadKeyFile(keyPath("demo-guest-b"));
  const line = (secret: Uint8Array) =>
    `localStorage.setItem("stumari_demo_sk", "${hex(secret.slice(0, 32))}"); localStorage.setItem("stumari_wallet", "demo"); location.reload();`;
  const out = resolve(KEYS_DIR, "demo-browser-wallets.txt");
  writeFileSync(
    out,
    [
      "Stumari LOCAL demo: Test wallet keys for a browser profile. Localnet test tokens only, no value.",
      `Open ${url} in that browser profile, press F12, open Console, paste ONE line, press Enter.`,
      'Chrome asks you to type "allow pasting" before the first paste.',
      "",
      `Guest B (repeat guest, one released stay): ${guestB.wallet}`,
      line(guestBKey.secretKey),
      "",
      `Hotel (demo hotel payout wallet, also allowed into /admin): ${hotelKey.signer.address}`,
      line(hotelKey.secretKey),
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  console.log("\nSeeded (all real transactions on the local chain):");
  if (releaseId) console.log(`  released   ${url}/b/${releaseId}`);
  console.log(`  confirmed  ${url}/b/${bookedC.view.id}`);
  console.log(`  cancelled  ${url}/b/${bookedD.view.id}`);
  console.log(`  dashboard  ${url}/dashboard/${hotel.id}`);
  console.log(`  browser wallets: ${out}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
