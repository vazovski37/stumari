import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentWallet } from "../src/agent";
import { StumariApi } from "../src/api";
import { createServer } from "../src/server";
import { AGENT_SEED, API_URL, type FakeStumari, secretKey64 } from "./fake-api";

export interface ToolCall {
  isError: boolean;
  // Structured content is untyped JSON on the wire; tests index into it freely.
  data: any;
  text: string;
}

export const agentWallet = (maxAmountMinor = 500_000_000n) => AgentWallet.fromSecretKey(secretKey64(AGENT_SEED), maxAmountMinor);

/** An MCP client wired to a server over the fake API through an in-memory transport. */
export async function connect(fake: FakeStumari, opts: { agent?: boolean; maxAmountMinor?: bigint } = {}) {
  const agent = opts.agent ? await agentWallet(opts.maxAmountMinor) : null;
  const server = createServer({ api: new StumariApi(API_URL, fake.fetch), agent });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "stumari-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown>): Promise<ToolCall> => {
    const r = await client.callTool({ name, arguments: args });
    const content = r.content as { type: string; text: string }[];
    return { isError: r.isError === true, data: r.structuredContent, text: content[0]?.text ?? "" };
  };
  return { client, call, agent, close: () => client.close() };
}
