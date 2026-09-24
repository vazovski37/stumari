import type { Cluster, ServerEnv } from "./env-schema";

/**
 * Pilot terms (docs/sales/offer.md), used until the on-chain Config can be read; api.md says fee
 * and payout delay come from the Config.
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
    /** Hours from check-in to release; fractional on the devnet demo config (120 s). */
    payout_delay_hours: number;
    amount_cap_minor: string;
    currency: "USDC";
  };
};

/** The on-chain Config fields that are public terms. */
export type OnchainTerms = { feeBps: number; releaseDelaySecs: number };

/** Body of GET /api/config/public — public values only, never secrets. */
export function publicConfig(env: ServerEnv, onchain: OnchainTerms | null = null): PublicConfig {
  return {
    cluster: env.cluster,
    program_id: env.programId,
    mint: env.mint,
    quote_signer: env.operator?.publicKey ?? null,
    demo_mode: env.demoMode,
    pilot_offer: {
      fee_bps: onchain?.feeBps ?? PILOT_FEE_BPS,
      payout_delay_hours: onchain ? Math.round((onchain.releaseDelaySecs / 3600) * 10_000) / 10_000 : PILOT_PAYOUT_DELAY_HOURS,
      amount_cap_minor: env.amountCapMinor.toString(),
      currency: "USDC",
    },
  };
}
