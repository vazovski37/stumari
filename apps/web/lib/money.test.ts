import { describe, expect, it } from "vitest";
import { contractExamples, EXAMPLE_BASE_MINOR } from "./contract-examples";
import { formatChange, formatUsdc } from "./money";

describe("formatUsdc", () => {
  it("formats base units with two decimals and grouping", () => {
    expect(formatUsdc(104_730_000n)).toBe("104.73");
    expect(formatUsdc(1_500_000_000n)).toBe("1,500.00");
    expect(formatUsdc(0n)).toBe("0.00");
    expect(formatUsdc(9_999n)).toBe("0.00");
    expect(formatUsdc(-2_500_000n)).toBe("-2.50");
  });
});

describe("formatChange", () => {
  it("shows the signed change against the base rate", () => {
    expect(formatChange(104_730_000n, EXAMPLE_BASE_MINOR)).toBe("+4.73%");
    expect(formatChange(95_890_000n, EXAMPLE_BASE_MINOR)).toBe("−4.11%");
    expect(formatChange(EXAMPLE_BASE_MINOR, EXAMPLE_BASE_MINOR)).toBe("0%");
  });
});

describe("landing contract examples (pricing-and-risk-model.md §6)", () => {
  it("keep the reference template at the base rate and order prices by generosity", () => {
    for (const prices of contractExamples) {
      expect(prices.standard).toBe(EXAMPLE_BASE_MINOR);
      expect(prices.flexible! > prices.standard!).toBe(true);
      if (prices.nonrefundable !== null) expect(prices.nonrefundable < prices.standard!).toBe(true);
    }
    expect(contractExamples[1].nonrefundable).toBeNull();
  });
});
