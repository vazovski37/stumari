import { sessionCookie } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/** Clears the session cookie (sessions are stateless, so there is nothing else to revoke). */
export function POST() {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": sessionCookie(null, serverEnv().nodeEnv === "production") },
  });
}
