/**
 * End-to-end smoke test of a bootstrapped cluster, chain-side only (no DB rows are written):
 * a fresh guest holding only mock USDC books `stumari-demo` from a real signed quote, gaslessly;
 * the operator confirms; the guest cancels; balances are asserted against @stumari/core math.
 *   pnpm --filter @stumari/scripts smoke
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  generateKeyPairSigner,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionCodec,
  partiallySignTransaction,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import {
  addDays,
  buildQuoteBody,
  checkinTs,
  deriveBookingId,
  formatUsdc,
  hashQuote,
  loadModel,
  localDate,
  minRefundForCancel,
  modelProvider,
  nightsBetween,
  parseMinor,
  priceMenu,
  signQuote,
  splitCancel,
  uuidToBytes,
  validatePolicy,
  verifyQuote,
  walletHistoryFeatures,
  weekendNights,
} from "@stumari/core";
import {
  buildCancelTx,
  buildConfirmTx,
  buildCreateBookingTx,
  fetchBooking,
  fetchConfig,
  findAta,
  findVaultPda,
  sendAndConfirm,
  sendBuiltTx,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  type BookingView,
  type BuiltTx,
} from "@stumari/escrow-client";
import { assertDevnetGenesis, configuredCluster } from "./lib/cluster";
import { openWebDb } from "./lib/db";
import { DEMO_SLUG } from "./lib/demo";
import { loadEnv } from "./lib/env";
import { loadOperator } from "./lib/keys";
import { mintTo } from "./lib/mint";
import { MODEL_JSON } from "./lib/paths";
import { accountExists, chainNow, connect, lamports, tokenBalance } from "./lib/rpc";

const DAY = 86_400;
/** 5 days out: the Standard template refunds 50% (≥ 3 d, < 7 d) once confirmed. */
const LEAD_DAYS = 5;
const NIGHTS = 2;

/** What a browser wallet does with the server's bytes: decode, sign, re-encode. */
async function walletSign(built: BuiltTx, wallet: KeyPairSigner): Promise<string> {
  assert.equal(built.requiredSigner, wallet.address, "the guest must be the only missing signer");
  const codec = getTransactionCodec();
  const tx = codec.decode(getBase64Encoder().encode(built.txBase64));
  return getBase64Decoder().decode(codec.encode(await partiallySignTransaction([wallet.keyPair], tx)));
}

async function loadDemoHotel() {
  const db = openWebDb(loadEnv());
  try {
    const hotel = await db.query.hotels.findFirst({ where: (h, { eq }) => eq(h.slug, DEMO_SLUG) });
    if (!hotel) throw new Error(`hotel ${DEMO_SLUG} not found: run the bootstrap first`);
    const roomType = await db.query.roomTypes.findFirst({
      where: (t, { eq }) => eq(t.hotel_id, hotel.id),
      orderBy: (t, { asc }) => asc(t.sort),
    });
    if (!roomType) throw new Error(`${DEMO_SLUG} has no room types`);
    return { hotel, roomType };
  } finally {
    db.$client.close();
  }
}

async function main() {
  const env = loadEnv();
  const { cluster, rpcUrl } = configuredCluster(env);
  const rpc = connect(rpcUrl);
  await assertDevnetGenesis(cluster, rpc);
  const operatorKey = await loadOperator(env);
  const operator = operatorKey.signer;
  const config = await fetchConfig(rpc);
  assert.equal(config.quoteSigner, operator.address, "config.quote_signer must be the operator");
  const { hotel, roomType } = await loadDemoHotel();
  assert.ok(hotel.payout_wallet, "demo hotel has no payout wallet");
  const hotelWallet = hotel.payout_wallet as Address;

  // ---- quote: the real model prices the menu; the operator signs it (quote-protocol.md)
  const now = Number(await chainNow(rpc));
  const checkinDate = localDate(now + LEAD_DAYS * DAY, hotel.timezone);
  const checkoutDate = addDays(checkinDate, NIGHTS);
  const checkin = checkinTs(checkinDate, hotel.checkin_time, hotel.timezone);
  const checkout = checkinTs(checkoutDate, hotel.checkout_time, hotel.timezone);
  const weekend = weekendNights(checkinDate, checkoutDate);
  const base = parseMinor(roomType.base_rate_minor);
  const basePrice =
    BigInt(nightsBetween(checkinDate, checkoutDate) - weekend) * base +
    BigInt(weekend) * (roomType.weekend_rate_minor ? parseMinor(roomType.weekend_rate_minor) : base);

  const guest = await generateKeyPairSigner();
  const request = {
    issued_at: now,
    checkin_ts: checkin,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    adults: 2,
    children: 0,
    buyer_type: "guest" as const,
    hotel_type: hotel.hotel_type,
    meal: roomType.meal,
    ...walletHistoryFeatures(guest.address, 0),
  };
  const model = loadModel(JSON.parse(readFileSync(MODEL_JSON, "utf8")));
  const menu = priceMenu({ provider: modelProvider(model), request, policy: validatePolicy(hotel.policy), basePriceMinor: basePrice });
  const body = buildQuoteBody({
    cluster,
    program_id: STUMARI_ESCROW_PROGRAM_ADDRESS,
    hotel_id: hotel.id,
    hotel_slug: hotel.slug,
    room_type_id: roomType.id,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    checkin_ts: checkin,
    checkout_ts: checkout,
    adults: request.adults,
    children: request.children,
    buyer_type: "guest",
    buyer_wallet: guest.address,
    mint: config.mint,
    decimals: 6,
    base_price_minor: basePrice.toString(),
    options: menu.options,
    issued_at: now,
  });
  const signed = signQuote(body, operatorKey.secretKey);
  assert.ok(verifyQuote(signed, operator.address), "quote signature must verify against the operator");
  const optionIndex = Math.max(0, body.options.findIndex((o) => o.id === "standard"));
  const option = body.options[optionIndex]!;
  const amount = parseMinor(option.price_minor);
  console.log(`quote ${body.id}: ${roomType.name}, ${checkinDate} -> ${checkoutDate}, p_cancel ${menu.explain.p_cancel.toFixed(3)}`);
  for (const o of body.options) console.log(`  ${o.id.padEnd(14)} ${formatUsdc(parseMinor(o.price_minor))}`);
  console.log(`buying "${option.id}" for ${formatUsdc(amount)}`);

  // ---- guest: fresh wallet, mock USDC only, no SOL
  await mintTo(rpc, operator, config.mint, guest.address, amount);
  const atas = {
    guest: await findAta(guest.address, config.mint),
    hotel: await findAta(hotelWallet, config.mint),
    treasury: config.treasury,
  };
  const balances = async () => ({
    guest: await tokenBalance(rpc, atas.guest),
    hotel: await tokenBalance(rpc, atas.hotel),
    treasury: await tokenBalance(rpc, atas.treasury),
  });
  assert.equal(await lamports(rpc, guest.address), 0n, "the guest must hold no SOL");
  const start = await balances();
  assert.equal(start.guest, amount);

  // ---- create_booking (gasless: operator = fee payer, quote signer, rent payer)
  const create = await buildCreateBookingTx({
    rpc,
    operator,
    guest: guest.address,
    hotelId: uuidToBytes(hotel.id),
    mint: config.mint,
    bookingId: deriveBookingId(body.id),
    amount,
    checkinTs: BigInt(checkin),
    checkoutTs: BigInt(checkout),
    quoteHash: hashQuote(body).bytes,
    optionIndex,
    tiers: option.tiers,
    quoteExpiresTs: BigInt(body.expires_at),
  });
  const created = await sendAndConfirm(rpc, await walletSign(create, guest), { lastValidBlockHeight: create.lastValidBlockHeight });
  let booking = await fetchBooking(rpc, create.booking);
  assert.equal(booking.status, "pending");
  assert.equal(booking.hotelAuthority, hotelWallet);
  assert.equal((await balances()).guest, 0n, "the full price moved into escrow");
  console.log(`created   ${booking.address} (${created.signature})`);

  // ---- confirm by the operator
  const confirmed = await sendBuiltTx(rpc, await buildConfirmTx({ rpc, operator, booking }));
  booking = await fetchBooking(rpc, booking.address);
  assert.equal(booking.status, "confirmed");
  console.log(`confirmed (${confirmed.signature})`);

  // ---- cancel by the guest, protected by min_refund
  const minRefund = minRefundForCancel({ booking, now: await chainNow(rpc) });
  const cancel = await buildCancelTx({ rpc, operator, booking, minRefund, config });
  const cancelled = await sendAndConfirm(rpc, await walletSign(cancel, guest), { lastValidBlockHeight: cancel.lastValidBlockHeight });
  const final = await fetchBooking(rpc, booking.address);
  assert.equal(final.status, "cancelled");
  console.log(`cancelled (${cancelled.signature})`);

  const vaultGone = !(await accountExists(rpc, await findVaultPda(final.address)));
  assertSettlement({ start, end: await balances(), final, minRefund, vaultGone });
  assert.equal(await lamports(rpc, guest.address), 0n, "the guest still holds no SOL");
  console.log(`\nsmoke: OK on ${cluster} (guest ${guest.address} never held SOL)`);
}

interface Balances {
  guest: bigint;
  hotel: bigint;
  treasury: bigint;
}

interface Settlement {
  /** Balances once the guest was funded, before create_booking. */
  start: Balances;
  end: Balances;
  final: BookingView;
  minRefund: bigint;
  vaultGone: boolean;
}

/** Balances and the Booking's stored amounts must both equal core's `splitCancel` at the cancel time. */
function assertSettlement({ start, end, final, minRefund, vaultGone }: Settlement) {
  const split = splitCancel({
    status: "confirmed",
    amount: final.amount,
    feeBps: final.feeBps,
    tiers: final.tiers,
    checkinTs: final.checkinTs,
    now: final.closedTs,
  });
  const expected: Balances = {
    guest: start.guest - final.amount + split.refund,
    hotel: start.hotel + split.hotelNet,
    treasury: start.treasury + split.fee,
  };
  console.log(`
cancelled ${split.secsBefore}s before check-in: refund ${split.refundBps} bps (min_refund ${formatUsdc(minRefund)})`);
  console.log(`${"account".padEnd(10)}${"before".padStart(18)}${"after".padStart(18)}${"expected".padStart(18)}`);
  for (const key of ["guest", "hotel", "treasury"] as const) {
    console.log(`${key.padEnd(10)}${formatUsdc(start[key]).padStart(18)}${formatUsdc(end[key]).padStart(18)}${formatUsdc(expected[key]).padStart(18)}`);
  }
  assert.deepEqual(end, expected, "token balances must match splitCancel");
  assert.deepEqual(
    { refund: final.refundAmount, hotelNet: final.hotelAmount, fee: final.feeAmount },
    { refund: split.refund, hotelNet: split.hotelNet, fee: split.fee },
    "amounts stored on the Booking must match splitCancel",
  );
  assert.equal(split.refund + split.hotelNet + split.fee, final.amount, "refund + hotel + fee == amount");
  assert.ok(split.refund >= minRefund, "refund must be at least what the guest was shown");
  assert.ok(vaultGone, "the vault must be closed");
}

main().catch((error: unknown) => {
  console.error(`\nsmoke failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
