import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { serverEnv } from "@/lib/env";
import { CONNECTOR_TTL_SECS, mintConnectorToken } from "@/lib/mcp/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints the personal connector link of the signed-in wallet (ADR-0020): the URL the guest pastes
 * into their own AI app. POST, because it mints a credential and must not be cached or prefetched.
 */
export const POST = handler(async (request: Request) => {
  const session = await requireSession(request, "user");
  const env = serverEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = mintConnectorToken(session.wallet, env.authSecret, now);
  return Response.json(
    { wallet: session.wallet, url: `${env.siteUrl}/api/mcp/${token}`, expires_at: now + CONNECTOR_TTL_SECS },
    { headers: { "cache-control": "no-store" } },
  );
});
