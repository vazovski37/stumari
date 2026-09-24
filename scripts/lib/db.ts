/**
 * The web app's database, opened with the web app's own client and schema (apps/web/lib/db) so the
 * seed can never drift from the tables. Their imports (drizzle-orm, @libsql/client) resolve from
 * apps/web/node_modules. Migrations run through the web package's `db:migrate` script.
 */
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { createDb, type Db } from "../../apps/web/lib/db/client";
import { DEFAULT_LIBSQL_URL } from "../../apps/web/lib/env-schema";
import type { Env } from "./env";
import { REPO, WEB_DIR } from "./paths";

export * as schema from "../../apps/web/lib/db/schema";
export type { Db };

/** LIBSQL_URL as configured (relative `file:` paths are relative to apps/web, where Next runs). */
export const configuredDbUrl = (env: Env) => env["LIBSQL_URL"] ?? DEFAULT_LIBSQL_URL;

/** Same database from any working directory: relative `file:` paths resolved against apps/web. */
function absoluteDbUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const path = url.slice("file:".length);
  return isAbsolute(path) ? url : `file:${resolve(WEB_DIR, path).replaceAll("\\", "/")}`;
}

export function openWebDb(env: Env): Db {
  return createDb(absoluteDbUrl(configuredDbUrl(env)), env["LIBSQL_AUTH_TOKEN"]);
}

/** Applies apps/web/drizzle migrations (idempotent: drizzle records what it applied). */
export function migrateWebDb(env: Env): void {
  // One command string: pnpm is a .cmd shim on Windows and needs a shell.
  const result = spawnSync("pnpm --filter web db:migrate", {
    cwd: REPO,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LIBSQL_URL: absoluteDbUrl(configuredDbUrl(env)), LIBSQL_AUTH_TOKEN: env["LIBSQL_AUTH_TOKEN"] ?? "" },
  });
  if (result.status !== 0) {
    throw new Error(`web db:migrate failed (exit ${result.status}):\n${result.stderr.toString()}${result.stdout.toString()}`);
  }
}
