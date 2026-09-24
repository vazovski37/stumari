import type { GetGenesisHashApi, Rpc } from "@solana/kit";
import type { Env } from "./env";

export const clusters = ["localnet", "devnet"] as const;
export type Cluster = (typeof clusters)[number];

export const LOCALNET_RPC = "http://127.0.0.1:8899";
export const DEVNET_RPC = "https://api.devnet.solana.com";

const isLocalUrl = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

export function parseCluster(value: string | undefined): Cluster {
  if (value === "mainnet-beta" || value === "mainnet") {
    throw new Error("these scripts never touch mainnet (CLAUDE.md); use localnet or devnet");
  }
  if (!clusters.includes(value as Cluster)) throw new Error(`cluster must be localnet or devnet, got ${value ?? "nothing"}`);
  return value as Cluster;
}

/**
 * Localnet is always the Docker surfnet (ADR-0015). Devnet keeps a configured non-local
 * SOLANA_RPC_URL (e.g. Helius) and otherwise uses the public endpoint.
 */
export function rpcUrlFor(cluster: Cluster, env: Env): string {
  if (cluster === "localnet") return LOCALNET_RPC;
  const configured = env["SOLANA_RPC_URL"];
  if (configured && /mainnet/i.test(configured)) throw new Error("SOLANA_RPC_URL points at mainnet; refusing");
  return configured && !isLocalUrl(configured) ? configured : DEVNET_RPC;
}

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

/**
 * Devnet is identified by its genesis hash, not by the URL text, so a mainnet provider URL
 * without "mainnet" in it is still refused before any transaction. (Localnet is identified
 * as a surfnet instead: an offline surfnet may report mainnet's genesis hash.)
 */
export async function assertDevnetGenesis(cluster: Cluster, rpc: Rpc<GetGenesisHashApi>): Promise<void> {
  if (cluster !== "devnet") return;
  const genesis = await rpc.getGenesisHash().send();
  if (genesis !== DEVNET_GENESIS) throw new Error(`the RPC's genesis hash ${genesis} is not devnet's; refusing`);
}

/** Cluster + RPC of an already bootstrapped environment (fund, timetravel, smoke). */
export function configuredCluster(env: Env): { cluster: Cluster; rpcUrl: string } {
  const cluster = parseCluster(env["STUMARI_CLUSTER"]);
  return { cluster, rpcUrl: rpcUrlFor(cluster, env) };
}
