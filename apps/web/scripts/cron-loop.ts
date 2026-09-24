/**
 * Local stand-in for the production scheduler (api.md "Cron"): calls both cron endpoints of the
 * running web app every 60 s with the CRON_SECRET bearer token.
 *   pnpm --filter web cron
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const base = (process.env.CRON_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
const INTERVAL_MS = 60_000;

async function call(job: "sync" | "release"): Promise<void> {
  try {
    const res = await fetch(`${base}/api/cron/${job}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(65_000),
    });
    console.log(`${new Date().toISOString()} ${job}: HTTP ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${job}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main(): Promise<void> {
  if (!secret) throw new Error("CRON_SECRET is not set (apps/web/.env.local)");
  console.log(`cron loop: ${base} every ${INTERVAL_MS / 1000} s (Ctrl+C to stop)`);
  for (;;) {
    await call("sync");
    await call("release");
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
