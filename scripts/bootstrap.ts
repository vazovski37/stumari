/**
 * Brings a cluster to the demo-ready state (configuration.md, ADR-0015):
 *   pnpm --filter @stumari/scripts bootstrap --cluster localnet|devnet [--reset]
 * Every step checks before it acts, so a second run changes nothing.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { address, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from "@solana/kit";
import { formatUsdc, toMinor, uuidToBytes } from "@stumari/core";
import {
  buildInitializeConfigTx,
  buildRegisterHotelTx,
  buildUpdateConfigTx,
  buildUpdateHotelTx,
  fetchMaybeConfig,
  fetchMaybeHotel,
  findAta,
  findConfigPda,
  findHotelPda,
  sendBuiltTx,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  type ConfigChanges,
} from "@stumari/escrow-client";
import { assertDevnetGenesis, parseCluster, rpcUrlFor, type Cluster } from "./lib/cluster";
import { configuredDbUrl, migrateWebDb, openWebDb } from "./lib/db";
import { DEMO_SLUG, recordRegistration, seedDemoHotel } from "./lib/demo";
import { loadEnv, mergeWebEnv, readEnvFile, type Env } from "./lib/env";
import { loadKeyFile, loadOperator, loadOrCreateKey, parseSecretKey, secretKeyBase58, type LoadedKey } from "./lib/keys";
import { localnet } from "./lib/localnet";
import { assertMintAuthority, ensureAta, ensureMockMint, mintTo } from "./lib/mint";
import { keyPath, PROGRAM_ID_FILE, PROGRAM_SO, WEB_ENV } from "./lib/paths";
import { forceUpgradeAuthority, readProgramState, type ProgramState } from "./lib/program";
import { connect, formatSol, LAMPORTS_PER_SOL, lamports, tokenBalance, type SolanaRpc } from "./lib/rpc";
import { Surfnet } from "./lib/surfnet";

/** configuration.md "On-chain config", devnet demo column. */
const CONFIG = { feeBps: 0, confirmWindowSecs: 7_200, releaseDelaySecs: 120 } as const;
const DEVNET_MIN_OPERATOR_SOL = LAMPORTS_PER_SOL / 20n;
const AGENT_USDC_TARGET = toMinor("1000");
const AGENT_USDC_REFILL_BELOW = toMinor("100");
const DEFAULT_SITE_URL = "http://localhost:3000";

const changes: string[] = [];
const log = (step: string, detail: string) => console.log(`${step.padEnd(14)} ${detail}`);
const changed = (step: string, detail: string) => {
  changes.push(`${step}: ${detail}`);
  log(step, detail);
};

function parseCli() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { cluster: { type: "string" }, reset: { type: "boolean", default: false } },
  });
  const cluster = parseCluster(values.cluster);
  if (values.reset && cluster !== "localnet") throw new Error("--reset exists for localnet only: devnet state cannot be reset");
  return { cluster, reset: values.reset };
}

function assertProgramId(env: Env): void {
  const id = (env["STUMARI_PROGRAM_ID"] ?? readFileSync(PROGRAM_ID_FILE, "utf8")).trim();
  if (id !== STUMARI_ESCROW_PROGRAM_ADDRESS) {
    throw new Error(`program id ${id} differs from the escrow client's ${STUMARI_ESCROW_PROGRAM_ADDRESS} (ADR-0008)`);
  }
}

/** DEMO_HOTEL_WALLET, else onchain/keys/demo-hotel.json (generated on first use). */
async function demoHotelWallet(env: Env): Promise<Address> {
  const configured = env["DEMO_HOTEL_WALLET"];
  if (configured) return address(configured.trim());
  const key = await loadOrCreateKey("demo-hotel");
  if (key.created) changed("keys", `generated onchain/keys/demo-hotel.json (${key.signer.address})`);
  return key.signer.address;
}

async function agentWallet(): Promise<Address | null> {
  const path = keyPath("agent-devnet");
  return existsSync(path) ? (await loadKeyFile(path)).signer.address : null;
}

// ------------------------------------------------------------------ chain preparation

async function prepareLocalnet(rpc: SolanaRpc, surfnet: Surfnet, operator: KeyPairSigner, wallets: Address[]) {
  const targets: [Address, bigint][] = [
    [operator.address, 1_000n * LAMPORTS_PER_SOL],
    ...wallets.map((w): [Address, bigint] => [w, 10n * LAMPORTS_PER_SOL]),
  ];
  for (const [account, target] of targets) {
    if ((await lamports(rpc, account)) < target / 2n) {
      await surfnet.setLamports(account, target);
      changed("fund", `${account} = ${formatSol(target)} (surfnet_setAccount)`);
    }
  }

  const so = readFileSync(PROGRAM_SO);
  let state = await readProgramState(rpc, so);
  if (!state.deployed || !state.matches) {
    await surfnet.writeProgram(STUMARI_ESCROW_PROGRAM_ADDRESS, so, operator.address);
    changed("program", `wrote ${so.length} bytes with surfnet_writeProgram, upgrade authority ${operator.address}`);
    state = await readProgramState(rpc, so);
  }
  if (state.deployed && state.upgradeAuthority !== operator.address) {
    await forceUpgradeAuthority(rpc, surfnet, operator.address);
    changed("program", `ProgramData authority rewritten to ${operator.address} (surfnet_setAccount)`);
    state = await readProgramState(rpc, so);
  }
  assertGate(state, operator.address);
  log("program", `${STUMARI_ESCROW_PROGRAM_ADDRESS} deployed, ProgramData ${state.programData}, upgrade authority = operator`);
}

async function checkDevnet(rpc: SolanaRpc, operator: KeyPairSigner, configExists: boolean) {
  const balance = await lamports(rpc, operator.address);
  if (balance < DEVNET_MIN_OPERATOR_SOL) {
    throw new Error(`operator has ${formatSol(balance)}: fund ${operator.address} at faucet.solana.com`);
  }
  log("operator", `${operator.address} has ${formatSol(balance)}`);

  const state = await readProgramState(rpc, readFileSync(PROGRAM_SO));
  if (!state.deployed) {
    throw new Error(
      `${STUMARI_ESCROW_PROGRAM_ADDRESS} is not deployed on devnet. Deploy it from WSL (scripts/README.md, "Devnet"):\n` +
        "  MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh deploy devnet",
    );
  }
  if (!state.matches) log("program", "WARNING: devnet bytes differ from onchain/artifacts/stumari_escrow.so (redeploy?)");
  if (!configExists) assertGate(state, operator.address);
  log("program", `${STUMARI_ESCROW_PROGRAM_ADDRESS} deployed, upgrade authority ${state.upgradeAuthority ?? "none"}`);
}

/** `initialize_config` accepts only the upgrade authority recorded in ProgramData. */
function assertGate(state: ProgramState, operator: Address) {
  if (!state.deployed || state.upgradeAuthority !== operator) {
    throw new Error(
      `initialize_config needs the operator ${operator} as upgrade authority; ProgramData ${state.programData} ` +
        `has ${state.upgradeAuthority ?? "none"}${state.deployed ? "" : " (program not deployed)"}`,
    );
  }
}

// ------------------------------------------------------------------ escrow config

async function ensureConfig(rpc: SolanaRpc, operator: KeyPairSigner): Promise<{ mint: Address; treasury: Address }> {
  const ctx = { rpc, operator };
  const existing = await fetchMaybeConfig(rpc);
  if (!existing) {
    const { mint, created } = await ensureMockMint(rpc, operator);
    if (created) changed("mint", `mock USDC ${mint} (6 decimals, operator = mint authority)`);
    const { ata: treasury } = await ensureAta(rpc, operator, operator.address, mint);
    const built = await buildInitializeConfigTx({ ...ctx, admin: operator, mint, treasury, ...CONFIG });
    const { signature } = await sendBuiltTx(rpc, built);
    changed("config", `initialized ${await findConfigPda()} (${signature})`);
    return { mint, treasury };
  }

  await assertMintAuthority(rpc, existing.mint, operator.address);
  log("mint", `${existing.mint} (from config)`);
  const drift: ConfigChanges = {
    ...(existing.quoteSigner !== operator.address && { quoteSigner: operator.address }),
    ...(existing.feeBps !== CONFIG.feeBps && { feeBps: CONFIG.feeBps }),
    ...(existing.confirmWindowSecs !== CONFIG.confirmWindowSecs && { confirmWindowSecs: CONFIG.confirmWindowSecs }),
    ...(existing.releaseDelaySecs !== CONFIG.releaseDelaySecs && { releaseDelaySecs: CONFIG.releaseDelaySecs }),
  };
  if (Object.keys(drift).length > 0) {
    if (existing.admin !== operator.address) {
      throw new Error(`config differs (${Object.keys(drift).join(", ")}) and its admin ${existing.admin} is not the operator`);
    }
    const { signature } = await sendBuiltTx(rpc, await buildUpdateConfigTx({ ...ctx, admin: operator, changes: drift }));
    changed("config", `updated ${Object.keys(drift).join(", ")} (${signature})`);
  } else {
    log("config", `${existing.address} ok (fee ${existing.feeBps} bps, confirm ${existing.confirmWindowSecs}s, release ${existing.releaseDelaySecs}s)`);
  }
  return { mint: existing.mint, treasury: existing.treasury };
}

// ------------------------------------------------------------------ demo hotel

async function ensureDemoHotel(rpc: SolanaRpc, operator: KeyPairSigner, env: Env, wallet: Address, mint: Address) {
  migrateWebDb(env);
  log("db", `migrations applied (${configuredDbUrl(env).split("?")[0]})`);
  const db = openWebDb(env);
  try {
    const { hotel, changes: seeded } = await seedDemoHotel(db, wallet);
    for (const c of seeded) changed("db", `seeded ${c}`);
    if (seeded.length === 0) log("db", `${DEMO_SLUG} present (${hotel.id})`);

    const ctx = { rpc, operator, admin: operator };
    const hotelId = uuidToBytes(hotel.id);
    const hotelPda = await findHotelPda(hotelId);
    const onchain = await fetchMaybeHotel(rpc, hotelPda);
    let registeredSig: string | null = null;
    if (!onchain) {
      const { signature } = await sendBuiltTx(rpc, await buildRegisterHotelTx({ ...ctx, hotelId, authority: wallet }));
      registeredSig = signature;
      changed("hotel", `registered ${hotelPda} -> payout ${wallet} (${signature})`);
    } else if (onchain.authority !== wallet || !onchain.active) {
      const { signature } = await sendBuiltTx(rpc, await buildUpdateHotelTx({ ...ctx, hotelId, authority: wallet, active: true }));
      changed("hotel", `updated ${hotelPda} -> payout ${wallet}, active (${signature})`);
    } else {
      const { ata, created } = await ensureAta(rpc, operator, wallet, mint);
      if (created) changed("hotel", `created payout ATA ${ata}`);
      log("hotel", `${hotelPda} registered, payout ${wallet}`);
    }
    if (await recordRegistration(db, hotel, hotelPda, registeredSig)) changed("db", `recorded on-chain hotel ${hotelPda}`);
  } finally {
    db.$client.close();
  }
}

async function topUpAgent(rpc: SolanaRpc, operator: KeyPairSigner, agent: Address, mint: Address) {
  const balance = await tokenBalance(rpc, await findAta(agent, mint));
  if (balance >= AGENT_USDC_REFILL_BELOW) {
    log("agent", `${agent} holds ${formatUsdc(balance)}`);
    return;
  }
  await mintTo(rpc, operator, mint, agent, AGENT_USDC_TARGET - balance);
  changed("agent", `${agent} topped up to ${formatUsdc(AGENT_USDC_TARGET)} (mock)`);
}

// ------------------------------------------------------------------ apps/web/.env.local

async function sameKey(raw: string | undefined, operator: LoadedKey): Promise<boolean> {
  if (!raw) return false;
  try {
    return (await createKeyPairSignerFromBytes(parseSecretKey(raw, "existing OPERATOR_SECRET_KEY"))).address === operator.signer.address;
  } catch {
    return false;
  }
}

async function writeWebEnv(cluster: Cluster, rpcUrl: string, env: Env, operator: LoadedKey, mint: Address) {
  const current = readEnvFile(WEB_ENV);
  const keep = (key: string, fallback: () => string) => (current[key]?.trim() ? current[key].trim() : fallback());
  const admins = new Set((current["ADMIN_WALLETS"] ?? "").split(",").map((w) => w.trim()).filter(Boolean));
  admins.add(operator.signer.address);
  const secret = () => randomBytes(32).toString("hex");
  const authSecret = current["AUTH_SECRET"]?.trim() ?? "";

  const updates: Record<string, string> = {
    STUMARI_CLUSTER: cluster,
    SOLANA_RPC_URL: rpcUrl,
    STUMARI_PROGRAM_ID: STUMARI_ESCROW_PROGRAM_ADDRESS,
    STUMARI_MINT: mint,
    OPERATOR_SECRET_KEY: (await sameKey(current["OPERATOR_SECRET_KEY"], operator))
      ? current["OPERATOR_SECRET_KEY"]!.trim()
      : secretKeyBase58(operator.secretKey),
    ADMIN_WALLETS: [...admins].join(","),
    AUTH_SECRET: authSecret.length >= 32 ? authSecret : secret(),
    CRON_SECRET: keep("CRON_SECRET", secret),
    LIBSQL_URL: configuredDbUrl(env),
    STUMARI_DEMO_MODE: "true",
    NEXT_PUBLIC_SITE_URL: keep("NEXT_PUBLIC_SITE_URL", () => DEFAULT_SITE_URL),
    ...(env["LIBSQL_AUTH_TOKEN"] && { LIBSQL_AUTH_TOKEN: env["LIBSQL_AUTH_TOKEN"] }),
  };
  const written = mergeWebEnv(updates);
  // Key names only: several of these values are secrets.
  if (written.length > 0) changed("env", `apps/web/.env.local: ${written.join(", ")}`);
  else log("env", "apps/web/.env.local up to date");
}

// ------------------------------------------------------------------ main

async function main() {
  const { cluster, reset } = parseCli();
  const env = loadEnv();
  const rpcUrl = rpcUrlFor(cluster, env);
  assertProgramId(env);
  log("cluster", `${cluster} ${rpcUrl}`);

  if (cluster === "localnet") localnet(reset ? "reset" : "start");
  const isSurfnet = await Surfnet.detect(rpcUrl);
  if (cluster === "localnet" && !isSurfnet) throw new Error(`${rpcUrl} is not a surfnet; is scripts/localnet.sh running?`);
  if (cluster === "devnet" && isSurfnet) throw new Error(`${rpcUrl} is a surfnet, not devnet`);

  const rpc = connect(rpcUrl);
  await assertDevnetGenesis(cluster, rpc);
  const operator = await loadOperator(env);
  const op = operator.signer;
  log("operator", op.address);
  const hotelWallet = await demoHotelWallet(env);
  const agent = await agentWallet();

  if (cluster === "localnet") {
    await prepareLocalnet(rpc, new Surfnet(rpcUrl), op, [hotelWallet, ...(agent ? [agent] : [])]);
  } else {
    await checkDevnet(rpc, op, (await fetchMaybeConfig(rpc)) !== null);
  }

  const { mint, treasury } = await ensureConfig(rpc, op);
  log("treasury", treasury);
  await ensureDemoHotel(rpc, op, env, hotelWallet, mint);
  if (agent) await topUpAgent(rpc, op, agent, mint);
  await writeWebEnv(cluster, rpcUrl, env, operator, mint);

  console.log(
    changes.length === 0
      ? "\nbootstrap: already up to date (0 changes)"
      : `\nbootstrap: ${changes.length} change(s)\n${changes.map((c) => `  - ${c}`).join("\n")}`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nbootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
