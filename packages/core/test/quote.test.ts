import { writeFileSync } from "node:fs";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import {
  bookingIdHex,
  buildQuoteBody,
  bytesToHex,
  canonicalize,
  checkinTs,
  CoreError,
  hashQuote,
  publicKeyBase58,
  QUOTE_TTL_SECS,
  signQuote,
  TEMPLATES,
  uuidToBytes,
  verifyQuote,
  type QuoteBody,
  type QuoteBodyInput,
} from "../src/index";
import { readJson, repoFileExists, repoPath } from "./helpers";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CoreError ? e.code : "not-a-CoreError";
  }
  return undefined;
};

const SEED = new Uint8Array(32).fill(1);
const tiers = (id: keyof typeof TEMPLATES) => TEMPLATES[id].tiers.map((t) => ({ ...t }));

/** Fixed inputs for spec/vectors/quote.json (Request A prices from pricing §6). */
const FIXED_INPUT: QuoteBodyInput = {
  id: "6f1c1c9e-3f0a-4c43-9d2b-8a7e5b0c4d21",
  cluster: "devnet",
  program_id: "6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf",
  hotel_id: "0b6e3a52-7d4c-4b8e-a1f2-3c4d5e6f7a8b",
  hotel_slug: "demo-tbilisi",
  room_type_id: "5a9d2c1e-8b7f-4e6d-9c3b-2a1f0e9d8c7b",
  checkin_date: "2026-12-10",
  checkout_date: "2026-12-13",
  checkin_ts: checkinTs("2026-12-10", "14:00", "Asia/Tbilisi"),
  checkout_ts: checkinTs("2026-12-13", "12:00", "Asia/Tbilisi"),
  adults: 2,
  children: 1,
  buyer_type: "guest",
  buyer_wallet: publicKeyBase58(new Uint8Array(32).fill(2)),
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  decimals: 6,
  base_price_minor: "100000000",
  options: [
    { id: "flexible", price_minor: "104730000", deposit_bps: 10_000, tiers: tiers("flexible") },
    { id: "standard", price_minor: "100000000", deposit_bps: 10_000, tiers: tiers("standard") },
    { id: "nonrefundable", price_minor: "95890000", deposit_bps: 10_000, tiers: tiers("nonrefundable") },
  ],
  issued_at: checkinTs("2026-10-12", "09:30", "Asia/Tbilisi"),
  nonce: "000102030405060708090a0b0c0d0e0f",
};

const UUID_VECTORS = [
  "00000000-0000-0000-0000-000000000000",
  "00112233-4455-6677-8899-aabbccddeeff",
  "0B6E3A52-7D4C-4B8E-A1F2-3C4D5E6F7A8B",
  "ffffffff-ffff-4fff-bfff-ffffffffffff",
];
const QUOTE_ID_VECTORS = [
  FIXED_INPUT.id!,
  "00000000-0000-0000-0000-000000000000",
  "a3bb189e-8bf9-4888-9912-ace4e6543002",
];

function buildVectorFile() {
  const quote = buildQuoteBody(FIXED_INPUT);
  const signed = signQuote(quote, SEED);
  return {
    description:
      "Quote protocol v1 vectors, generated and checked by packages/core/test/quote.test.ts (UPDATE_VECTORS=1 regenerates). " +
      "canonical = canonicalize(quote); sha256 = hex sha256(UTF-8 canonical) = on-chain quote_hash; " +
      "signature = base58 Ed25519(canonical bytes) with the 32-byte seed; booking_id = sha256('stumari-booking-v1' || quote_id)[0..16].",
    seed_hex: bytesToHex(SEED),
    signer: signed.signer,
    quote,
    canonical: canonicalize(quote),
    sha256: signed.hash,
    signature: signed.signature,
    uuid_bytes: UUID_VECTORS.map((uuid) => ({ uuid, bytes_hex: bytesToHex(uuidToBytes(uuid)) })),
    booking_ids: QUOTE_ID_VECTORS.map((quote_id) => ({ quote_id, booking_id_hex: bookingIdHex(quote_id) })),
  };
}

const VECTOR_PATH = "spec/vectors/quote.json";

describe("spec/vectors/quote.json", () => {
  it("matches the fixture exactly (fails on drift)", () => {
    const fresh = buildVectorFile();
    if (process.env.UPDATE_VECTORS === "1") {
      writeFileSync(repoPath(VECTOR_PATH), `${JSON.stringify(fresh, null, 2)}\n`);
    }
    expect(repoFileExists(VECTOR_PATH), `${VECTOR_PATH} is missing; regenerate with UPDATE_VECTORS=1`).toBe(true);
    expect(readJson(VECTOR_PATH)).toEqual(fresh);
  });

  it("the committed envelope verifies and its derived fields hold", () => {
    const v = readJson<ReturnType<typeof buildVectorFile>>(VECTOR_PATH);
    expect(verifyQuote({ quote: v.quote, signer: v.signer, signature: v.signature, hash: v.sha256 }, v.signer)).toBe(true);
    expect(publicKeyBase58(SEED)).toBe(v.signer);
    expect(canonicalize(v.quote)).toBe(v.canonical);
    expect(v.quote.expires_at - v.quote.issued_at).toBe(QUOTE_TTL_SECS);
    expect(v.quote.nights).toBe(3);
  });
});

describe("canonicalize", () => {
  it("sorts keys by UTF-16 code units, no whitespace, recursively", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"], c: { z: 0, y: -1 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":-1,"z":0}}');
    // U+1F600 is the surrogate pair D83D DE00, which sorts before U+FB01 in UTF-16 (after it by code point).
    expect(canonicalize({ "\uFB01": 1, "😀": 2, a: 3, B: 4 })).toBe('{"B":4,"a":3,"😀":2,"ﬁ":1}');
  });

  it("is independent of key insertion order", () => {
    const body = buildQuoteBody(FIXED_INPUT);
    const reversed = Object.fromEntries(Object.entries(body).reverse());
    expect(canonicalize(reversed)).toBe(canonicalize(body));
    expect(hashQuote(reversed as unknown as QuoteBody).hex).toBe(hashQuote(body).hex);
  });

  it("escapes strings like JSON.stringify", () => {
    expect(canonicalize({ s: 'a"b\\c\n\u2028ქ' })).toBe(`{"s":${JSON.stringify('a"b\\c\n\u2028ქ')}}`);
  });

  it.each([
    ["float", { x: 1.5 }],
    ["NaN", { x: Number.NaN }],
    ["Infinity", { x: Infinity }],
    ["unsafe integer", { x: 2 ** 53 }],
    ["undefined value", { x: undefined }],
    ["bigint", { x: 1n }],
    ["function", { x: () => 1 }],
    ["array hole", { x: [1, , 3] }],
    ["Date", { x: new Date(0) }],
    ["Uint8Array", { x: new Uint8Array(2) }],
  ])("rejects %s", (_, value) => {
    expect(code(() => canonicalize(value))).toBe("NonCanonical");
  });

  it("rejects cycles but allows repeated references", () => {
    const shared = { a: 1 };
    expect(canonicalize({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(code(() => canonicalize(cyclic))).toBe("NonCanonical");
  });
});

describe("sign / verify", () => {
  const body = buildQuoteBody(FIXED_INPUT);
  const signed = signQuote(body, SEED);

  it("round-trips, also with a 64-byte Solana keypair", () => {
    expect(verifyQuote(signed)).toBe(true);
    expect(verifyQuote(signed, signed.signer)).toBe(true);
    expect(signed.hash).toBe(hashQuote(body).hex);
    const keypair = new Uint8Array(64);
    keypair.set(SEED);
    keypair.set(base58.decode(signed.signer), 32);
    expect(signQuote(body, keypair)).toEqual(signed);
    keypair[63] = keypair[63]! ^ 1;
    expect(code(() => signQuote(body, keypair))).toBe("InvalidInput");
    expect(code(() => signQuote(body, new Uint8Array(31)))).toBe("InvalidInput");
  });

  it("detects tampering", () => {
    const tampered = structuredClone(signed);
    tampered.quote.options[0]!.price_minor = "1";
    expect(verifyQuote(tampered)).toBe(false);
    // re-hashing the tampered body still fails the signature
    expect(verifyQuote({ ...tampered, hash: hashQuote(tampered.quote).hex })).toBe(false);
    expect(verifyQuote({ ...signed, hash: "00".repeat(32) })).toBe(false);
    expect(verifyQuote(signed, publicKeyBase58(new Uint8Array(32).fill(2)))).toBe(false);
    expect(verifyQuote({ ...signed, signer: publicKeyBase58(new Uint8Array(32).fill(2)) })).toBe(false);
    expect(verifyQuote({ ...signed, signature: "not-base58-0OIl" })).toBe(false);
    expect(verifyQuote({ ...signed, quote: { ...signed.quote, extra: 1.5 } as unknown as QuoteBody })).toBe(false);
  });
});

describe("buildQuoteBody", () => {
  it("derives nights, expiry and random id/nonce", () => {
    const { id: _id, nonce: _nonce, ...rest } = FIXED_INPUT;
    const a = buildQuoteBody(rest);
    const b = buildQuoteBody(rest);
    expect(a.id).not.toBe(b.id);
    expect(a.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(a.v).toBe(1);
    expect(a.expires_at).toBe(rest.issued_at + 600);
    expect(a.nights).toBe(3);
  });

  it.each([
    ["bad cluster", { cluster: "testnet" }],
    ["bad program id", { program_id: "xyz" }],
    ["bad buyer wallet", { buyer_wallet: "0000" }],
    ["reversed dates", { checkout_date: "2026-12-09" }],
    ["reversed timestamps", { checkout_ts: FIXED_INPUT.checkin_ts }],
    ["no adults", { adults: 0 }],
    ["float price", { base_price_minor: "100.5" }],
    ["no options", { options: [] }],
    ["zero price", { options: [{ id: "standard", price_minor: "0", deposit_bps: 10_000, tiers: tiers("standard") }] }],
    ["bad tiers", { options: [{ id: "standard", price_minor: "1", deposit_bps: 10_000, tiers: [{ secs_before: 5, refund_bps: 0 }] }] }],
    ["uppercase id", { id: "6F1C1C9E-3F0A-4C43-9D2B-8A7E5B0C4D21" }],
    ["short nonce", { nonce: "00" }],
  ])("rejects %s", (_, over) => {
    expect(code(() => buildQuoteBody({ ...FIXED_INPUT, ...(over as Partial<QuoteBodyInput>) }))).toMatch(/InvalidInput|InvalidAmount|InvalidTiers/);
  });

  const option = (id: string, deposit_bps = 10_000) => ({ id, price_minor: "1", deposit_bps, tiers: tiers("standard") });

  it.each([
    ["decimals other than 6", { decimals: 9 }],
    ["empty hotel_slug", { hotel_slug: "" }],
    ["blank hotel_slug", { hotel_slug: "  " }],
    ["partial deposit (ADR-0002)", { options: [option("standard", 5_000)] }],
    ["deposit above 100%", { options: [option("standard", 10_001)] }],
    ["duplicate option ids", { options: [option("standard"), option("flexible"), option("standard")] }],
  ])("enforces the MVP constants: rejects %s", (_, over) => {
    expect(code(() => buildQuoteBody({ ...FIXED_INPUT, ...(over as Partial<QuoteBodyInput>) }))).toBe("InvalidInput");
  });
});
