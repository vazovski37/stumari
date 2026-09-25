import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { request } from "@/test/http";
import type { Db } from "../db/client";
import { quotes } from "../db/schema";
import { insertQuoteHold } from "../inventory/holds";
import { CLIENT_COOKIE, holdOwner } from "./client";

const WALLET = "GuestWa11et1111111111111111111111111111111";
const quoteReq = (cookie?: string) => request("POST", "/api/quotes", { cookie, body: {} });

describe("holdOwner", () => {
  it("binds an agent's hold to the caller's IP as well as the (unproven) wallet", () => {
    const agent = { type: "agent" as const, wallet: WALLET };
    expect(holdOwner(quoteReq(), agent, "ip-1")).toEqual({ clientId: `mcp:ip-1:${WALLET}`, setCookie: null });
    expect(holdOwner(quoteReq(), agent, "ip-2").clientId).toBe(`mcp:ip-2:${WALLET}`);
    expect(holdOwner(quoteReq(), { type: "agent", wallet: null }, "ip-1").clientId).toBe("mcp:ip-1:anon");
  });

  it("keeps a browser's valid cookie as its owner", () => {
    const cid = "0123456789abcdef0123456789abcdef";
    expect(holdOwner(quoteReq(`${CLIENT_COOKIE}=${cid}`), { type: "guest", wallet: null }, "ip-1")).toEqual({ clientId: cid, setCookie: null });
  });
});

describe("agent holds", () => {
  let db: Db;
  let s: Seeded;
  let close: () => void;
  beforeEach(async () => {
    ({ db, close } = await tempDb());
    s = await seedHotel(db);
  });
  afterEach(() => close());

  const hold = (clientId: string, ip: string) => {
    const id = randomUUID();
    return insertQuoteHold(db, {
      id,
      hotel_id: s.hotelId,
      room_type_id: s.double,
      checkin_date: "2026-10-20",
      checkout_date: "2026-10-22",
      body: { id },
      signature: "sig",
      hash: "hash",
      explain: {},
      booking_id: id.replaceAll("-", ""),
      buyer_type: "agent",
      buyer_wallet: WALLET,
      client_id: clientId,
      ip_hash: ip,
      expires_at: T0 + 600,
      created_at: T0,
    }).then((unit) => ({ id, unit }));
  };

  it("cannot be expired by someone else quoting with the agent's wallet", async () => {
    const agent = { type: "agent" as const, wallet: WALLET };
    const victim = await hold(holdOwner(quoteReq(), agent, "ip-agent").clientId, "ip-agent");
    await hold(holdOwner(quoteReq(), agent, "ip-attacker").clientId, "ip-attacker");
    const [row] = await db.select().from(quotes).where(eq(quotes.id, victim.id));
    expect(row?.status).toBe("active");
    expect(victim.unit).toBe(s.units.D1);
  });
});
