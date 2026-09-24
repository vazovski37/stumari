import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isAddress } from "@solana/kit";
import { z } from "zod";
import { PolicyError } from "./agent";
import { ApiError } from "./api";
import { bookingId, date, slug, uuid } from "./schemas";
import { ToolError, type ToolDeps, type ToolOutput, book, bookingStatus, cancel, getQuote, searchAvailability } from "./tools";
import { GuardError } from "./tx-guard";

export const SERVER_NAME = "stumari";
export const SERVER_VERSION = "0.1.0";

const wallet = z.string().refine((s) => isAddress(s), "a base58 Solana address").describe("Solana wallet address (base58)");
const guests = {
  adults: z.number().int().min(1).max(10).describe("Number of adults"),
  children: z.number().int().min(0).max(10).optional().describe("Number of children (default 0)"),
};
const stay = {
  checkin: date.describe("Check-in date, YYYY-MM-DD (hotel local time)"),
  checkout: date.describe("Check-out date, YYYY-MM-DD, after check-in"),
};

/** Logs go to stderr only: stdout carries the MCP protocol. */
export function log(message: string): void {
  process.stderr.write(`[stumari-mcp] ${message}\n`);
}

function ok(out: ToolOutput): CallToolResult {
  return {
    content: [
      { type: "text", text: out.summary },
      { type: "text", text: JSON.stringify(out.data) },
    ],
    structuredContent: out.data,
  };
}

function failure(e: unknown): CallToolResult {
  let error: { code: string; message: string; http_status?: number | null };
  if (e instanceof ApiError) error = { code: e.code, message: e.message, http_status: e.httpStatus };
  else if (e instanceof ToolError || e instanceof GuardError || e instanceof PolicyError) {
    error = { code: e.code, message: e.message };
  } else {
    log(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    error = { code: "INTERNAL_ERROR", message: "Unexpected error in the Stumari MCP server." };
  }
  const refusal = e instanceof GuardError || e instanceof PolicyError ? "Refused to sign: " : "";
  return {
    isError: true,
    content: [{ type: "text", text: `${refusal}${error.message} (${error.code})` }],
    structuredContent: { error },
  };
}

function run<A>(fn: (deps: ToolDeps, args: A) => Promise<ToolOutput>, deps: ToolDeps) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return ok(await fn(deps, args));
    } catch (e) {
      return failure(e);
    }
  };
}

/**
 * The five tools of api.md ("MCP server") over the public REST API. With an agent key the
 * server signs `book`/`cancel` itself (devnet only, capped, guarded); otherwise it returns the
 * server-built transaction for the caller's wallet to sign.
 */
export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const agentNote = deps.agent
    ? ` An agent wallet (${deps.agent.address}) is configured: it signs and submits automatically on devnet/localnet, up to its amount cap.`
    : " No agent wallet is configured: the result is a transaction the paying wallet must sign.";

  server.registerTool(
    "search_availability",
    {
      title: "Search availability",
      description:
        "Find hotel room types on Stumari (stablecoin checkout for hotels, USDC on Solana) that are free for the given dates. Returns base prices in USDC; does not hold a room.",
      inputSchema: {
        city: z.string().min(1).max(60).optional().describe("City, e.g. Tbilisi"),
        hotel_slug: slug.optional().describe("Limit to one hotel"),
        ...stay,
        ...guests,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    run(searchAvailability, deps),
  );

  server.registerTool(
    "get_quote",
    {
      title: "Get a signed quote",
      description:
        "Request a signed quote: a menu of cancellation contracts (price + refund schedule each) for one room type and dates, held for 10 minutes. The Ed25519 signature is verified against Stumari's quote signer." +
        (deps.agent ? " `wallet` defaults to the agent wallet (only that wallet may then pay)." : ""),
      inputSchema: {
        hotel_slug: slug.describe("Hotel slug from search_availability"),
        room_type_id: uuid.describe("Room type id from search_availability"),
        ...stay,
        ...guests,
        wallet: wallet.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    run(getQuote, deps),
  );

  server.registerTool(
    "book",
    {
      title: "Book (pay into escrow)",
      description:
        "Pay for one option of a verified quote: the USDC price goes into a per-booking Solana escrow that enforces the option's refund schedule." +
        agentNote,
      inputSchema: {
        quote_id: uuid.describe("quote_id from get_quote"),
        option_index: z.number().int().min(0).max(7).describe("Index of the chosen option"),
        wallet: wallet.optional().describe("Paying wallet; defaults to the quote's wallet or the agent wallet"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    run(book, deps),
  );

  server.registerTool(
    "cancel",
    {
      title: "Cancel a booking",
      description:
        "Cancel a booking before check-in; the refund follows the booking's schedule and is paid on-chain to the guest wallet." +
        agentNote,
      inputSchema: {
        booking_id: bookingId.describe("Booking id (32 hex chars)"),
        wallet: wallet.optional().describe("Guest wallet that paid; defaults to the agent wallet"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    run(cancel, deps),
  );

  server.registerTool(
    "booking_status",
    {
      title: "Booking status",
      description: "Status, refund terms, refund-if-cancelled-now and links for a booking.",
      inputSchema: { booking_id: bookingId.describe("Booking id (32 hex chars)") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    run(bookingStatus, deps),
  );

  return server;
}
