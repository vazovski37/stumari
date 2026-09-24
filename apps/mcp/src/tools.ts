import { address } from "@solana/kit";
import {
  TEMPLATES,
  bookingIdHex,
  deriveBookingId,
  hexToBytes,
  parseMinor,
  uuidToBytes,
  verifyQuote,
  type SignedQuote,
} from "@stumari/core";
import type { AgentWallet } from "./agent";
import type { StumariApi } from "./api";
import { type BookingView, type Envelope, type PublicConfig, type QuoteBody, bookingView } from "./schemas";
import { clip, describeTiers, usdc } from "./text";
import { hotelPda } from "./tx-guard";

/** A refusal decided by this server (as opposed to the API or a guard). */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export interface ToolDeps {
  api: StumariApi;
  agent: AgentWallet | null;
}

/** Structured content plus a short plain-language summary for the model. */
export interface ToolOutput {
  summary: string;
  data: Record<string, unknown>;
}

/** At most this many hotels get an availability call per search. */
const MAX_HOTELS = 10;

function explorerUrl(kind: "tx" | "address", value: string, cluster: PublicConfig["cluster"]): string {
  const query =
    cluster === "mainnet-beta"
      ? ""
      : cluster === "devnet"
        ? "?cluster=devnet"
        : `?cluster=custom&customUrl=${encodeURIComponent("http://127.0.0.1:8899")}`;
  return `https://explorer.solana.com/${kind}/${value}${query}`;
}

const bookingUrl = (api: StumariApi, bookingId: string) => `${api.baseUrl}/b/${bookingId}`;
const iso = (ts: number) => new Date(ts * 1000).toISOString();

// ---------------------------------------------------------------------------------------------

export interface SearchInput {
  city?: string;
  hotel_slug?: string;
  checkin: string;
  checkout: string;
  adults: number;
  children?: number;
}

export async function searchAvailability(deps: ToolDeps, input: SearchInput): Promise<ToolOutput> {
  const children = input.children ?? 0;
  const hotels = (await deps.api.hotels(input.city)).filter((h) => !input.hotel_slug || h.slug === input.hotel_slug);
  if (input.hotel_slug && hotels.length === 0) {
    throw new ToolError("HOTEL_NOT_FOUND", `No active hotel with slug "${input.hotel_slug}"${input.city ? " in that city" : ""}.`);
  }
  const searched = hotels.slice(0, MAX_HOTELS);
  const perHotel = await Promise.all(
    searched.map(async (hotel) => {
      const rows = await deps.api.availability(hotel.slug, { checkin: input.checkin, checkout: input.checkout, adults: input.adults, children });
      return rows
        .filter((r) => r.available)
        .flatMap((r) => {
          const rt = hotel.room_types.find((t) => t.id === r.room_type_id);
          if (!rt) return [];
          return [
            {
              hotel_slug: hotel.slug,
              hotel_name: clip(hotel.name, 80),
              city: clip(hotel.city, 40),
              room_type_id: rt.id,
              room_type_name: clip(rt.name, 60),
              meal: clip(rt.meal, 10),
              max_adults: rt.max_adults,
              max_children: rt.max_children,
              nights: r.nights,
              base_price_minor: r.base_price_minor,
              base_price: usdc(r.base_price_minor),
            },
          ];
        });
    }),
  );
  const results = perHotel.flat();
  const lines = results.map(
    (r) => `- ${r.hotel_name} (${r.hotel_slug}), ${r.room_type_name} [${r.room_type_id}]: ${r.base_price} for ${r.nights} night(s)`,
  );
  const summary =
    results.length === 0
      ? `Nothing available for ${input.checkin} → ${input.checkout} (${input.adults} adult(s), ${children} child(ren)) across ${searched.length} hotel(s).`
      : `${results.length} room type(s) available ${input.checkin} → ${input.checkout}. Base prices (the reference contract; call get_quote for the signed menu):\n${lines.join("\n")}`;
  return {
    summary,
    data: {
      checkin: input.checkin,
      checkout: input.checkout,
      adults: input.adults,
      children,
      hotels_searched: searched.length,
      hotels_skipped: hotels.length - searched.length,
      results,
    },
  };
}

// ---------------------------------------------------------------------------------------------

interface Verification {
  verified: boolean;
  signature_valid: boolean;
  signer_is_quote_signer: boolean;
  cluster_matches: boolean;
  quote_signer: string | null;
}

function verifyEnvelope(env: Envelope, config: PublicConfig): Verification {
  const signature_valid = verifyQuote(env as unknown as SignedQuote);
  const signer_is_quote_signer = config.quote_signer !== null && env.signer === config.quote_signer;
  const cluster_matches =
    env.quote.cluster === config.cluster &&
    env.quote.program_id === config.program_id &&
    (config.mint === null || env.quote.mint === config.mint);
  return {
    verified: signature_valid && signer_is_quote_signer && cluster_matches,
    signature_valid,
    signer_is_quote_signer,
    cluster_matches,
    quote_signer: config.quote_signer,
  };
}

function verificationSentence(v: Verification, signer: string): string {
  if (v.verified) return `Signature verified: signed by Stumari's quote signer ${signer}.`;
  const why = !v.signature_valid
    ? "the Ed25519 signature or hash does not match the quote"
    : !v.signer_is_quote_signer
      ? `it is signed by ${signer}, not the configured quote signer ${v.quote_signer ?? "(none configured)"}`
      : "it names a different cluster, program or mint than the API";
  return `WARNING: quote NOT verified — ${why}. Do not pay it.`;
}

function describeOptions(q: QuoteBody) {
  return q.options.map((o, index) => ({
    index,
    id: o.id,
    name: TEMPLATES[o.id].name,
    price_minor: o.price_minor,
    price: usdc(o.price_minor),
    tiers: o.tiers,
    terms: describeTiers(o.tiers),
  }));
}

export interface QuoteInput {
  hotel_slug: string;
  room_type_id: string;
  checkin: string;
  checkout: string;
  adults: number;
  children?: number;
  wallet?: string;
}

export async function getQuote(deps: ToolDeps, input: QuoteInput): Promise<ToolOutput> {
  const children = input.children ?? 0;
  const buyerWallet = input.wallet ?? deps.agent?.address ?? null;
  const [config, env] = await Promise.all([
    deps.api.config(),
    deps.api.createQuote({
      hotel_slug: input.hotel_slug,
      room_type_id: input.room_type_id,
      checkin_date: input.checkin,
      checkout_date: input.checkout,
      adults: input.adults,
      children,
      buyer_type: "agent",
      ...(buyerWallet ? { buyer_wallet: buyerWallet } : {}),
    }),
  ]);
  const q = env.quote;
  const verification = verifyEnvelope(env, config);
  const matchesRequest =
    q.hotel_slug === input.hotel_slug &&
    q.room_type_id === input.room_type_id &&
    q.checkin_date === input.checkin &&
    q.checkout_date === input.checkout &&
    q.adults === input.adults &&
    q.children === children &&
    q.buyer_wallet === buyerWallet;
  const options = describeOptions(q);
  const lines = options.map((o) => `[${o.index}] ${o.name} — ${o.price}: ${o.terms}`);
  const summary = [
    `Quote ${q.id}: ${q.nights} night(s) at ${q.hotel_slug}, ${q.checkin_date} → ${q.checkout_date}; room held until ${iso(q.expires_at)}.`,
    verificationSentence(verification, env.signer),
    matchesRequest ? null : "WARNING: the quote does not match the request (dates, room, guests or wallet).",
    q.buyer_wallet ? `Only wallet ${q.buyer_wallet} may pay.` : null,
    "Options (book with quote_id and option_index):",
    ...lines,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  return {
    summary,
    data: {
      quote_id: q.id,
      expires_at: q.expires_at,
      hotel_slug: q.hotel_slug,
      room_type_id: q.room_type_id,
      checkin_date: q.checkin_date,
      checkout_date: q.checkout_date,
      nights: q.nights,
      adults: q.adults,
      children: q.children,
      buyer_wallet: q.buyer_wallet,
      base_price_minor: q.base_price_minor,
      verification: { ...verification, matches_request: matchesRequest },
      options,
      model: env.explain
        ? { version: env.explain.model_version ? clip(env.explain.model_version, 64) : null, p_cancel: env.explain.p_cancel ?? null }
        : null,
      envelope: { quote: q, signer: env.signer, signature: env.signature, hash: env.hash },
    },
  };
}

// ---------------------------------------------------------------------------------------------

export interface BookInput {
  quote_id: string;
  option_index: number;
  wallet?: string;
}

function bookingStatusOf(raw: unknown): BookingView["status"] | null {
  const parsed = bookingView.safeParse(raw);
  return parsed.success ? parsed.data.status : null;
}

export async function book(deps: ToolDeps, input: BookInput): Promise<ToolOutput> {
  const { api, agent } = deps;
  const [config, record] = await Promise.all([api.config(), api.getQuote(input.quote_id)]);
  const env = record.envelope;
  const q = env.quote;
  if (q.id !== input.quote_id) throw new ToolError("UNEXPECTED_RESPONSE", "The API returned a different quote than requested.");
  const verification = verifyEnvelope(env, config);
  if (!verification.verified) throw new ToolError("QUOTE_UNVERIFIED", verificationSentence(verification, env.signer));
  if (record.status !== "active") throw new ToolError("QUOTE_NOT_ACTIVE", `Quote ${q.id} is ${record.status}; request a new quote.`);
  const option = q.options[input.option_index];
  if (!option) throw new ToolError("NO_SUCH_OPTION", `Quote ${q.id} has options 0..${q.options.length - 1}.`);

  const payer = input.wallet ?? q.buyer_wallet ?? agent?.address;
  if (!payer) throw new ToolError("WALLET_REQUIRED", "Pass `wallet` (the paying wallet address); no agent key is configured.");
  if (q.buyer_wallet && payer !== q.buyer_wallet) {
    throw new ToolError("WALLET_MISMATCH", `This quote was priced for ${q.buyer_wallet}; only that wallet may pay.`);
  }

  const pay = await api.pay(q.id, { option_index: input.option_index, payer });
  const expectedBookingId = bookingIdHex(q.id);
  if (pay.booking_id !== expectedBookingId || pay.signer !== payer) {
    throw new ToolError("UNEXPECTED_RESPONSE", "The API returned a payment transaction for a different booking or wallet.");
  }
  const optionText = `${TEMPLATES[option.id].name} (${usdc(option.price_minor)}): ${describeTiers(option.tiers)}`;
  const url = bookingUrl(api, pay.booking_id);

  if (agent && payer === agent.address) {
    const signed = await agent.sign({
      config,
      amountMinor: parseMinor(option.price_minor),
      txBase64: pay.tx,
      action: {
        kind: "create_booking",
        bookingId: deriveBookingId(q.id),
        amount: parseMinor(option.price_minor),
        checkinTs: BigInt(q.checkin_ts),
        checkoutTs: BigInt(q.checkout_ts),
        quoteHash: hexToBytes(env.hash),
        optionIndex: input.option_index,
        tiers: option.tiers,
        quoteExpiresTs: BigInt(q.expires_at),
        hotel: await hotelPda(uuidToBytes(q.hotel_id)),
        mint: address(q.mint),
      },
    });
    const sent = await api.sendTx(signed.txBase64);
    const status = bookingStatusOf(sent.booking);
    return {
      summary: `Booked: ${optionText} Paid from agent wallet ${agent.address}; transaction ${sent.signature}. Booking ${pay.booking_id}${status ? ` is ${status}` : ""} — ${url}`,
      data: {
        booking_id: pay.booking_id,
        signature: sent.signature,
        booking_url: url,
        explorer_url: explorerUrl("tx", sent.signature, config.cluster),
        status,
        option_id: option.id,
        amount_minor: option.price_minor,
        payer,
      },
    };
  }

  return {
    summary: `Payment transaction ready for ${optionText} Wallet ${payer} must sign it (solana:signTransaction), then POST { tx } to ${api.baseUrl}/api/tx/send. Booking ${pay.booking_id} — ${url}`,
    data: {
      booking_id: pay.booking_id,
      booking_pda: pay.booking_pda,
      tx: pay.tx,
      signer: pay.signer,
      last_valid_block_height: String(pay.lastValidBlockHeight),
      send_url: `${api.baseUrl}/api/tx/send`,
      booking_url: url,
      option_id: option.id,
      amount_minor: option.price_minor,
    },
  };
}

// ---------------------------------------------------------------------------------------------

export interface CancelInput {
  booking_id: string;
  wallet?: string;
}

export async function cancel(deps: ToolDeps, input: CancelInput): Promise<ToolOutput> {
  const { api, agent } = deps;
  const [config, view] = await Promise.all([api.config(), api.booking(input.booking_id)]);
  if (view.id !== input.booking_id) throw new ToolError("UNEXPECTED_RESPONSE", "The API returned a different booking than requested.");
  if (!view.can_cancel) throw new ToolError("NOT_ALLOWED", `Booking ${view.id} is ${view.status} and can no longer be cancelled.`);
  const wallet = input.wallet ?? agent?.address;
  if (!wallet) throw new ToolError("WALLET_REQUIRED", "Pass `wallet` (the guest wallet that paid); no agent key is configured.");

  const res = await api.bookingTx(view.id, { action: "cancel", wallet });
  if (res.signer !== wallet) throw new ToolError("UNEXPECTED_RESPONSE", "The API returned a cancel transaction for a different wallet.");
  const url = bookingUrl(api, view.id);

  if (agent && wallet === agent.address) {
    // Without the API's floor the agent could sign min_refund = 0 and lose the ADR-0012 protection.
    if (res.refund_minor === undefined) {
      throw new ToolError("REFUND_UNKNOWN", "The API did not state the guaranteed refund; refusing to sign a cancel without a floor.");
    }
    const signed = await agent.sign({
      config,
      amountMinor: parseMinor(view.amount_minor),
      txBase64: res.tx,
      action: {
        kind: "cancel_booking",
        bookingId: hexToBytes(view.id),
        minRefund: parseMinor(res.refund_minor),
      },
    });
    const sent = await api.sendTx(signed.txBase64);
    const refund = (signed.minRefund ?? 0n).toString();
    return {
      summary: `Cancelled booking ${view.id}: at least ${usdc(refund)} of ${usdc(view.amount_minor)} is refunded to ${wallet} by the booking's schedule. Transaction ${sent.signature} — ${url}`,
      data: {
        booking_id: view.id,
        signature: sent.signature,
        refund_minor: refund,
        amount_minor: view.amount_minor,
        status: bookingStatusOf(sent.booking),
        booking_url: url,
        explorer_url: explorerUrl("tx", sent.signature, config.cluster),
      },
    };
  }

  const refund = res.refund_minor ?? view.refund_if_cancel_now_minor ?? null;
  return {
    summary: `Cancel transaction ready for booking ${view.id}${refund ? `: refund at least ${usdc(refund)} of ${usdc(view.amount_minor)}` : ""}. Wallet ${wallet} must sign it within about a minute (the refund floor is computed for now + 90 s), then POST { tx } to ${api.baseUrl}/api/tx/send.`,
    data: {
      booking_id: view.id,
      tx: res.tx,
      signer: res.signer,
      last_valid_block_height: String(res.lastValidBlockHeight),
      refund_minor: refund,
      amount_minor: view.amount_minor,
      send_url: `${api.baseUrl}/api/tx/send`,
      booking_url: url,
    },
  };
}

// ---------------------------------------------------------------------------------------------

export async function bookingStatus(deps: ToolDeps, input: { booking_id: string }): Promise<ToolOutput> {
  const [config, view] = await Promise.all([deps.api.config(), deps.api.booking(input.booking_id)]);
  if (view.id !== input.booking_id) throw new ToolError("UNEXPECTED_RESPONSE", "The API returned a different booking than requested.");
  const roomType = clip(typeof view.room_type === "string" ? view.room_type : view.room_type.name, 60);
  const hotelName = clip(view.hotel.name, 80);
  const terms = describeTiers(view.terms.tiers);
  const refundNow = view.refund_if_cancel_now_minor ?? null;
  const url = bookingUrl(deps.api, view.id);
  const summary = [
    `Booking ${view.id} is ${view.status}: ${hotelName}, ${roomType}, ${view.checkin_date} → ${view.checkout_date}, ${usdc(view.amount_minor)}.`,
    `Terms: ${terms}`,
    !view.can_cancel
      ? "It cannot be cancelled now."
      : refundNow
        ? `Cancelling now refunds ${usdc(refundNow)}.`
        : "It can be cancelled now.",
    url,
  ].join("\n");
  return {
    summary,
    data: {
      booking_id: view.id,
      status: view.status,
      hotel: {
        name: hotelName,
        address: view.hotel.address ? clip(view.hotel.address, 120) : null,
        checkin_time: view.hotel.checkin_time ?? null,
      },
      room_type: roomType,
      checkin_date: view.checkin_date,
      checkout_date: view.checkout_date,
      amount_minor: view.amount_minor,
      option_id: clip(view.option_id, 20),
      terms: { tiers: view.terms.tiers, text: terms },
      refund_if_cancel_now_minor: refundNow,
      can_cancel: view.can_cancel,
      can_dispute: view.can_dispute,
      can_void: view.can_void,
      confirm_deadline_ts: view.confirm_deadline_ts ?? null,
      release_after_ts: view.release_after_ts ?? null,
      booking_pda: view.booking_pda,
      booking_url: url,
      explorer_url: explorerUrl("address", view.booking_pda, config.cluster),
    },
  };
}
