import { formatUsdc as coreFormatUsdc } from "@stumari/core";
import { describe, expect, it } from "vitest";
import { contractExamples, EXAMPLE_BASE_MINOR } from "./contract-examples";
import { formatChange, formatUsdc } from "./money";

describe("formatUsdc", () => {
  it("formats base units with two decimals and grouping", () => {
    expect(formatUsdc(104_730_000n)).toBe("104.73");
    expect(formatUsdc(1_500_000_000n)).toBe("1,500.00");
    expect(formatUsdc(0n)).toBe("0.00");
    expect(formatUsdc(-2_500_000n)).toBe("-2.50");
  });

  it("shows every non-zero digit of an amount that is not a whole cent, so halves add up", () => {
    expect(formatUsdc(52_365_000n)).toBe("52.365");
    expect(formatUsdc(9_999n)).toBe("0.009999");
    expect(formatUsdc(1_234_567_891n)).toBe("1,234.567891");
    expect(formatUsdc(-1_005_000n)).toBe("-1.005");
    // The same digits as @stumari/core, which appends the unit.
    for (const minor of [0n, 1n, 104_730_000n, 52_365_000n, 1_500_000_000n]) {
      expect(`${formatUsdc(minor)} USDC`).toBe(coreFormatUsdc(minor));
    }
  });
});

describe("formatChange", () => {
  it("shows the signed change against the base rate", () => {
    expect(formatChange(104_730_000n, EXAMPLE_BASE_MINOR)).toBe("+4.73%");
    expect(formatChange(95_890_000n, EXAMPLE_BASE_MINOR)).toBe("−4.11%");
    expect(formatChange(EXAMPLE_BASE_MINOR, EXAMPLE_BASE_MINOR)).toBe("0%");
  });
});

describe("landing contract examples (the shipped model's output, lib/contract-examples.ts)", () => {
  it("keep the reference template at the base rate and order prices by generosity", () => {
    for (const prices of contractExamples) {
      expect(prices.standard).toBe(EXAMPLE_BASE_MINOR);
      expect(prices.flexible! > prices.standard!).toBe(true);
      if (prices.nonrefundable !== null) expect(prices.nonrefundable < prices.standard!).toBe(true);
    }
    expect(contractExamples[1].nonrefundable).toBeNull();
  });
});
