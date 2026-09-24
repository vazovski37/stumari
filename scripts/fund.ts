/**
 * Mints mock USDC to a wallet (operator = mint authority; the operator also pays the ATA rent):
 *   pnpm --filter @stumari/scripts fund --to <address> [--amount 500]
 * Uses the cluster written by the bootstrap (apps/web/.env.local).
 */
import { parseArgs } from "node:util";
import { address } from "@solana/kit";
import { formatUsdc, toMinor } from "@stumari/core";
import { fetchConfig } from "@stumari/escrow-client";
import { assertDevnetGenesis, configuredCluster } from "./lib/cluster";
import { loadEnv } from "./lib/env";
import { loadOperator } from "./lib/keys";
import { assertMintAuthority, mintTo } from "./lib/mint";
import { connect, tokenBalance } from "./lib/rpc";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { to: { type: "string" }, amount: { type: "string", default: "500" } },
  });
  if (!values.to) throw new Error("usage: fund --to <wallet address> [--amount 500]");
  const owner = address(values.to);
  const amount = toMinor(values.amount);
  if (amount <= 0n) throw new Error("--amount must be positive");

  const env = loadEnv();
  const { cluster, rpcUrl } = configuredCluster(env);
  const rpc = connect(rpcUrl);
  await assertDevnetGenesis(cluster, rpc);
  const operator = (await loadOperator(env)).signer;
  const { mint } = await fetchConfig(rpc);
  await assertMintAuthority(rpc, mint, operator.address);

  const { ata, signature } = await mintTo(rpc, operator, mint, owner, amount);
  console.log(`${cluster}: minted ${formatUsdc(amount)} to ${owner} (${signature})`);
  console.log(`balance of ${ata}: ${formatUsdc(await tokenBalance(rpc, ata))}`);
}

main().catch((error: unknown) => {
  console.error(`fund failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
