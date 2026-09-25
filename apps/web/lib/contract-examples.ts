import { checkinTs, walletHistoryFeatures, type ModelRequest } from "@stumari/core";
import type { ContractTemplate } from "./db/schema";

/**
 * The landing page's two example menus: the committed model's output (packages/core/model/model.json)
 * through `priceMenu`, with DEFAULT_POLICY and B = 100.00 USDC, for the demo hotel's settings
 * (City Hotel, BB, check-in 14:00 Asia/Tbilisi), 2 adults, 2 nights, a fresh wallet, both quoted on
 * 2 October 2026 at 12:00. contract-examples.test.ts recomputes them, so they cannot drift from the model.
 */
export const EXAMPLE_BASE_MINOR = 100_000_000n;

const TZ = "Asia/Tbilisi";
const CHECKIN_TIME = "14:00";
const ISSUED_AT = checkinTs("2026-10-02", "12:00", TZ);

function exampleRequest(checkin: string, checkout: string): ModelRequest {
  return {
    issued_at: ISSUED_AT,
    checkin_ts: checkinTs(checkin, CHECKIN_TIME, TZ),
    checkin_date: checkin,
    checkout_date: checkout,
    adults: 2,
    children: 0,
    buyer_type: "guest",
    hotel_type: "City Hotel",
    meal: "BB",
    ...walletHistoryFeatures(null, 0),
  };
}

/** Request A: check-in Tue 1 Dec 2026 (lead 60 days); request B: check-in Sun 4 Oct 2026 (lead 2 days). */
export const exampleRequests: [ModelRequest, ModelRequest] = [
  exampleRequest("2026-12-01", "2026-12-03"),
  exampleRequest("2026-10-04", "2026-10-06"),
];

/** The model's P(cancel) for each request, rounded to a whole percent (shown in the `model.compare.guests` details). */
export const examplePCancelPercent: [number, number] = [18, 7];

/** Price per template in base units; null = not shown (identical terms on every reachable window). */
export type ExamplePrices = Record<ContractTemplate, bigint | null>;

export const contractExamples: [ExamplePrices, ExamplePrices] = [
  // Request A — lead 60 days, P(cancel) ≈ 0.177
  { flexible: 103_230_000n, standard: 100_000_000n, nonrefundable: 97_450_000n },
  // Request B — lead 2 days, P(cancel) ≈ 0.065; Non-refundable has the same reachable terms as Standard
  { flexible: 103_970_000n, standard: 100_000_000n, nonrefundable: null },
];
