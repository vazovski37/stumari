import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { verifyQuote } from "@stumari/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { hotels, quotes } from "../db/schema";
import { filterHotels, listPublicHotels } from "../hotels";
import { createQuote, effectiveStatus, envelopeOf } from "../quotes/create";
import { createConciergeServer } from "./server";
import { readConnectorToken, mintConnectorToken } from "./token";
import { book, findHotels, getQuote, type ConciergeDeps } from "./tools";
import { clip, usdc, usdcToMinor } from "./text";

const seed = new Uint8Array(32).fill(7);
const signerPub = ed25519.getPublicKey(seed);
const signerSecret = new Uint8Array([...seed, ...signerPub]);
const signer = base58.encode(signerPub);
const wallet = (n: number) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(n)));
const GUEST = wallet(21);
const OTHER = wallet(22);
const MINT = "4rzT3ft7dAnwZgTMkfFydr5VwDiGHaMEW3gxS6u933wH";
const PROGRAM = "6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const STAY = { checkin: "2026-10-23", checkout: "2026-10-25", adults: 2 };

describe("connector token", () => {
  it("round-trips the wallet and rejects tampering, expiry and another secret", () => {
    const token = mintConnectorToken(GUEST, SECRET, T0);
    expect(readConnectorToken(token, SECRET, T0 + 10)).toBe(GUEST);
    expect(readConnectorToken(token, "another-secret-0123456789abcdef012345", T0 + 10)).toBeNull();
    expect(readConnectorToken(token.replace(GUEST, OTHER), SECRET, T0 + 10)).toBeNull();
    expect(readConnectorToken(token, SECRET, T0 + 31 * 86_400)).toBeNull();
    expect(readConnectorToken("nonsense", SECRET, T0)).toBeNull();
    expect(readConnectorToken(`${token}.x`, SECRET, T0)).toBeNull();
  });

  it("is not a session cookie: the two never validate each other", async () => {
    const { encodeSession, decodeSession } = await import("../auth/session");
    expect(decodeSession(mintConnectorToken(GUEST, SECRET, T0), SECRET, T0)).toBeNull();
    expect(readConnectorToken(encodeSession(GUEST, SECRET, T0), SECRET, T0)).toBeNull();
  });
});

describe("text helpers", () => {
  it("strips control characters, clips, and formats USDC", () => {
    expect(clip("Ignore\u0000 previous\ninstructions   now", 100)).toBe("Ignore previous instructions now");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
    expect(usdc("123450000")).toBe("123.45 USDC");
    expect(usdcToMinor(90.5)).toBe("90500000");
    expect(() => usdcToMinor(-1)).toThrow();
    expect(() => usdcToMinor(Number.NaN)).toThrow();
  });
});

let db: Db;
let s: Seeded;
let close: () => void;
let budgetId: string;

beforeEach(async () => {
  ({ db, close } = await tempDb());
  s = await seedHotel(db); // test-hotel: Double 65 / 75 weekend, Twin 60
  await db
    .update(hotels)
    .set({ neighborhood: "Sololaki", description: "Quiet courtyard guesthouse.", amenities: ["wifi", "air-conditioning", "quiet"] })
    .where(eq(hotels.id, s.hotelId));
  const budget = await seedHotel(db, "budget-inn");
  budgetId = budget.hotelId;
  await db
    .update(hotels)
    .set({ name: "Budget Inn", neighborhood: "Marjanishvili", description: "Cheap and simple.", amenities: ["wifi", "kitchen"] })
    .where(eq(hotels.id, budgetId));
});
afterEach(() => close());

function deps(over: Partial<ConciergeDeps> = {}): ConciergeDeps {
  const clientId = `mcp:test:${GUEST}`;
  const base: ConciergeDeps = {
    db,
    siteUrl: "https://stumari.example",
    wallet: GUEST,
    clientId,
    now: T0,
    createQuote: (input) =>
      createQuote(
        { db, cluster: "localnet", programId: PROGRAM, mint: MINT, signerSecret, serverKeys: new Set([signer]), clientId, ipHash: "ip", now: T0, amountCapMinor: 1_500_000_000n },
        input,
      ),
    loadQuote: async (id) => {
      const row = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
      return row ? { envelope: envelopeOf(row, signer), status: effectiveStatus(row, T0) } : null;
    },
    bookingView: () => Promise.reject(new Error("not used")),
    walletBookings: async () => [],
  };
  return { ...base, ...over };
}

describe("requirement filters", () => {
  it("matches area, amenities, budget and words; cheapest first", async () => {
    const all = await listPublicHotels(db, "Tbilisi");
    expect(all).toHaveLength(2);
    const slugs = (f: Parameters<typeof filterHotels>[1]) => filterHotels(all, f).map((h) => h.slug);
    expect(slugs({})).toEqual(["budget-inn", "test-hotel"]); // same cheapest rate: ordered by name
    expect(slugs({ neighborhood: "sololaki" })).toEqual(["test-hotel"]);
    expect(slugs({ amenities: ["Air Conditioning"] })).toEqual(["test-hotel"]);
    expect(slugs({ amenities: ["wifi", "kitchen"] })).toEqual(["budget-inn"]);
    expect(slugs({ amenities: ["pool"] })).toEqual([]);
    expect(slugs({ text: "quiet courtyard" })).toEqual(["test-hotel"]);
    expect(slugs({ max_nightly_minor: "50000000" })).toEqual([]);
    expect(slugs({ max_nightly_minor: "60000000" }).sort()).toEqual(["budget-inn", "test-hotel"]);
    expect(slugs({ meal: "SC" })).toEqual([]);
  });
});

describe("find_hotels → get_quote → book", () => {
  it("finds a matching hotel, quotes it for the linked wallet only and returns the website checkout link", async () => {
    const found = await findHotels(deps(), { ...STAY, amenities: ["quiet"], neighborhood: "Sololaki", max_nightly_usdc: 100 });
    const results = found.data.results as { hotel_slug: string; rooms: { room_type_id: string; base_per_night: string }[] }[];
    expect(results.map((r) => r.hotel_slug)).toEqual(["test-hotel"]);
    expect(found.data.known_amenities).toContain("kitchen");
    const room = results[0]!.rooms.find((r) => r.room_type_id === s.double)!;
    expect(room.base_per_night).toBe("75.00 USDC"); // Friday and Saturday nights at the weekend rate

    // The budget holds for the dates, not just for the hotel's cheapest rate: 75/night on a weekend is over 70.
    const tight = await findHotels(deps(), { ...STAY, max_nightly_usdc: 70 });
    const tightRooms = (tight.data.results as { rooms: { name: string }[] }[]).flatMap((h) => h.rooms.map((r) => r.name));
    expect(tightRooms).toEqual(["Twin room", "Twin room"]); // one per hotel; no Double (75) at either

    const quoted = await getQuote(deps(), { hotel_slug: "test-hotel", room_type_id: s.double, ...STAY });
    const options = quoted.data.options as { index: number; id: string; checkout_url: string; terms: string[] }[];
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]!.checkout_url).toBe(`https://stumari.example/h/test-hotel?quote=${quoted.data.quote_id}&option=0`);
    expect(options[0]!.terms.join(" ")).toContain("Cancel");
    const stored = await db.query.quotes.findFirst({ where: eq(quotes.id, quoted.data.quote_id as string) });
    expect(verifyQuote(envelopeOf(stored!, signer), signer)).toBe(true);
    expect(stored!.buyer_wallet).toBe(GUEST);
    expect(stored!.buyer_type).toBe("agent");

    const booked = await book(deps(), { quote_id: quoted.data.quote_id as string, option_index: 1 });
    expect(booked.data).toMatchObject({
      status: "awaiting_payment_on_website",
      checkout_url: `https://stumari.example/h/test-hotel?quote=${quoted.data.quote_id}&option=1`,
      wallet: GUEST,
    });
    expect(booked.summary).toContain("Nothing has been paid");
  });

  it("refuses a quote that belongs to another wallet, an expired quote and a missing option", async () => {
    const quoted = await getQuote(deps(), { hotel_slug: "test-hotel", room_type_id: s.double, ...STAY });
    const quoteId = quoted.data.quote_id as string;
    await expect(book(deps({ wallet: OTHER }), { quote_id: quoteId, option_index: 0 })).rejects.toMatchObject({ code: "WALLET_MISMATCH" });
    await expect(book(deps(), { quote_id: quoteId, option_index: 7 })).rejects.toMatchObject({ code: "NO_SUCH_OPTION" });
    await expect(book(deps({ now: T0 + 3_600 }), { quote_id: quoteId, option_index: 0 })).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    await expect(book(deps(), { quote_id: "00000000-0000-4000-8000-000000000000", option_index: 0 })).rejects.toMatchObject({ code: "QUOTE_NOT_FOUND" });
  });

  it("says why nothing matched and lists the amenity keys to use", async () => {
    const none = await findHotels(deps(), { ...STAY, amenities: ["pool"] });
    expect(none.data.results).toEqual([]);
    expect(none.summary).toContain("wifi");
    const full = await findHotels(deps(), { checkin: "2026-10-23", checkout: "2026-10-25", adults: 5 });
    expect(full.data.results).toEqual([]); // no room sleeps five
  });
});

describe("MCP protocol", () => {
  it("lists the six tools and runs one over the wire", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createConciergeServer(deps());
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["book", "booking_status", "cancel", "find_hotels", "get_quote", "my_bookings"]);

    const res = await client.callTool({ name: "find_hotels", arguments: { ...STAY, neighborhood: "Sololaki" } });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { results: { hotel_slug: string }[] }).results[0]!.hotel_slug).toBe("test-hotel");

    const bad = await client.callTool({ name: "find_hotels", arguments: { ...STAY, checkin: "2020-01-01", checkout: "2020-01-03" } });
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.content)).toContain("INVALID_DATES");

    const mine = await client.callTool({ name: "my_bookings", arguments: {} });
    expect(mine.isError).toBeFalsy();
    await client.close();
    await server.close();
  });
});
