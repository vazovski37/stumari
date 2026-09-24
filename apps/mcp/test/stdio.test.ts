import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getBase58Decoder } from "@solana/kit";
import { afterAll, describe, expect, it } from "vitest";
import { AGENT, AGENT_SEED, secretKey64 } from "./fake-api";

const appDir = fileURLToPath(new URL("..", import.meta.url));

describe("stdio smoke test", () => {
  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: appDir,
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      // Nothing listens on port 9: tool calls fail fast with API_UNREACHABLE.
      STUMARI_API_URL: "http://127.0.0.1:9",
      AGENT_SECRET_KEY: getBase58Decoder().decode(secretKey64(AGENT_SEED)),
    },
  });
  transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  const client = new Client({ name: "stdio-smoke", version: "0.0.0" });

  afterAll(async () => {
    await client.close();
  });

  it("initializes, lists the five tools and answers a call over stdio", async () => {
    await client.connect(transport);
    expect(client.getServerVersion()).toMatchObject({ name: "stumari" });

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["book", "booking_status", "cancel", "get_quote", "search_availability"]);
    const book = tools.find((t) => t.name === "book")!;
    expect(book.description).toContain(AGENT);
    expect(book.inputSchema.required).toEqual(["quote_id", "option_index"]);

    const r = await client.callTool({ name: "booking_status", arguments: { booking_id: "a".repeat(32) } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ error: { code: "API_UNREACHABLE" } });

    const logs = stderr.join("");
    expect(logs).toContain("[stumari-mcp] ready");
    expect(logs).not.toContain(getBase58Decoder().decode(secretKey64(AGENT_SEED)));
  }, 30_000);
});
