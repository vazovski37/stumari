#!/usr/bin/env -S node --import tsx
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentWallet } from "./agent";
import { StumariApi } from "./api";
import { loadEnv } from "./env";
import { createServer, log } from "./server";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const agent = env.agentSecretKey ? await AgentWallet.fromSecretKey(env.agentSecretKey, env.maxAmountMinor) : null;
  env.agentSecretKey?.fill(0);
  const server = createServer({ api: new StumariApi(env.apiUrl), agent });
  await server.connect(new StdioServerTransport());
  log(`ready — API ${env.apiUrl}; ${agent ? `agent wallet ${agent.address}` : "no agent wallet (returns transactions to sign)"}`);
}

main().catch((e: unknown) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
