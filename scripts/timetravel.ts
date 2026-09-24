/**
 * Moves the localnet clock forward (surfnet_timeTravel), e.g. to show a tier change or a release:
 *   pnpm --filter @stumari/scripts timetravel --to +2h | +3d | +90m | 2026-10-20T10:00:00Z
 * Relative targets count from the chain clock, not the wall clock. Localnet only.
 */
import { parseArgs } from "node:util";
import { configuredCluster } from "./lib/cluster";
import { loadEnv } from "./lib/env";
import { chainNow, connect } from "./lib/rpc";
import { Surfnet } from "./lib/surfnet";

const UNIT_SECS = { s: 1n, m: 60n, h: 3_600n, d: 86_400n } as const;

function targetTime(spec: string, now: bigint): bigint {
  const relative = /^\+(\d+)([smhd])$/.exec(spec);
  if (relative) return now + BigInt(relative[1]!) * UNIT_SECS[relative[2] as keyof typeof UNIT_SECS];
  const ms = Date.parse(spec);
  if (Number.isNaN(ms)) throw new Error(`--to must be +<n>s|m|h|d or an ISO date-time, got ${JSON.stringify(spec)}`);
  return BigInt(Math.floor(ms / 1000));
}

const iso = (secs: bigint) => new Date(Number(secs) * 1000).toISOString();

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2).filter((a) => a !== "--"), options: { to: { type: "string" } } });
  if (!values.to) throw new Error("usage: timetravel --to <+2h|+3d|ISO date-time>");
  const { cluster, rpcUrl } = configuredCluster(loadEnv());
  if (cluster !== "localnet" || !(await Surfnet.detect(rpcUrl))) {
    throw new Error(`time travel needs the localnet surfnet (STUMARI_CLUSTER=${cluster}, ${rpcUrl})`);
  }
  const rpc = connect(rpcUrl);
  const before = await chainNow(rpc);
  const target = targetTime(values.to, before);
  if (target <= before) throw new Error(`target ${iso(target)} is not after the chain clock ${iso(before)}; the clock only moves forward`);

  await new Surfnet(rpcUrl).timeTravel(target);
  console.log(`chain clock: ${iso(before)} -> ${iso(await chainNow(rpc))}`);
  console.log(
    "note: the chain now runs ahead of wall-clock time, so quotes stamped with wall-clock time fail create_booking\n" +
      "(QuoteExpired). Realign with `pnpm --filter @stumari/scripts bootstrap --cluster localnet --reset`.",
  );
}

main().catch((error: unknown) => {
  console.error(`timetravel failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
