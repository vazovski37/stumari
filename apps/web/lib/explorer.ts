import type { Cluster } from "./env-schema";

/**
 * Solana Explorer link with the right cluster; localnet uses a custom RPC URL (the local Surfpool
 * is reachable from the viewer's browser only on the same machine).
 */
export function explorerUrl(kind: "address" | "tx", id: string, cluster: Cluster, rpcUrl: string): string {
  const base = `https://explorer.solana.com/${kind}/${id}`;
  if (cluster === "mainnet-beta") return base;
  if (cluster === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
}
