import type { ContractTemplate } from "./db/schema";

/**
 * The two worked examples of docs/architecture/pricing-and-risk-model.md §6
 * (B = 100.00 USDC, reference template Standard, default resale settings).
 * Shown on the landing page as an illustration; real quotes come from @stumari/core.
 */
export const EXAMPLE_BASE_MINOR = 100_000_000n;

/** Price per template in base units; null = not shown (identical terms on every reachable window). */
export type ExamplePrices = Record<ContractTemplate, bigint | null>;

export const contractExamples: [ExamplePrices, ExamplePrices] = [
  // Request A — lead 60 days, P(cancel) ≈ 0.31
  { flexible: 104_730_000n, standard: 100_000_000n, nonrefundable: 95_890_000n },
  // Request B — lead 2 days, P(cancel) ≈ 0.08
  { flexible: 105_210_000n, standard: 100_000_000n, nonrefundable: null },
];
