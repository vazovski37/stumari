import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { eq } from "drizzle-orm";
import { enforceRateLimits } from "@/lib/api/rate";
import { currentBookingView } from "@/lib/bookings/public";
import { viewOf } from "@/lib/bookings/lifecycle";
import { loadWalletBookings } from "@/lib/bookings/store";
import { getDb } from "@/lib/db";
import { quotes } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { createConciergeServer } from "@/lib/mcp/server";
import { readConnectorToken } from "@/lib/mcp/token";
import type { ConciergeDeps } from "@/lib/mcp/tools";
import { createQuote, effectiveStatus, envelopeOf } from "@/lib/quotes/create";
import { QUOTE_LIMIT } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";
import { chainNow } from "@/lib/solana/clock";
import { chain, serverKeyAddresses } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

const unauthorized = () =>
  Response.json(
    { error: { code: "INVALID_CONNECTOR", message: "This connector link is invalid or expired. Create a new one at /connect-ai." } },
    { status: 401, headers: { "cache-control": "no-store" } },
  );

/**
 * Remote MCP endpoint for the guest's own AI app (ADR-0020). The path token (minted at /connect-ai
 * for a signed-in wallet) names the wallet the assistant shops for. Stateless Streamable HTTP:
 * one server per request. The assistant can search, quote and prepare; it can never pay.
 */
async function handle(request: Request, ctx: RouteContext<"/api/mcp/[token]">): Promise<Response> {
  const env = serverEnv();
  const now = Math.floor(Date.now() / 1000);
  const wallet = readConnectorToken((await ctx.params).token, env.authSecret, now);
  if (!wallet) return unauthorized();

  const db = getDb();
  // Rate limits and holds are keyed by the linked wallet, not by IP: every user of Claude or ChatGPT
  // arrives from the vendor's own servers.
  const key = ipHash(`mcp-wallet:${wallet}`, env.authSecret);
  const clientId = `mcp:${key}:${wallet}`;

  const deps: ConciergeDeps = {
    db,
    siteUrl: env.siteUrl,
    wallet,
    clientId,
    now,
    createQuote: async (input) => {
      const c = await chain();
      await enforceRateLimits(db, [[QUOTE_LIMIT, key]], "price requests");
      return createQuote(
        {
          db,
          cluster: c.env.cluster,
          programId: c.env.programId,
          mint: c.mint,
          signerSecret: c.operatorSecret,
          serverKeys: serverKeyAddresses(c),
          clientId,
          ipHash: key,
          now,
          amountCapMinor: c.env.amountCapMinor,
        },
        input,
      );
    },
    loadQuote: async (id) => {
      const signer = env.operator?.publicKey;
      const row = signer && /^[0-9a-f-]{36}$/.test(id) ? await db.query.quotes.findFirst({ where: eq(quotes.id, id) }) : undefined;
      return row && signer ? { envelope: envelopeOf(row, signer), status: effectiveStatus(row, now) } : null;
    },
    bookingView: (id) => currentBookingView(id, { force: false }),
    walletBookings: async () => {
      const c = await chain();
      const chainTime = await chainNow(c.rpc);
      return (await loadWalletBookings(db, wallet)).map((r) => viewOf(c, r, chainTime));
    },
  };

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await createConciergeServer(deps).connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
