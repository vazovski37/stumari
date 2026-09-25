/**
 * End-to-end proof of the MVP loop on the localnet (ADR-0015), over HTTP like a browser and over MCP
 * like an agent, with every token balance asserted against @stumari/core math:
 *   pnpm --filter @stumari/scripts e2e [-- --keep-chain]
 *
 * It resets the localnet and re-runs the bootstrap first, starts the web app (`next dev`) on a free
 * port against its own database (apps/web/.data/e2e.db) and a local iCal fixture, then:
 *   (b) guest A pays Standard holding 0 SOL → auto-confirm → cancels > 7 days out → 100% refund
 *   (f) ALREADY_PAID on a repeated /pay            (h) the unit's iCal export lists confirmed, not cancelled
 *   (c) guest B pays Flexible → confirm            (d) guest D pays → confirm
 *   (e) guest E pays while the unit's iCal import conflicts → stays pending
 *   (g) an agent books through apps/mcp (search_availability → get_quote → book → booking_status)
 *   — every create happens before the first time travel (quotes carry wall-clock expiries) —
 *   time travel into the dispute window: (d) dispute, (e) void after the confirm deadline → full refund;
 *   time travel past check-in + release delay: (c) GET /api/bookings/{id} cranks release; (d) admin resolves 25%;
 *   (a) a fresh wallet and guest B (one released stay) get different menus at 60 d and 2 d lead.
 * Finally the localnet is reset and bootstrapped again, so the chain clock matches wall time and the
 * demo hotel is registered for the browser demo (skip with --keep-chain to inspect the E2E chain).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { address, type Address } from "@solana/kit";
import {
  addDays,
  checkinTs,
  formatUsdc,
  leadTimeDays,
  localDate,
  parseMinor,
  splitCancel,
  splitRelease,
  splitResolve,
  verifyQuote,
  type QuoteEnvelope,
} from "@stumari/core";
import { fetchBooking, fetchConfig, findAta, STUMARI_ESCROW_PROGRAM_ADDRESS, type BookingView as ChainBooking } from "@stumari/escrow-client";
import { configuredCluster } from "./lib/cluster";
import { loadEnv } from "./lib/env";
import { loadKeyFile, loadOperator } from "./lib/keys";
import { chainNow, connect, lamports, tokenBalance } from "./lib/rpc";
import { Surfnet } from "./lib/surfnet";
import { keyPath, REPO } from "./lib/paths";
import { Guest, type Booked, type BookingView, type Stay } from "./e2e/guest";
import { E2E_DB_URL, prepareE2eHotel } from "./e2e/hotel";
import { Http } from "./e2e/http";
import { startIcalFixture } from "./e2e/ical-fixture";
import { startMcp } from "./e2e/mcp";
import { sleep, step, summary } from "./e2e/steps";
import { signIn } from "./e2e/wallet";
import { freePort, startWebServer, WEB_LOG, type WebServer } from "./e2e/web-server";

const FAUCET_MINOR = 500_000_000n;
const DISPUTE_GUEST_BPS = 2_500;

function bootstrapLocalnet(): void {
  console.log("\n$ pnpm --filter @stumari/scripts bootstrap -- --cluster localnet --reset");
  const result = spawnSync("pnpm --filter @stumari/scripts bootstrap -- --cluster localnet --reset", {
    cwd: REPO,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`bootstrap failed (exit ${result.status})`);
}

interface HotelProfile {
  slug: string;
  timezone: string;
  checkin_time: string;
  room_types: { id: string; name: string }[];
}

/** A stay whose lead time (quote-protocol: floor((checkin_ts − now)/86400)) is exactly `lead` days. */
function stayWithLead(hotel: HotelProfile, roomTypeId: string, lead: number, nights: number): Stay {
  const now = Math.floor(Date.now() / 1000);
  const today = localDate(now, hotel.timezone);
  for (let d = lead; d <= lead + 1; d++) {
    const checkin = addDays(today, d);
    if (leadTimeDays(now, checkinTs(checkin, hotel.checkin_time, hotel.timezone)) === lead) {
      return { room_type_id: roomTypeId, checkin_date: checkin, checkout_date: addDays(checkin, nights), adults: 2 };
    }
  }
  throw new Error(`no check-in date with a lead time of ${lead} days`);
}

function printMenu(label: string, env: QuoteEnvelope): void {
  const e = env.explain;
  console.log(`  ${label}: ${env.quote.checkin_date} -> ${env.quote.checkout_date}, lead ${e.lead_time} d, P(cancel) ${e.p_cancel.toFixed(4)}, base ${formatUsdc(parseMinor(env.quote.base_price_minor))}`);
  for (const o of e.options) {
    const shown = o.price_minor === null ? `withheld (${o.withheld}${o.same_as ? ` = ${o.same_as}` : ""})` : `${formatUsdc(BigInt(o.price_minor))}  m_bps ${o.m_bps}`;
    console.log(`    ${o.id.padEnd(14)} ${shown}`);
  }
}

const priceOf = (env: QuoteEnvelope, id: string) => env.quote.options.find((o) => o.id === id)?.price_minor ?? null;

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { "keep-chain": { type: "boolean", default: false } },
  });

  bootstrapLocalnet();
  const env = loadEnv();
  const { cluster, rpcUrl } = configuredCluster(env);
  assert.equal(cluster, "localnet", "the E2E runs on the localnet only (it time-travels the chain)");
  assert.ok(await Surfnet.detect(rpcUrl), `${rpcUrl} is not a surfnet`);
  const rpc = connect(rpcUrl);
  const surfnet = new Surfnet(rpcUrl);
  const operator = (await loadOperator(env)).signer;
  const agent = (await loadKeyFile(keyPath("agent-devnet"))).signer;
  const config = await fetchConfig(rpc);
  const { mint, treasury } = config;

  const balanceOf = async (owner: string) => tokenBalance(rpc, await findAta(owner as Address, mint));
  const chainBooking = (view: BookingView): Promise<ChainBooking> => fetchBooking(rpc, address(view.booking_pda));

  const hotel = await step("setup: e2e database + demo hotel registered with a fresh payout wallet", async () => {
    const h = await prepareE2eHotel(rpc, operator, env, mint);
    console.log(`  hotel ${h.id} (${h.slug}), payout ${h.payoutWallet}, db ${E2E_DB_URL}`);
    return h;
  });

  const fixture = await startIcalFixture();
  const port = await freePort();
  let web: WebServer | null = null;
  let failure: unknown;
  try {
    web = await step(`setup: web app on port ${port} (log ${WEB_LOG})`, () =>
      startWebServer(port, {
        LIBSQL_URL: E2E_DB_URL,
        NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
        ICAL_ALLOW_LOOPBACK: "true",
      }),
    );
    const base = web.baseUrl;
    const publicApi = new Http(base, "public");
    const admin = new Http(base, "admin");

    const profile = await step("setup: public config, admin sign-in (SIWS), iCal import on the Twin unit", async () => {
      const pub = await publicApi.ok<{ cluster: string; program_id: string; mint: string; quote_signer: string; demo_mode: boolean }>(
        "GET",
        "/api/config/public",
      );
      assert.deepEqual(
        [pub.cluster, pub.program_id, pub.mint, pub.quote_signer, pub.demo_mode],
        ["localnet", STUMARI_ESCROW_PROGRAM_ADDRESS, mint, operator.address, true],
      );
      const me = await signIn(admin, operator);
      assert.ok(me.is_admin, "the operator is in ADMIN_WALLETS");
      const units = await admin.ok<{ name: string; units: { id: string; label: string; export_url: string }[] }[]>(
        "GET",
        `/api/dashboard/${hotel.id}/units`,
      );
      const unit = (label: string) => units.flatMap((t) => t.units).find((u) => u.label === label)!;
      await admin.ok("PUT", `/api/dashboard/${hotel.id}/units/${unit("T1").id}/ical`, { import_urls: [fixture.url] });
      const synced = await admin.ok<{ units: { id: string; label: string; feeds: number; errors: string[] }[] }>("POST", `/api/dashboard/${hotel.id}/sync`);
      assert.deepEqual(synced.units, [{ id: unit("T1").id, label: "T1", feeds: 1, errors: [] }]);
      const h = await publicApi.ok<HotelProfile>("GET", `/api/hotels/${hotel.slug}`);
      console.log(`  T1 imports ${fixture.url} (empty calendar, synced); D1 export feed ${unit("D1").export_url}`);
      return { hotel: h, d1Export: unit("D1").export_url };
    });
    const h = profile.hotel;
    const roomType = (name: string) => h.room_types.find((t) => t.name === name)!.id;

    const [guestA, guestB, guestD, guestE] = await step("setup: four fresh guest wallets, 500 test USDC each from the faucet, 0 SOL", async () => {
      const guests = await Promise.all(["guest A", "guest B", "guest D", "guest E"].map((n) => Guest.create(n, base)));
      for (const g of guests) {
        await g.http.ok("POST", "/api/demo/faucet", { wallet: g.wallet });
        assert.equal(await balanceOf(g.wallet), FAUCET_MINOR);
        assert.equal(await lamports(rpc, g.signer.address), 0n, `${g.name} holds no SOL`);
        console.log(`  ${g.name} ${g.wallet}: ${formatUsdc(FAUCET_MINOR)}, 0 SOL`);
      }
      return guests as [Guest, Guest, Guest, Guest];
    });
    const hotelStart = await balanceOf(hotel.payoutWallet);
    const treasuryStart = await tokenBalance(rpc, treasury);
    assert.equal(hotelStart, 0n);

    // ---------------------------------------------------------------- (b) + (f)
    const a = await step("(b) guest A pays Standard with 0 SOL -> auto-confirm -> cancels > 7 days out -> 100% refund", async () => {
      const quote = await guestA.quote(h.slug, stayWithLead(h, roomType("Double room"), 30, 2));
      const pub = await publicApi.ok<{ quote_signer: string }>("GET", "/api/config/public");
      assert.ok(verifyQuote(quote, pub.quote_signer), "the quote verifies against the published quote signer");
      const index = quote.quote.options.findIndex((o) => o.id === "standard");
      const first = await guestA.http.ok<{ tx: string }>("POST", `/api/quotes/${quote.quote.id}/pay`, guestA.payBody(index));
      const again = await guestA.http.ok<{ tx: string }>("POST", `/api/quotes/${quote.quote.id}/pay`, guestA.payBody(index));
      assert.equal(again.tx, first.tx, "a repeated /pay returns the same cached bytes");
      const sent = await guestA.send(first.tx);
      const booked: Booked = {
        quote,
        option: quote.quote.options[index]!,
        amount: parseMinor(quote.quote.options[index]!.price_minor),
        view: sent.booking,
        signature: sent.signature,
      };
      assert.equal(await balanceOf(guestA.wallet), FAUCET_MINOR - booked.amount, "the full price is in escrow");
      const confirmed = await guestA.waitFor(booked.view.id, "confirmed");
      assert.equal(confirmed.refund_if_cancel_now_minor, booked.amount.toString(), "Standard refunds 100% until 7 days before");

      const cancel = await guestA.act(booked.view.id, "cancel");
      assert.equal(cancel.refundMinor, booked.amount, "min_refund = the full amount");
      assert.equal(cancel.booking.status, "cancelled");
      const onchain = await chainBooking(cancel.booking);
      const split = splitCancel({ status: "confirmed", amount: onchain.amount, feeBps: onchain.feeBps, tiers: onchain.tiers, checkinTs: onchain.checkinTs, now: onchain.closedTs });
      assert.equal(split.refundBps, 10_000);
      assert.deepEqual([onchain.refundAmount, onchain.hotelAmount, onchain.feeAmount], [split.refund, split.hotelNet, split.fee]);
      assert.equal(await balanceOf(guestA.wallet), FAUCET_MINOR - booked.amount + split.refund);
      assert.equal(await balanceOf(guestA.wallet), FAUCET_MINOR, "guest A has everything back");
      assert.equal(await balanceOf(hotel.payoutWallet), hotelStart + split.hotelNet);
      assert.equal(await lamports(rpc, guestA.signer.address), 0n, "guest A never held SOL");
      console.log(`  cancelled ${split.secsBefore} s before check-in: refund ${formatUsdc(split.refund)} (${split.refundBps} bps), hotel ${formatUsdc(split.hotelNet)}, fee ${formatUsdc(split.fee)}`);
      return booked;
    });

    await step("(f) a repeated /pay on a paid quote answers 409 ALREADY_PAID with the booking", async () => {
      const index = a.quote.quote.options.indexOf(a.option);
      const body = await guestA.http.fails("POST", `/api/quotes/${a.quote.quote.id}/pay`, guestA.payBody(index), 409, "ALREADY_PAID");
      assert.equal((body["booking"] as BookingView).id, a.view.id);
    });

    // ---------------------------------------------------------------- creates for (c), (d), (e), (g)
    const soon = stayWithLead(h, roomType("Double room"), 5, 2);
    const b = await step("(c) guest B pays Flexible -> auto-confirm", async () => {
      const booked = await guestB.pay(await guestB.quote(h.slug, soon), "flexible");
      await guestB.waitFor(booked.view.id, "confirmed");
      return booked;
    });
    const d = await step("(d) guest D pays Standard (same dates, other unit) -> auto-confirm", async () => {
      const booked = await guestD.pay(await guestD.quote(h.slug, soon), "standard");
      await guestD.waitFor(booked.view.id, "confirmed");
      return booked;
    });

    const e = await step("(e) guest E pays while the Twin unit's iCal import conflicts -> stays pending", async () => {
      const stay = { ...soon, room_type_id: roomType("Twin room") };
      // A fresh import now, so /pay (which re-syncs only units older than 2 min) keeps using the
      // pre-conflict calendar however long the earlier steps took.
      await admin.ok("POST", `/api/dashboard/${hotel.id}/sync`);
      const quote = await guestE.quote(h.slug, stay);
      // The OTA sells the same nights after our quote: the unit's feed now blocks them.
      fixture.setEvents([{ uid: "ota-e2e-1@booking.example", start: stay.checkin_date, end: stay.checkout_date }]);
      const booked = await guestE.pay(quote, "standard");
      const deadline = Date.now() + 60_000;
      for (;;) {
        const overview = await admin.ok<{ conflicts: { id: string }[] }>("GET", `/api/dashboard/${hotel.id}/overview`);
        if (overview.conflicts.some((c) => c.id === booked.view.id)) break;
        assert.ok(Date.now() < deadline, "no sync_conflict recorded within 60 s");
        await sleep(1_500);
      }
      const view = await guestE.view(booked.view.id);
      assert.equal(view.status, "pending", "a conflicting booking is never auto-confirmed");
      assert.equal((await chainBooking(view)).status, "pending");
      console.log(`  ${view.id} pending with a sync_conflict; confirm deadline ${new Date(view.confirm_deadline_ts! * 1000).toISOString()}`);
      return booked;
    });

    const agentStart = await balanceOf(agent.address);
    const agentLamports = await lamports(rpc, agent.address);
    const g = await step("(g) MCP: search_availability -> get_quote -> book -> booking_status with the agent key", async () => {
      const mcp = await startMcp(base);
      try {
        assert.deepEqual(await mcp.toolNames(), ["book", "booking_status", "cancel", "get_quote", "search_availability"]);
        const stay = stayWithLead(h, roomType("Family suite"), 10, 2);
        const search = await mcp.tool<{ results: { room_type_id: string; room_type_name: string; base_price: string }[] }>("search_availability", {
          hotel_slug: h.slug,
          checkin: stay.checkin_date,
          checkout: stay.checkout_date,
          adults: 2,
        });
        const suite = search.data.results.find((r) => r.room_type_id === stay.room_type_id);
        assert.ok(suite, "the Family suite is available");
        console.log(`  search_availability: ${search.data.results.map((r) => `${r.room_type_name} ${r.base_price}`).join(", ")}`);
        const quote = await mcp.tool<{ quote_id: string; verification: { verified: boolean; matches_request: boolean }; options: { index: number; id: string; price_minor: string }[] }>(
          "get_quote",
          { hotel_slug: h.slug, room_type_id: stay.room_type_id, checkin: stay.checkin_date, checkout: stay.checkout_date, adults: 2 },
        );
        assert.ok(quote.data.verification.verified && quote.data.verification.matches_request, "the agent verified the quote signature");
        const flexible = quote.data.options.find((o) => o.id === "flexible")!;
        console.log(`  get_quote ${quote.data.quote_id}: ${quote.data.options.map((o) => `${o.id} ${formatUsdc(BigInt(o.price_minor))}`).join(", ")}; signature verified`);
        const booked = await mcp.tool<{ booking_id: string; signature: string; booking_url: string; amount_minor: string }>("book", {
          quote_id: quote.data.quote_id,
          option_index: flexible.index,
        });
        assert.equal(booked.data.amount_minor, flexible.price_minor);
        console.log(`  book: ${booked.data.booking_id} (${booked.data.signature}) ${booked.data.booking_url}`);
        const deadline = Date.now() + 60_000;
        let status = "";
        while (status !== "confirmed") {
          status = (await mcp.tool<{ status: string }>("booking_status", { booking_id: booked.data.booking_id })).data.status;
          assert.ok(Date.now() < deadline, `agent booking is ${status}, expected confirmed`);
          if (status !== "confirmed") await sleep(1_500);
        }
        console.log(`  booking_status: confirmed`);
        assert.equal(await balanceOf(agent.address), agentStart - parseMinor(flexible.price_minor), "the agent paid exactly the option price");
        assert.equal(await lamports(rpc, agent.address), agentLamports, "the operator paid the agent's fees and rent");
        return booked.data;
      } finally {
        await mcp.close();
      }
    });

    await step("(h) the unit's iCal export lists the confirmed booking and not the cancelled one", async () => {
      const feed = await publicApi.call<unknown>("GET", new URL(profile.d1Export).pathname);
      assert.equal(feed.status, 200);
      assert.ok(feed.text.includes(`UID:${b.view.id}@stumari`), "guest B's confirmed booking blocks D1");
      assert.ok(!feed.text.includes(a.view.id), "guest A's cancelled booking is not exported");
      assert.ok(!/E2E|e2e@example.com/.test(feed.text), "no guest data in the feed");
      const events = feed.text.split("BEGIN:VEVENT").length - 1;
      console.log(`  D1 feed: ${events} event(s), includes ${b.view.id} (confirmed), excludes ${a.view.id} (cancelled)`);
    });

    // ---------------------------------------------------------------- time travel 1: dispute window
    const checkin = BigInt(b.view.checkin_ts);
    const releaseDelay = BigInt(config.releaseDelaySecs);
    await step("time travel: chain clock -> check-in + 10 s (inside the dispute window)", async () => {
      const before = await chainNow(rpc);
      await surfnet.timeTravel(checkin + 10n);
      const after = await chainNow(rpc);
      assert.ok(after >= checkin && after < checkin + releaseDelay, `chain clock ${after} not in [${checkin}, ${checkin + releaseDelay})`);
      console.log(`  chain clock ${new Date(Number(before) * 1000).toISOString()} -> ${new Date(Number(after) * 1000).toISOString()}`);
      await sleep(2_500); // the web app caches the chain clock for 2 s
    });

    await step("(d) guest D flags a dispute inside the window", async () => {
      const view = await guestD.view(d.view.id);
      assert.ok(view.can_dispute && !view.can_cancel, "dispute open, cancel closed after check-in");
      const disputed = await guestD.act(d.view.id, "dispute");
      assert.equal(disputed.booking.status, "disputed");
      assert.equal((await chainBooking(disputed.booking)).status, "disputed");
    });

    await step("(e) past the confirm deadline guest E voids the unconfirmed booking -> full refund", async () => {
      const onchainBefore = await chainBooking(e.view);
      assert.ok((await chainNow(rpc)) >= onchainBefore.confirmDeadlineTs, "the confirm deadline has passed");
      await admin.fails("POST", `/api/dashboard/${hotel.id}/bookings/${e.view.id}/confirm`, undefined, 409, "NOT_ALLOWED");
      const voided = await guestE.act(e.view.id, "void");
      assert.equal(voided.booking.status, "voided");
      const onchain = await chainBooking(voided.booking);
      assert.deepEqual([onchain.status, onchain.refundAmount, onchain.hotelAmount, onchain.feeAmount], ["voided", e.amount, 0n, 0n]);
      assert.equal(await balanceOf(guestE.wallet), FAUCET_MINOR, "guest E has everything back");
    });

    // ---------------------------------------------------------------- time travel 2: past release
    await step("time travel: chain clock -> check-in + release delay + 10 s", async () => {
      await surfnet.timeTravel(checkin + releaseDelay + 10n);
      assert.ok((await chainNow(rpc)) >= checkin + releaseDelay);
      await sleep(2_500);
    });

    await step("(c) GET /api/bookings/{id} cranks release -> the hotel's ATA receives the amount", async () => {
      const hotelBefore = await balanceOf(hotel.payoutWallet);
      const view = await publicApi.ok<BookingView>("GET", `/api/bookings/${b.view.id}`);
      assert.equal(view.status, "released");
      const onchain = await chainBooking(view);
      const split = splitRelease({ amount: onchain.amount, feeBps: onchain.feeBps });
      assert.deepEqual([onchain.status, onchain.refundAmount, onchain.hotelAmount, onchain.feeAmount], ["released", 0n, split.hotelNet, split.fee]);
      assert.equal(await balanceOf(hotel.payoutWallet), hotelBefore + split.hotelNet);
      assert.equal(split.hotelNet + split.fee, b.amount);
      console.log(`  released ${formatUsdc(split.hotelNet)} to ${hotel.payoutWallet} (fee ${formatUsdc(split.fee)})`);
    });

    await step(`(d) admin resolves the dispute with ${DISPUTE_GUEST_BPS / 100}% to the guest`, async () => {
      const hotelBefore = await balanceOf(hotel.payoutWallet);
      const guestBefore = await balanceOf(guestD.wallet);
      const resolved = await admin.ok<{ status: string }>("POST", `/api/admin/bookings/${d.view.id}/resolve`, { guest_bps: DISPUTE_GUEST_BPS });
      assert.equal(resolved.status, "resolved");
      const onchain = await chainBooking(d.view);
      const split = splitResolve({ amount: onchain.amount, feeBps: onchain.feeBps, guestBps: DISPUTE_GUEST_BPS });
      assert.deepEqual([onchain.status, onchain.refundAmount, onchain.hotelAmount, onchain.feeAmount], ["resolved", split.refund, split.hotelNet, split.fee]);
      assert.equal(await balanceOf(guestD.wallet), guestBefore + split.refund);
      assert.equal(await balanceOf(hotel.payoutWallet), hotelBefore + split.hotelNet);
      console.log(`  guest D +${formatUsdc(split.refund)}, hotel +${formatUsdc(split.hotelNet)}, fee ${formatUsdc(split.fee)}`);
    });

    await step("balances: every account matches @stumari/core math end to end", async () => {
      const release = splitRelease({ amount: b.amount, feeBps: config.feeBps });
      const resolve = splitResolve({ amount: d.amount, feeBps: config.feeBps, guestBps: DISPUTE_GUEST_BPS });
      const expected = {
        guestA: FAUCET_MINOR,
        guestB: FAUCET_MINOR - b.amount,
        guestD: FAUCET_MINOR - d.amount + resolve.refund,
        guestE: FAUCET_MINOR,
        agent: agentStart - parseMinor(g.amount_minor),
        hotel: hotelStart + release.hotelNet + resolve.hotelNet,
        treasury: treasuryStart + release.fee + resolve.fee,
      };
      const actual = {
        guestA: await balanceOf(guestA.wallet),
        guestB: await balanceOf(guestB.wallet),
        guestD: await balanceOf(guestD.wallet),
        guestE: await balanceOf(guestE.wallet),
        agent: await balanceOf(agent.address),
        hotel: await balanceOf(hotel.payoutWallet),
        treasury: await tokenBalance(rpc, treasury),
      };
      for (const [k, v] of Object.entries(actual)) console.log(`  ${k.padEnd(9)} ${formatUsdc(v).padStart(12)}`);
      assert.deepEqual(actual, expected);
      for (const guest of [guestA, guestB, guestD, guestE]) assert.equal(await lamports(rpc, guest.signer.address), 0n, `${guest.name} never held SOL`);
    });

    // ---------------------------------------------------------------- (a) menus
    await step("(a) a fresh wallet vs guest B (one released stay) get different menus at 60 d and 2 d lead", async () => {
      const fresh = await Guest.create("fresh wallet", base);
      for (const lead of [60, 2]) {
        const stay = stayWithLead(h, roomType("Double room"), lead, 2);
        const freshMenu = await fresh.quote(h.slug, stay);
        const repeatMenu = await guestB.quote(h.slug, stay);
        printMenu(`fresh wallet, lead ${lead} d`, freshMenu);
        printMenu(`guest B (1 released stay), lead ${lead} d`, repeatMenu);
        assert.equal(freshMenu.explain.lead_time, lead);
        assert.equal(repeatMenu.explain.features.is_repeated_guest, 1);
        assert.equal(freshMenu.explain.features.is_repeated_guest, 0);
        assert.ok(repeatMenu.explain.p_cancel < freshMenu.explain.p_cancel, "history lowers the estimated risk");
        assert.equal(priceOf(freshMenu, "standard"), freshMenu.quote.base_price_minor, "the reference template costs the base rate");
        assert.notDeepEqual(
          repeatMenu.quote.options.map((o) => o.price_minor),
          freshMenu.quote.options.map((o) => o.price_minor),
          "the two wallets get different prices",
        );
        if (lead === 2) {
          for (const menu of [freshMenu, repeatMenu]) {
            assert.equal(priceOf(menu, "nonrefundable"), null, "non-refundable duplicates Standard when no refundable window is reachable");
          }
        } else {
          assert.equal(freshMenu.quote.options.length, 3);
        }
      }
    });
    console.log(`\ne2e: OK on localnet (${base})`);
  } catch (error) {
    failure = error;
  } finally {
    web?.stop();
    await fixture.close();
  }

  if (failure === undefined && !values["keep-chain"]) {
    await step("teardown: reset + bootstrap the localnet again (chain clock = wall clock, demo hotel registered)", async () => {
      bootstrapLocalnet();
    });
  }
  console.log(`\nsummary:\n${summary(failure)}`);
  if (failure !== undefined) {
    console.log(`\nweb app log: ${WEB_LOG}; the chain is left as it failed (re-run resets it).`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`\ne2e failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n${summary()}`);
  process.exit(1);
});
