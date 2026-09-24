/**
 * HTTP end-to-end check of the guest flow against a running web app on a bootstrapped
 * localnet/devnet (never mainnet): faucet → quote → pay → the guest's key signs like a browser
 * wallet → /api/tx/send → auto-confirm → cancel with the refund by the terms.
 *   pnpm --filter web e2e                       (E2E_BASE_URL, default http://localhost:3000)
 */
import assert from "node:assert/strict";
import {
  generateKeyPairSigner,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  type KeyPairSigner,
  type Transaction,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from "@solana/kit";
import { addDays, formatUsdc, localDate, verifyQuote, type QuoteEnvelope } from "@stumari/core";

const base = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SLUG = "stumari-demo";
const LEAD_DAYS = 5; // Standard refunds 50% between 7 and 3 days before check-in
let cookie = "";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  return { status: res.status, json: (await res.json()) as T };
}

async function ok<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { status, json } = await call<T>(method, path, body);
  assert.ok(status >= 200 && status < 300, `${method} ${path} → HTTP ${status}: ${JSON.stringify(json)}`);
  return json;
}

/** What a browser wallet does with the server's bytes. */
async function walletSign(signer: KeyPairSigner, txBase64: string): Promise<string> {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(txBase64)) as Transaction &
    TransactionWithinSizeLimit &
    TransactionWithLifetime;
  const [signatures] = await signer.signTransactions([tx]);
  return getBase64Decoder().decode(getTransactionEncoder().encode({ ...tx, signatures: { ...tx.signatures, ...signatures } }));
}

type View = {
  id: string;
  status: string;
  amount_minor: string;
  refund_if_cancel_now_minor: string | null;
  settled: { refund_minor: string; hotel_minor: string; fee_minor: string } | null;
};

async function waitFor(id: string, status: string, timeoutMs = 45_000): Promise<View> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await ok<View>("GET", `/api/bookings/${id}`);
    if (view.status === status) return view;
    if (Date.now() > deadline) throw new Error(`booking ${id} is ${view.status}, expected ${status}`);
    await new Promise((r) => setTimeout(r, 1_500));
  }
}

async function main() {
  const config = await ok<{ cluster: string; quote_signer: string; demo_mode: boolean }>("GET", "/api/config/public");
  assert.notEqual(config.cluster, "mainnet-beta", "never run against mainnet");
  assert.ok(config.demo_mode, "demo mode (faucet) must be on");
  const guest = await generateKeyPairSigner();
  console.log(`${config.cluster} at ${base}; guest ${guest.address}`);

  const faucet = await ok<{ balance_minor: string }>("POST", "/api/demo/faucet", { wallet: guest.address });
  console.log(`faucet: guest holds ${formatUsdc(BigInt(faucet.balance_minor))}`);

  const hotel = await ok<{ timezone: string; room_types: { id: string; name: string }[] }>("GET", `/api/hotels/${SLUG}`);
  const room = hotel.room_types.find((r) => r.name === "Double room") ?? hotel.room_types[0]!;
  const checkin = addDays(localDate(Math.floor(Date.now() / 1000), hotel.timezone), LEAD_DAYS);
  const checkout = addDays(checkin, 2);

  const envelope = await ok<QuoteEnvelope>("POST", "/api/quotes", {
    hotel_slug: SLUG,
    room_type_id: room.id,
    checkin_date: checkin,
    checkout_date: checkout,
    adults: 2,
    children: 0,
    buyer_wallet: guest.address,
  });
  assert.ok(verifyQuote(envelope, config.quote_signer), "quote must verify against the published quote signer");
  const optionIndex = envelope.quote.options.findIndex((o) => o.id === "standard");
  assert.ok(optionIndex >= 0, "standard option offered");
  const option = envelope.quote.options[optionIndex]!;
  console.log(`quote ${envelope.quote.id}: ${room.name} ${checkin}→${checkout}, P(cancel) ${envelope.explain.p_cancel.toFixed(3)}`);
  for (const o of envelope.quote.options) console.log(`  ${o.id.padEnd(14)} ${formatUsdc(BigInt(o.price_minor))}`);

  const payBody = { option_index: optionIndex, payer: guest.address, guest_name: "E2E Guest", guest_email: "e2e@example.com" };
  const pay = await ok<{ booking_id: string; tx: string; signer: string }>("POST", `/api/quotes/${envelope.quote.id}/pay`, payBody);
  assert.equal(pay.signer, guest.address);
  const again = await ok<{ tx: string }>("POST", `/api/quotes/${envelope.quote.id}/pay`, payBody);
  assert.equal(again.tx, pay.tx, "repeat /pay returns the same cached bytes");

  const unsigned = await call<{ error: { code: string } }>("POST", "/api/tx/send", { tx: pay.tx });
  assert.equal(unsigned.json.error.code, "WALLET_MODIFIED_TX", "a transaction missing the guest signature is refused");

  const sent = await ok<{ signature: string; booking: View }>("POST", "/api/tx/send", { tx: await walletSign(guest, pay.tx) });
  console.log(`paid: ${sent.signature} → ${sent.booking.status}`);
  const repaid = await call<{ error: { code: string } }>("POST", `/api/quotes/${envelope.quote.id}/pay`, payBody);
  assert.equal(repaid.json.error.code, "ALREADY_PAID", "one booking per quote");

  const confirmed = await waitFor(pay.booking_id, "confirmed");
  console.log(`confirmed; refund if cancelled now: ${formatUsdc(BigInt(confirmed.refund_if_cancel_now_minor ?? "0"))}`);

  const cancel = await ok<{ tx: string; refund_minor: string }>("POST", `/api/bookings/${pay.booking_id}/tx`, {
    action: "cancel",
    wallet: guest.address,
  });
  assert.equal(cancel.refund_minor, (BigInt(option.price_minor) / 2n).toString(), "Standard, 5 days out: 50% refund");
  const cancelled = await ok<{ signature: string; booking: View }>("POST", "/api/tx/send", { tx: await walletSign(guest, cancel.tx) });
  assert.equal(cancelled.booking.status, "cancelled");
  assert.ok(cancelled.booking.settled && BigInt(cancelled.booking.settled.refund_minor) >= BigInt(cancel.refund_minor));
  console.log(
    `cancelled: ${cancelled.signature}; refunded ${formatUsdc(BigInt(cancelled.booking.settled!.refund_minor))}, hotel ${formatUsdc(BigInt(cancelled.booking.settled!.hotel_minor))}`,
  );

  const mine = await ok<View[]>("GET", `/api/wallets/${guest.address}/bookings`);
  assert.equal(mine.find((b) => b.id === pay.booking_id)?.status, "cancelled");
  const text = JSON.stringify(mine);
  for (const secret of ["E2E Guest", "e2e@example.com", guest.address]) assert.ok(!text.includes(secret), `public view leaks ${secret}`);
  console.log(`\ne2e checkout: OK (booking ${pay.booking_id})`);
}

main().catch((e: unknown) => {
  console.error(`e2e checkout failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
