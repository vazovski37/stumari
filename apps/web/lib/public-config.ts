import type { Cluster, ServerEnv } from "./env-schema";

/**
 * Pilot terms (docs/sales/offer.md). api.md says fee and delay come from the
 * on-chain Config; until the escrow client lands they are these constants.
 */
export const PILOT_FEE_BPS = 0;
export const PILOT_PAYOUT_DELAY_HOURS = 24;

export type PublicConfig = {
  cluster: Cluster;
  program_id: string;
  mint: string | null;
  quote_signer: string | null;
  demo_mode: boolean;
  pilot_offer: {
    fee_bps: number;
    payout_delay_hours: number;
    amount_cap_minor: string;
    currency: "USDC";
  };
};

/** Body of GET /api/config/public — public values only, never secrets. */
export function publicConfig(env: ServerEnv): PublicConfig {
  return {
    cluster: env.cluster,
    program_id: env.programId,
    mint: env.mint,
    quote_signer: env.operator?.publicKey ?? null,
    demo_mode: env.demoMode,
    pilot_offer: {
      fee_bps: PILOT_FEE_BPS,
      payout_delay_hours: PILOT_PAYOUT_DELAY_HOURS,
      amount_cap_minor: env.amountCapMinor.toString(),
      currency: "USDC",
    },
  };
}
