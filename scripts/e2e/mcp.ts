/**
 * Drives apps/mcp over stdio with the MCP SDK client, the way Claude Desktop does. The SDK is a
 * dependency of apps/mcp, not of the scripts package, so it is imported from there by path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "../../apps/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../apps/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { keyPath, REPO } from "../lib/paths";

const MCP_DIR = resolve(REPO, "apps/mcp");

export interface McpSession {
  /** Calls a tool and returns its `structuredContent`; a tool error fails the assertion with its code. */
  tool<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<{ data: T; summary: string }>;
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
}

/** Spawns the MCP server with the devnet agent key (onchain/keys/agent-devnet.json) against `apiUrl`. */
export async function startMcp(apiUrl: string): Promise<McpSession> {
  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: MCP_DIR,
    stderr: "pipe",
    env: {
      PATH: process.env["PATH"] ?? "",
      SYSTEMROOT: process.env["SYSTEMROOT"] ?? "",
      STUMARI_API_URL: apiUrl,
      // The key file's JSON byte array is passed as-is; it is never logged.
      AGENT_SECRET_KEY: readFileSync(keyPath("agent-devnet"), "utf8").trim(),
    },
  });
  transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  const client = new Client({ name: "stumari-e2e", version: "0.0.0" });
  await client.connect(transport);

  return {
    async tool<T>(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { type: string; text?: string }[];
      const summary = content.find((c) => c.type === "text")?.text ?? "";
      assert.ok(!result.isError, `MCP ${name} failed: ${summary}\n${stderr.join("").slice(-2_000)}`);
      return { data: result.structuredContent as T, summary };
    },
    async toolNames() {
      return (await client.listTools()).tools.map((t) => t.name).sort();
    },
    close: () => client.close(),
  };
}
