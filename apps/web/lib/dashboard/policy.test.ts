import { DEFAULT_POLICY, validatePolicy } from "@stumari/core";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as policyRoute from "@/app/api/dashboard/[hotelId]/policy/route";
import { seedHotel, tempDb, type Seeded } from "@/test/db";
import { params, request, sessionFor, SITE, TEST_AUTH_SECRET, useDb } from "@/test/http";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { hotels } from "../db/schema";
import { hotelPolicy } from "../hotels";
import { parsePolicy, policyRequest } from "./policy";

/** The dashboard accepts exactly the policies `@stumari/core` `validatePolicy` (checkout pricing) accepts. */

const base = { ...DEFAULT_POLICY, enabled_templates: [...DEFAULT_POLICY.enabled_templates], resale_bps: [...DEFAULT_POLICY.resale_bps] };
const with_ = (patch: Record<string, unknown>) => ({ ...base, ...patch });

const CASES: [string, unknown][] = [
  ["defaults", base],
  ["only non-refundable", with_({ enabled_templates: ["nonrefundable"], reference_template: "nonrefundable" })],
  ["reference not enabled", with_({ enabled_templates: ["flexible", "nonrefundable"] })],
  ["no templates", with_({ enabled_templates: [] })],
  ["duplicate template", with_({ enabled_templates: ["standard", "standard"] })],
  ["unknown template", with_({ enabled_templates: ["standard", "gold"] })],
  ["unknown reference", with_({ reference_template: "gold" })],
  ["menu order normalized", with_({ enabled_templates: ["nonrefundable", "flexible", "standard"] })],
  ["resale 5 windows", with_({ resale_bps: [9000, 8000, 6500, 4500, 2500] })],
  ["resale 7 windows", with_({ resale_bps: [9000, 8000, 6500, 4500, 2500, 1000, 0] })],
  ["resale above 10000", with_({ resale_bps: [10001, 8000, 6500, 4500, 2500, 1000] })],
  ["resale at 10000 and 0", with_({ resale_bps: [10000, 0, 0, 0, 0, 0] })],
  ["resale negative", with_({ resale_bps: [-1, 8000, 6500, 4500, 2500, 1000] })],
  ["resale fractional", with_({ resale_bps: [9000.5, 8000, 6500, 4500, 2500, 1000] })],
  ["resale as strings", with_({ resale_bps: ["9000", "8000", "6500", "4500", "2500", "1000"] })],
  ["min 4999", with_({ min_mult_bps: 4999 })],
  ["min 5000", with_({ min_mult_bps: 5000 })],
  ["min 10000", with_({ min_mult_bps: 10000 })],
  ["min 10001", with_({ min_mult_bps: 10001 })],
  ["min as string", with_({ min_mult_bps: "8500" })],
  ["max 9999", with_({ max_mult_bps: 9999 })],
  ["max 10000", with_({ max_mult_bps: 10000 })],
  ["max 20000", with_({ max_mult_bps: 20000 })],
  ["max 20001", with_({ max_mult_bps: 20001 })],
  ["max NaN", with_({ max_mult_bps: Number.NaN })],
  ["missing max", { ...base, max_mult_bps: undefined }],
  ["extra keys ignored", with_({ deposit_bps: 5000 })],
];

function viaDashboard(input: unknown): { ok: true; value: unknown } | { ok: false } {
  const shape = policyRequest.safeParse(input);
  if (!shape.success) return { ok: false };
  try {
    return { ok: true, value: parsePolicy(shape.data) };
  } catch (e) {
    if (e instanceof ApiError && e.code === "INVALID_POLICY") return { ok: false };
    throw e;
  }
}

function viaCore(input: unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: validatePolicy(input) };
  } catch {
    return { ok: false };
  }
}

describe("policy validation parity with @stumari/core", () => {
  it.each(CASES)("%s", (_name, input) => {
    expect(viaDashboard(input)).toEqual(viaCore(input));
  });

  it("covers both outcomes", () => {
    const outcomes = CASES.map(([, input]) => viaCore(input).ok);
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
  });
});

describe("PATCH /api/dashboard/{hotelId}/policy", () => {
  const owner = base58.encode(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
  let db: Db;
  let close: () => void;
  let s: Seeded;

  beforeAll(() => {
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(async () => {
    ({ db, close } = await tempDb());
    useDb(db);
    s = await seedHotel(db);
    await db.update(hotels).set({ payout_wallet: owner }).where(eq(hotels.id, s.hotelId));
  });
  afterEach(() => close());

  const patch = (body: unknown) =>
    policyRoute.PATCH(request("PATCH", `/api/dashboard/${s.hotelId}/policy`, { cookie: sessionFor(owner), body }), params({ hotelId: s.hotelId }));

  it("stores a valid policy that checkout then reads through validatePolicy", async () => {
    const res = await patch(with_({ enabled_templates: ["standard", "flexible"], resale_bps: [5000, 4000, 3000, 2000, 1000, 0] }));
    expect(res.status).toBe(200);
    const hotel = await db.query.hotels.findFirst({ where: eq(hotels.id, s.hotelId) });
    expect(hotelPolicy(hotel!)).toEqual({ ...base, enabled_templates: ["flexible", "standard"], resale_bps: [5000, 4000, 3000, 2000, 1000, 0] });
  });

  it("answers 400 INVALID_POLICY with validatePolicy's reason and keeps the old policy", async () => {
    const res = await patch(with_({ enabled_templates: ["flexible"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_POLICY", message: "reference_template must be enabled" } });
    const hotel = await db.query.hotels.findFirst({ where: eq(hotels.id, s.hotelId) });
    expect(hotel!.policy).toEqual(base);
  });
});
