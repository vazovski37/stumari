import type { Explain, ExplainOption } from "@stumari/core";
import { describe, expect, it } from "vitest";
import { errorHint, radioKeyTarget, withheldText } from "./menu";

describe("contract menu radiogroup keys", () => {
  it("moves with the arrows and wraps at both ends", () => {
    expect(radioKeyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(radioKeyTarget("ArrowDown", 2, 3)).toBe(0);
    expect(radioKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(radioKeyTarget("ArrowUp", 1, 3)).toBe(0);
  });

  it("ignores other keys and empty menus", () => {
    expect(radioKeyTarget("Enter", 0, 3)).toBeNull();
    expect(radioKeyTarget(" ", 0, 3)).toBeNull();
    expect(radioKeyTarget("Tab", 0, 3)).toBeNull();
    expect(radioKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("withheld options", () => {
  const option = (over: Partial<ExplainOption>): ExplainOption => ({
    id: "flexible",
    risk_cost: 0.1,
    multiplier: 1.1,
    m_bps: 11_000,
    price_minor: "1650000000",
    expected_revenue_minor: null,
    clamped: null,
    withheld: null,
    same_as: null,
    ...over,
  });
  const explain = { reference_template: "standard" } as Explain;

  it("names the pilot cap for an option priced above it", () => {
    expect(withheldText(option({ withheld: "over_amount_cap" }), explain, "1500000000")).toBe(
      "Flexible is not offered: its price is above the pilot limit of 1,500.00 USDC per booking.",
    );
    expect(withheldText(option({ withheld: "over_amount_cap" }), explain, null)).toBe(
      "Flexible is not offered: its price is above the pilot limit per booking.",
    );
  });

  it("keeps the duplicate-terms and risk-bounds reasons", () => {
    expect(withheldText(option({ withheld: "duplicate_terms", same_as: "standard" }), explain, null)).toContain("same refunds as Standard");
    expect(withheldText(option({ withheld: "risk_exceeds_bounds" }), explain, null)).toContain("outside the hotel's price bounds");
  });
});

describe("error hints", () => {
  it("suggests a shorter stay when a quote is above the pilot cap", () => {
    expect(errorHint("AMOUNT_CAP")).toContain("shorter stay");
    expect(errorHint("QUOTE_EXPIRED")).toBeNull();
    expect(errorHint(null)).toBeNull();
  });
});
