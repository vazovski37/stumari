/**
 * Applies SQL migrations from apps/web/drizzle. Run from apps/web:
 *   pnpm --filter web db:migrate
 * Reads LIBSQL_URL / LIBSQL_AUTH_TOKEN from the environment or .env.local.
 */
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { DEFAULT_LIBSQL_URL } from "../env-schema";
import { createDb } from "./client";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const url = process.env.LIBSQL_URL || DEFAULT_LIBSQL_URL;
  const db = createDb(url, process.env.LIBSQL_AUTH_TOKEN);
  await migrate(db, { migrationsFolder: "drizzle" });
  db.$client.close();
  // The URL never carries the token (LIBSQL_AUTH_TOKEN is separate); drop any query string anyway.
  console.log(`migrations applied to ${url.split("?")[0]}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
