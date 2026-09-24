/**
 * Starts a fresh Surfpool chain for the test run (ADR-0015: the npm `litesvm` package ships no
 * Windows binary, so the TS tests run against Surfpool in Docker). A dedicated container on
 * port 18899 keeps `scripts/localnet.sh` (8899) untouched and gives every run an empty chain.
 * Set ESCROW_TEST_RPC_URL to use an already running, freshly started surfnet instead.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    rpcUrl: string;
  }
}

const CONTAINER = "stumari-escrow-client-test";
const PORT = 18899;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const binDir = resolve(repo, ".localnet/bin");

const docker = (...args: string[]) => execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

async function rpcUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getVersion" }),
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function setup(project: TestProject): Promise<(() => void) | void> {
  const external = process.env["ESCROW_TEST_RPC_URL"];
  if (external) {
    project.provide("rpcUrl", external);
    return;
  }
  if (!existsSync(resolve(binDir, "surfpool"))) {
    throw new Error(`${binDir}/surfpool missing: run \`bash scripts/localnet.sh start\` once to copy it from WSL`);
  }
  const stop = () => {
    try {
      docker("rm", "-f", CONTAINER);
    } catch {
      // not running
    }
  };
  stop();
  docker(
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `127.0.0.1:${PORT}:8899`,
    "-v",
    `${binDir.replaceAll("\\", "/")}:/opt/sp:ro`,
    "ubuntu:24.04",
    "/opt/sp/surfpool",
    "start",
    "--offline",
    "--host",
    "0.0.0.0",
    "--port",
    "8899",
    "--ws-port",
    "8900",
    "--no-deploy",
    "--no-tui",
  );
  const url = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 60 && !(await rpcUp(url)); i++) await new Promise((r) => setTimeout(r, 1_000));
  if (!(await rpcUp(url))) {
    const logs = docker("logs", "--tail", "50", CONTAINER);
    stop();
    throw new Error(`surfpool did not start:\n${logs}`);
  }
  project.provide("rpcUrl", url);
  return stop;
}
