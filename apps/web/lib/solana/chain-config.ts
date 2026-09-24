import "server-only";
import { fetchMaybeConfig, type ConfigView } from "@stumari/escrow-client";
import type { SolanaRpc } from "./context";

const TTL_MS = 60_000;
let cached: { at: number; config: ConfigView | null } | undefined;

/** The on-chain Config (fee, release delay, treasury), cached for a minute; null if unreadable. */
export async function onchainConfig(rpc: SolanaRpc): Promise<ConfigView | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const config = await fetchMaybeConfig(rpc);
    cached = { at: Date.now(), config };
    return config;
  } catch {
    return cached?.config ?? null;
  }
}
