import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { base58 } from "@scure/base";
import { dayNumber, nightsBetween } from "./dates";
import { CoreError } from "./errors";
import { bytesToHex, isUuid, uuidV4 } from "./ids";
import { assertSafeInt } from "./int";
import { parseMinor, USDC_DECIMALS } from "./money";
import { DEPOSIT_BPS, type Explain, type QuoteOption } from "./pricing";
import { isTemplateId, validateTiers } from "./tiers";

/** Quote protocol v1 (docs/architecture/quote-protocol.md). */
export const QUOTE_VERSION = 1;
/** 10-minute hold: `expires_at = issued_at + 600`. */
export const QUOTE_TTL_SECS = 600;

export type Cluster = "devnet" | "mainnet-beta" | "localnet";
const CLUSTERS: readonly string[] = ["devnet", "mainnet-beta", "localnet"];

/** The signed body. Money is decimal strings; every number is a safe integer. */
export interface QuoteBody {
  v: number;
  id: string;
  cluster: Cluster;
  program_id: string;
  hotel_id: string;
  hotel_slug: string;
  room_type_id: string;
  checkin_date: string;
  checkout_date: string;
  checkin_ts: number;
  checkout_ts: number;
  nights: number;
  adults: number;
  children: number;
  buyer_type: "guest" | "agent";
  buyer_wallet: string | null;
  mint: string;
  decimals: number;
  base_price_minor: string;
  options: QuoteOption[];
  issued_at: number;
  expires_at: number;
  nonce: string;
}

export interface SignedQuote {
  quote: QuoteBody;
  /** base58 Ed25519 public key (= on-chain `config.quote_signer`). */
  signer: string;
  /** base58 Ed25519 signature over canonical(quote). */
  signature: string;
  /** hex sha256 of canonical(quote) — the on-chain `quote_hash`. */
  hash: string;
}

export interface QuoteEnvelope extends SignedQuote {
  explain: Explain;
}

const nonCanonical = (why: string): never => {
  throw new CoreError("NonCanonical", why);
};

/**
 * canonical(value): objects with keys in UTF-16 code-unit order and no whitespace, arrays in
 * order, `JSON.stringify` strings, safe integers only. Anything else (floats, NaN, bigint,
 * undefined, holes, class instances, cycles) is rejected rather than silently coerced.
 */
export function canonicalize(value: unknown): string {
  const stack = new Set<object>();
  const walk = (v: unknown, path: string): string => {
    if (v === null) return "null";
    switch (typeof v) {
      case "boolean":
        return v ? "true" : "false";
      case "string":
        return JSON.stringify(v);
      case "number":
        return Number.isSafeInteger(v) ? JSON.stringify(v) : nonCanonical(`${path}: ${v} is not a safe integer`);
      case "object":
        break;
      default:
        return nonCanonical(`${path}: ${typeof v} is not allowed`);
    }
    const obj = v as object;
    if (stack.has(obj)) nonCanonical(`${path}: cycle`);
    stack.add(obj);
    let out: string;
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        if (!(i in obj)) nonCanonical(`${path}[${i}]: array hole`);
        parts.push(walk(obj[i], `${path}[${i}]`));
      }
      out = `[${parts.join(",")}]`;
    } else {
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) nonCanonical(`${path}: only plain objects are allowed`);
      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      out = `{${keys.map((k) => `${JSON.stringify(k)}:${walk(record[k], `${path}.${k}`)}`).join(",")}}`;
    }
    stack.delete(obj);
    return out;
  };
  return walk(value, "$");
}

export function canonicalBytes(value: unknown): Uint8Array {
  return utf8ToBytes(canonicalize(value));
}

export function hashQuote(body: QuoteBody): { hex: string; bytes: Uint8Array } {
  const bytes = sha256(canonicalBytes(body));
  return { hex: bytesToHex(bytes), bytes };
}

/**
 * Accepts a 32-byte Ed25519 seed or a 64-byte Solana keypair (seed ‖ public key); for the latter
 * the embedded public key must match the seed.
 */
function seedOf(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length === 32) return secretKey;
  if (secretKey.length === 64) {
    const seed = secretKey.slice(0, 32);
    const pub = ed25519.getPublicKey(seed);
    if (bytesToHex(pub) !== bytesToHex(secretKey.slice(32))) {
      throw new CoreError("InvalidInput", "keypair public key does not match its seed");
    }
    return seed;
  }
  throw new CoreError("InvalidInput", "secret key must be 32 or 64 bytes");
}

export function publicKeyBase58(secretKey: Uint8Array): string {
  return base58.encode(ed25519.getPublicKey(seedOf(secretKey)));
}

export function signQuote(body: QuoteBody, secretKey: Uint8Array): SignedQuote {
  const seed = seedOf(secretKey);
  const bytes = canonicalBytes(body);
  return {
    quote: body,
    signer: base58.encode(ed25519.getPublicKey(seed)),
    signature: base58.encode(ed25519.sign(bytes, seed)),
    hash: bytesToHex(sha256(bytes)),
  };
}

/**
 * True iff `hash` is sha256(canonical(quote)), `signature` verifies under `signer` (strict
 * RFC 8032), and — when given — `signer` is the expected quote signer. Never throws on bad input.
 */
export function verifyQuote(envelope: SignedQuote, expectedSigner?: string): boolean {
  try {
    if (expectedSigner !== undefined && envelope.signer !== expectedSigner) return false;
    const bytes = canonicalBytes(envelope.quote);
    if (bytesToHex(sha256(bytes)) !== envelope.hash) return false;
    const pub = base58.decode(envelope.signer);
    const sig = base58.decode(envelope.signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    return ed25519.verify(sig, bytes, pub, { zip215: false });
  } catch {
    return false;
  }
}

export type QuoteBodyInput = Omit<QuoteBody, "v" | "id" | "expires_at" | "nonce" | "nights"> & {
  /** Defaults to a random UUID v4. */
  id?: string;
  /** 16 bytes as 32 hex chars; defaults to random. */
  nonce?: string;
};

function assertPubkey(s: unknown, what: string): void {
  let ok = false;
  try {
    ok = typeof s === "string" && base58.decode(s).length === 32;
  } catch {
    ok = false;
  }
  if (!ok) throw new CoreError("InvalidInput", `${what} must be a base58 32-byte public key`);
}

/** Assembles and validates a v1 quote body; `nights` and `expires_at` are derived. */
export function buildQuoteBody(input: QuoteBodyInput): QuoteBody {
  const fail = (why: string): never => {
    throw new CoreError("InvalidInput", why);
  };
  const id = input.id ?? uuidV4();
  const nonce = input.nonce ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  if (!isUuid(id) || id !== id.toLowerCase()) fail("id must be a lowercase UUID");
  if (!/^[0-9a-f]{32}$/.test(nonce)) fail("nonce must be 16 bytes of lowercase hex");
  if (!CLUSTERS.includes(input.cluster)) fail(`unknown cluster ${input.cluster}`);
  assertPubkey(input.program_id, "program_id");
  assertPubkey(input.mint, "mint");
  if (input.buyer_wallet !== null) assertPubkey(input.buyer_wallet, "buyer_wallet");
  if (!isUuid(input.hotel_id) || !isUuid(input.room_type_id)) fail("hotel_id and room_type_id must be UUIDs");
  if (typeof input.hotel_slug !== "string" || input.hotel_slug.trim() === "") fail("hotel_slug must be non-empty");
  if (input.buyer_type !== "guest" && input.buyer_type !== "agent") fail("buyer_type must be guest or agent");
  dayNumber(input.checkin_date);
  const nights = nightsBetween(input.checkin_date, input.checkout_date);
  if (nights < 1) fail("checkout_date must be after checkin_date");
  assertSafeInt(input.checkin_ts, "checkin_ts");
  assertSafeInt(input.checkout_ts, "checkout_ts");
  if (input.checkout_ts <= input.checkin_ts) fail("checkout_ts must be after checkin_ts");
  assertSafeInt(input.issued_at, "issued_at");
  assertSafeInt(input.adults, "adults", 1);
  assertSafeInt(input.children, "children");
  // MVP constants: USDC only (6 decimals) and full prepay into escrow (ADR-0002).
  if (input.decimals !== USDC_DECIMALS) fail(`decimals must be ${USDC_DECIMALS}`);
  parseMinor(input.base_price_minor);
  if (input.options.length === 0) fail("a quote needs at least one option");
  const optionIds = new Set<string>();
  for (const o of input.options) {
    if (!isTemplateId(o.id)) fail(`unknown option id ${o.id}`);
    if (optionIds.has(o.id)) fail(`duplicate option id ${o.id}`);
    optionIds.add(o.id);
    if (parseMinor(o.price_minor) === 0n) fail("option price must be positive");
    if (o.deposit_bps !== DEPOSIT_BPS) fail(`deposit_bps must be ${DEPOSIT_BPS} (full prepay)`);
    validateTiers(o.tiers);
  }
  return {
    v: QUOTE_VERSION,
    id,
    cluster: input.cluster,
    program_id: input.program_id,
    hotel_id: input.hotel_id,
    hotel_slug: input.hotel_slug,
    room_type_id: input.room_type_id,
    checkin_date: input.checkin_date,
    checkout_date: input.checkout_date,
    checkin_ts: input.checkin_ts,
    checkout_ts: input.checkout_ts,
    nights,
    adults: input.adults,
    children: input.children,
    buyer_type: input.buyer_type,
    buyer_wallet: input.buyer_wallet,
    mint: input.mint,
    decimals: input.decimals,
    base_price_minor: input.base_price_minor,
    options: input.options.map((o) => ({
      id: o.id,
      price_minor: o.price_minor,
      deposit_bps: o.deposit_bps,
      tiers: o.tiers.map((t) => ({ secs_before: t.secs_before, refund_bps: t.refund_bps })),
    })),
    issued_at: input.issued_at,
    expires_at: input.issued_at + QUOTE_TTL_SECS,
    nonce,
  };
}
