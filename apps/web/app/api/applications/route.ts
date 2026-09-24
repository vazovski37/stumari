import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { applicationInput, describeIssues, isHoneypotFilled } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { APPLY_LIMIT, consumeRateLimit } from "@/lib/rate-limit";
import { apiError, clientIp, ipHash } from "@/lib/request";
import { applicationMessage, notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: NextRequest) {
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return apiError(413, "BODY_TOO_LARGE", "Request body is too large");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "INVALID_JSON", "Request body must be JSON");
  }

  // Bots get the same success response as people, and nothing is stored.
  if (isHoneypotFilled(body)) return Response.json({ id: randomUUID() }, { status: 201 });

  const parsed = applicationInput.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_FAILED", "Some fields are missing or invalid", {
      issues: describeIssues(parsed.error),
    });
  }

  const env = serverEnv();
  const db = getDb();
  const hashedIp = ipHash(clientIp(request.headers, env.onVercel), env.authSecret);

  const limit = await consumeRateLimit(db, APPLY_LIMIT, hashedIp);
  if (!limit.ok) {
    return apiError(429, "RATE_LIMITED", "Too many applications from this connection; try again later", {
      headers: { "retry-after": String(limit.retryAfterSecs) },
    });
  }

  const id = randomUUID();
  const application = parsed.data;
  await db.insert(applications).values({
    ...application,
    id,
    created_at: Math.floor(Date.now() / 1000),
    ip_hash: hashedIp,
    status: "new",
  });

  const telegram = env.telegram;
  if (telegram) after(() => notifyTelegram(telegram, applicationMessage(id, application)));

  return Response.json({ id }, { status: 201 });
}
