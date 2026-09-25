import { describe, expect, it } from "vitest";
import {
  checkinTs,
  CoreError,
  DEFAULT_POLICY,
  loadModel,
  modelProvider,
  priceFromMultiplier,
  priceMenu,
  qVector,
  TEMPLATE_IDS,
  TEMPLATES,
  validatePolicy,
  validateTiers,
  type ExplainOption,
  type HazardProvider,
  type ModelRequest,
  type PricingPolicy,
  type TemplateId,
} from "../src/index";
import tinyJson from "./fixtures/tiny-model.json" with { type: "json" };

const B = 100_000_000n; // 100.00 USDC

function request(leadDays: number): ModelRequest {
  const checkin = checkinTs("2026-12-10", "14:00", "Asia/Tbilisi");
  return {
    issued_at: checkin - leadDays * 86_400 - 120,
    checkin_ts: checkin,
    checkin_date: "2026-12-10",
    checkout_date: "2026-12-13",
    adults: 2,
    children: 0,
    buyer_type: "guest",
    hotel_type: "City Hotel",
    meal: "BB",
    is_repeated_guest: 0,
    previous_bookings_not_canceled: 0,
  };
}

/** A provider that returns fixed q (hazards reconstructed only for the explain block). */
function stub(q: number[]): HazardProvider {
  return () => ({
    model_version: "stub",
    hazard: q.map((qk) => qk),
    q,
    p_cancel: q.reduce((a, b) => a + b, 0),
  });
}

const policy = (over: Partial<PricingPolicy> = {}): PricingPolicy => ({ ...structuredClone(DEFAULT_POLICY), ...over });
const byId = (opts: ExplainOption[], id: TemplateId) => opts.find((o) => o.id === id)!;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CoreError ? e.code : "not-a-CoreError";
  }
  return undefined;
};

describe("worked examples (pricing §6)", () => {
  it("Request A (lead 60 d): 104.73 / 100.00 / 95.89", () => {
    const q = [0.132, 0.052, 0.044, 0.043, 0.02, 0.017];
    const menu = priceMenu({ provider: stub(q), request: request(60), policy: policy(), basePriceMinor: B });
    expect(menu.options.map((o) => [o.id, o.price_minor])).toEqual([
      ["flexible", "104730000"],
      ["standard", "100000000"],
      ["nonrefundable", "95890000"],
    ]);
    const e = menu.explain;
    expect(byId(e.options, "standard").risk_cost).toBeCloseTo(0.04115, 12);
    expect(byId(e.options, "flexible").risk_cost).toBeCloseTo(0.08445, 12);
    expect(byId(e.options, "nonrefundable").risk_cost).toBe(0);
    expect(e.options.map((o) => o.m_bps)).toEqual([10473, 10000, 9589]);
    expect(byId(e.options, "flexible").multiplier).toBeCloseTo(1.04729, 5);
    expect(e.p_cancel).toBeCloseTo(0.308, 12);
    expect(e.lead_time).toBe(60);
  });

  it("Request B (lead 2 d): 105.21 / 100.00, non-refundable hidden as identical to standard", () => {
    const q = [0, 0, 0, 0, 0.05, 0.03];
    const menu = priceMenu({ provider: stub(q), request: request(2), policy: policy(), basePriceMinor: B });
    expect(menu.options.map((o) => [o.id, o.price_minor])).toEqual([
      ["flexible", "105210000"],
      ["standard", "100000000"],
    ]);
    expect(byId(menu.explain.options, "flexible").m_bps).toBe(10521);
    expect(byId(menu.explain.options, "flexible").risk_cost).toBeCloseTo(0.0495, 12);
    expect(byId(menu.explain.options, "nonrefundable")).toMatchObject({ withheld: "duplicate_terms", same_as: "standard" });
  });
});

describe("quote options and explain block", () => {
  it("options carry the template tiers and full prepay", () => {
    const menu = priceMenu({ provider: stub([0.1, 0.05, 0.04, 0.03, 0.02, 0.01]), request: request(45), policy: policy(), basePriceMinor: B });
    for (const o of menu.options) {
      expect(o.tiers).toEqual(TEMPLATES[o.id].tiers);
      expect(o.deposit_bps).toBe(10_000);
      expect(() => validateTiers(o.tiers)).not.toThrow();
    }
    const e = menu.explain;
    expect(Object.keys(e).sort()).toEqual(
      ["buyer_type", "features", "hazard", "lead_time", "model_version", "options", "p_cancel", "p_uncalibrated", "q", "reference_template", "resale_bps"].sort(),
    );
    expect(Object.keys(e.options[0]!).sort()).toEqual(
      ["clamped", "expected_revenue_minor", "id", "m_bps", "multiplier", "price_minor", "risk_cost", "same_as", "withheld"].sort(),
    );
    expect(e.reference_template).toBe("standard");
    expect(e.buyer_type).toBe("guest");
    expect(e.resale_bps).toEqual([9000, 8000, 6500, 4500, 2500, 1000]);
    expect(e.features.lead_time).toBe(45);
    // expected revenue is (almost exactly) equal across shown options — that is the anchor
    const revenues = e.options.map((o) => Number(o.expected_revenue_minor));
    for (const r of revenues) expect(Math.abs(r - revenues[1]!)).toBeLessThan(15_000);
  });

  it("withholds a template priced above max_mult_bps", () => {
    const menu = priceMenu({ provider: stub([0, 0, 0, 0, 0.4, 0.4]), request: request(60), policy: policy(), basePriceMinor: B });
    expect(menu.options.map((o) => o.id)).toEqual(["standard", "nonrefundable"]);
    const flex = byId(menu.explain.options, "flexible");
    expect(flex.withheld).toBe("risk_exceeds_bounds");
    expect(flex.m_bps).toBeGreaterThan(13_000);
    expect(flex.price_minor).toBeNull();
  });

  it("withholds when 1 − c_T ≤ 0.05, with a null multiplier when it is 0", () => {
    const zeroResale = [0, 0, 0, 0, 0, 0];
    const p = policy({ reference_template: "nonrefundable", resale_bps: zeroResale, max_mult_bps: 20_000 });
    const nearly = priceMenu({ provider: stub([0.96, 0, 0, 0, 0, 0]), request: request(60), policy: p, basePriceMinor: B });
    expect(nearly.options.map((o) => o.id)).toEqual(["nonrefundable"]);
    expect(byId(nearly.explain.options, "flexible").withheld).toBe("risk_exceeds_bounds");
    const certain = priceMenu({ provider: stub([1, 0, 0, 0, 0, 0]), request: request(60), policy: p, basePriceMinor: B });
    expect(byId(certain.explain.options, "flexible")).toMatchObject({ multiplier: null, m_bps: null, withheld: "risk_exceeds_bounds" });
  });

  it("floors at min_mult_bps and marks the clamp", () => {
    const p = policy({ reference_template: "flexible" });
    const menu = priceMenu({ provider: stub([0, 0, 0, 0, 0.4, 0.4]), request: request(60), policy: p, basePriceMinor: B });
    expect(menu.options.map((o) => [o.id, o.price_minor])).toEqual([
      ["flexible", "100000000"],
      ["standard", "85000000"],
      ["nonrefundable", "85000000"],
    ]);
    expect(byId(menu.explain.options, "nonrefundable")).toMatchObject({ m_bps: 8500, clamped: "floor" });
  });

  it("dedupes identical reachable terms: R wins, else menu order", () => {
    const q = [0, 0, 0, 0, 0.05, 0.03];
    const flexRef = priceMenu({ provider: stub(q), request: request(2), policy: policy({ reference_template: "flexible" }), basePriceMinor: B });
    expect(flexRef.options.map((o) => o.id)).toEqual(["flexible", "standard"]);
    const nrRef = priceMenu({ provider: stub(q), request: request(2), policy: policy({ reference_template: "nonrefundable" }), basePriceMinor: B });
    expect(nrRef.options.map((o) => o.id)).toEqual(["flexible", "nonrefundable"]);
    expect(byId(nrRef.explain.options, "standard")).toMatchObject({ withheld: "duplicate_terms", same_as: "nonrefundable" });
    // L = 5: standard still refunds 50% in window 3, so all three differ
    const l5 = priceMenu({ provider: stub([0, 0, 0, 0.02, 0.05, 0.03]), request: request(5), policy: policy(), basePriceMinor: B });
    expect(l5.options.map((o) => o.id)).toEqual(["flexible", "standard", "nonrefundable"]);
  });

  it("withholds options priced above the amount cap, keeping their price in the explain block", () => {
    const q = [0.132, 0.052, 0.044, 0.043, 0.02, 0.017]; // Request A: 104.73 / 100.00 / 95.89
    const input = { provider: stub(q), request: request(60), policy: policy(), basePriceMinor: B };
    const uncapped = priceMenu(input);
    // A cap no option reaches changes nothing, and the cap is inclusive.
    expect(priceMenu({ ...input, amountCapMinor: 104_730_000n })).toEqual(uncapped);

    const capped = priceMenu({ ...input, amountCapMinor: 100_000_000n });
    expect(capped.options.map((o) => [o.id, o.price_minor])).toEqual([
      ["standard", "100000000"],
      ["nonrefundable", "95890000"],
    ]);
    expect(byId(capped.explain.options, "flexible")).toMatchObject({ withheld: "over_amount_cap", price_minor: "104730000", m_bps: 10473 });
    expect(capped.explain.options.filter((o) => o.id !== "flexible")).toEqual(uncapped.explain.options.filter((o) => o.id !== "flexible"));

    // The reference template is withheld like any other; below every price nothing is offered.
    const none = priceMenu({ ...input, amountCapMinor: 95_889_999n });
    expect(none.options).toEqual([]);
    expect(none.explain.options.map((o) => o.withheld)).toEqual(["over_amount_cap", "over_amount_cap", "over_amount_cap"]);
  });

  it("keeps the other withheld reasons ahead of the amount cap", () => {
    const menu = priceMenu({ provider: stub([0, 0, 0, 0, 0.4, 0.4]), request: request(60), policy: policy(), basePriceMinor: B, amountCapMinor: 1n });
    expect(byId(menu.explain.options, "flexible").withheld).toBe("risk_exceeds_bounds");
    const dup = priceMenu({ provider: stub([0, 0, 0, 0, 0.05, 0.03]), request: request(2), policy: policy(), basePriceMinor: B, amountCapMinor: 1n });
    expect(byId(dup.explain.options, "nonrefundable").withheld).toBe("duplicate_terms");
  });

  it("omits disabled templates entirely", () => {
    const p = policy({ enabled_templates: ["standard", "flexible"] });
    const menu = priceMenu({ provider: stub([0.1, 0, 0, 0, 0, 0]), request: request(60), policy: p, basePriceMinor: B });
    expect(menu.explain.options.map((o) => o.id)).toEqual(["flexible", "standard"]);
  });

  it("rejects a risk estimate with mass on unreachable windows", () => {
    expect(code(() => priceMenu({ provider: stub([0.1, 0, 0, 0, 0, 0]), request: request(2), policy: policy(), basePriceMinor: B }))).toBe(
      "InvalidInput",
    );
    expect(code(() => priceMenu({ provider: stub([0, 0, 0, 0, 0, 0]), request: request(2), policy: policy(), basePriceMinor: 0n }))).toBe(
      "InvalidAmount",
    );
  });

  it("prices with the real evaluator end to end", () => {
    const menu = priceMenu({ provider: modelProvider(loadModel(tinyJson)), request: request(2), policy: policy(), basePriceMinor: 123_456_789n });
    expect(menu.explain.model_version).toBe("hazard-gbdt-tiny-fixture");
    expect(menu.explain.p_uncalibrated).toHaveLength(6);
    expect(menu.options.find((o) => o.id === "standard")!.price_minor).toBe("123460000");
  });
});

describe("validatePolicy", () => {
  it("accepts and normalizes the defaults", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual(DEFAULT_POLICY);
    expect(validatePolicy(policy({ enabled_templates: ["nonrefundable", "standard"] })).enabled_templates).toEqual([
      "standard",
      "nonrefundable",
    ]);
  });

  it.each([
    ["unknown reference", { reference_template: "cheap" }],
    ["reference not enabled", { reference_template: "flexible", enabled_templates: ["standard"] }],
    ["empty enabled", { enabled_templates: [] }],
    ["duplicate enabled", { enabled_templates: ["standard", "standard"] }],
    ["resale too short", { resale_bps: [1, 2, 3] }],
    ["resale above 10000", { resale_bps: [10_001, 0, 0, 0, 0, 0] }],
    ["resale fractional", { resale_bps: [0.5, 0, 0, 0, 0, 0] }],
    ["min below 5000", { min_mult_bps: 4999 }],
    ["min above 10000", { min_mult_bps: 10_001 }],
    ["max below 10000", { max_mult_bps: 9999 }],
    ["max above 20000", { max_mult_bps: 20_001 }],
  ])("rejects %s", (_, over) => {
    expect(code(() => validatePolicy({ ...structuredClone(DEFAULT_POLICY), ...over }))).toBe("InvalidPolicy");
  });
});

describe("pricing properties (seeded random requests)", () => {
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("c_T ≥ 0, c_nr = 0, R = 10000, P_nr ≤ P_std ≤ P_flex, bounds respected", () => {
    const rand = rng(20261012);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let i = 0; i < 2000; i++) {
      const lead = int(0, 400);
      const lower = [30, 14, 7, 3, 1, 0];
      const q = qVector(lower.map((l) => (lead >= l ? rand() * (i % 3 === 0 ? 0.9 : 0.3) : null)));
      const p = policy({
        reference_template: TEMPLATE_IDS[int(0, 2)]!,
        resale_bps: lower.map(() => int(0, 10_000)),
        min_mult_bps: int(5000, 10_000),
        max_mult_bps: int(10_000, 20_000),
      });
      const base = BigInt(int(1, 2_000_000_000));
      const menu = priceMenu({ provider: stub(q), request: request(lead), policy: p, basePriceMinor: base });
      const ex = menu.explain.options;
      const cost = (id: TemplateId) => byId(ex, id).risk_cost;
      for (const o of ex) expect(o.risk_cost).toBeGreaterThanOrEqual(0);
      expect(cost("nonrefundable")).toBe(0);
      expect(cost("standard")).toBeLessThanOrEqual(cost("flexible"));

      const ref = byId(ex, p.reference_template);
      expect(ref).toMatchObject({ m_bps: 10_000, multiplier: 1, withheld: null, clamped: null });
      expect(ref.price_minor).toBe(priceFromMultiplier(base, 10_000).toString());

      for (const o of ex) {
        if (o.withheld === "risk_exceeds_bounds") {
          expect(o.m_bps === null || o.m_bps > p.max_mult_bps || 1 - o.risk_cost <= 0.05).toBe(true);
        } else if (o.withheld === null) {
          expect(o.m_bps!).toBeGreaterThanOrEqual(p.min_mult_bps);
          expect(o.m_bps!).toBeLessThanOrEqual(p.max_mult_bps);
          expect(o.price_minor).toBe(priceFromMultiplier(base, o.m_bps!).toString());
        }
      }
      const prices = menu.options.map((o) => BigInt(o.price_minor));
      for (let j = 1; j < prices.length; j++) expect(prices[j]! <= prices[j - 1]!).toBe(true);
      expect(menu.options.some((o) => o.id === p.reference_template)).toBe(true);
    }
  });
});
