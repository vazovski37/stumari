import { handler } from "@/lib/api/errors";
import { authorizeCron, runSyncJob } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron sends GET; external schedulers may POST. Both need the CRON_SECRET bearer token. */
const run = handler(async (request: Request) => {
  authorizeCron(request, serverEnv().cronSecret);
  return Response.json(await runSyncJob(await chain(), getDb()));
});

export const GET = run;
export const POST = run;
