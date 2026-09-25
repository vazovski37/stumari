import { ApiError, handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { runReleaseJob, runSyncJob } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs a cron job now (`sync` or `release`), with the admin's session instead of CRON_SECRET. */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/cron/[job]">) => {
  await requireSession(request, "admin");
  const { job } = await ctx.params;
  if (job !== "sync" && job !== "release") throw new ApiError(404, "NOT_FOUND", "Unknown job");
  const c = await chain();
  return Response.json(job === "sync" ? await runSyncJob(c, getDb()) : await runReleaseJob(c, getDb()));
});
