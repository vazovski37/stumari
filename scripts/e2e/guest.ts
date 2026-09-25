/**
 * A simulated guest: a fresh keypair (no SOL, ever) plus its own browser cookie jar, driving the
 * public API exactly like the checkout page and the booking page do.
 */
import assert from "node:assert/strict";
import { generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { formatUsdc, parseMinor, type QuoteEnvelope, type QuoteOption } from "@stumari/core";
import { Http } from "./http";
import { sleep } from "./steps";
import { walletSign } from "./wallet";

export type BookingStatus =
  | "awaiting_signature"
  | "pending"
  | "confirmed"
  | "cancelled"
  | "released"
  | "disputed"
  | "resolved"
  | "voided"
  | "failed";

/** api.md "Public booking view" (the fields the E2E reads). */
export interface BookingView {
  id: string;
  status: BookingStatus;
  checkin_date: string;
  checkout_date: string;
  checkin_ts: number;
  amount_minor: string;
  option_id: string;
  refund_if_cancel_now_minor: string | null;
  can_cancel: boolean;
  can_dispute: boolean;
  can_void: boolean;
  confirm_deadline_ts: number | null;
  release_after_ts: number | null;
  booking_pda: string;
  settled: { refund_minor: string; hotel_minor: string; fee_minor: string } | null;
}

export interface Stay {
  room_type_id: string;
  checkin_date: string;
  checkout_date: string;
  adults: number;
}

export interface Booked {
  quote: QuoteEnvelope;
  option: QuoteOption;
  amount: bigint;
  view: BookingView;
  signature: string;
}

export class Guest {
  readonly http: Http;

  private constructor(
    readonly name: string,
    readonly signer: KeyPairSigner,
    baseUrl: string,
  ) {
    this.http = new Http(baseUrl, name);
  }

  static async create(name: string, baseUrl: string): Promise<Guest> {
    return new Guest(name, await generateKeyPairSigner(), baseUrl);
  }

  get wallet(): string {
    return this.signer.address;
  }

  /** "See prices" with this wallet connected: the quote is priced with its history and payable only by it. */
  async quote(slug: string, stay: Stay): Promise<QuoteEnvelope> {
    return this.http.ok<QuoteEnvelope>("POST", "/api/quotes", {
      hotel_slug: slug,
      room_type_id: stay.room_type_id,
      checkin_date: stay.checkin_date,
      checkout_date: stay.checkout_date,
      adults: stay.adults,
      children: 0,
      buyer_wallet: this.wallet,
    });
  }

  payBody(optionIndex: number) {
    return { option_index: optionIndex, payer: this.wallet, guest_name: `E2E ${this.name}`, guest_email: "e2e@example.com" };
  }

  /** /pay → the wallet signs the server-built transaction → /api/tx/send. */
  async pay(quote: QuoteEnvelope, optionId: QuoteOption["id"]): Promise<Booked> {
    const index = quote.quote.options.findIndex((o) => o.id === optionId);
    assert.ok(index >= 0, `${optionId} is not offered in quote ${quote.quote.id}`);
    const option = quote.quote.options[index]!;
    const pay = await this.http.ok<{ booking_id: string; tx: string; signer: string }>(
      "POST",
      `/api/quotes/${quote.quote.id}/pay`,
      this.payBody(index),
    );
    assert.equal(pay.signer, this.wallet, "the guest is the only signer the server leaves missing");
    const sent = await this.send(pay.tx);
    console.log(`  ${this.name} paid ${formatUsdc(parseMinor(option.price_minor))} (${option.id}) -> booking ${pay.booking_id} ${sent.booking.status} (${sent.signature})`);
    return { quote, option, amount: parseMinor(option.price_minor), view: sent.booking, signature: sent.signature };
  }

  async send(tx: string): Promise<{ signature: string; booking: BookingView }> {
    return this.http.ok("POST", "/api/tx/send", { tx: await walletSign(this.signer, tx) });
  }

  /** POST /api/bookings/{id}/tx, signed by this wallet and relayed. */
  async act(bookingId: string, action: "cancel" | "dispute" | "void") {
    const built = await this.http.ok<{ tx: string; refund_minor?: string }>("POST", `/api/bookings/${bookingId}/tx`, {
      action,
      wallet: this.wallet,
    });
    const sent = await this.send(built.tx);
    return { ...sent, refundMinor: built.refund_minor === undefined ? null : BigInt(built.refund_minor) };
  }

  view(bookingId: string): Promise<BookingView> {
    return this.http.ok<BookingView>("GET", `/api/bookings/${bookingId}`);
  }

  async waitFor(bookingId: string, status: BookingStatus, timeoutMs = 60_000): Promise<BookingView> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const view = await this.view(bookingId);
      if (view.status === status) return view;
      assert.ok(Date.now() < deadline, `booking ${bookingId} is ${view.status}, expected ${status} within ${timeoutMs / 1000} s`);
      await sleep(1_500);
    }
  }
}
