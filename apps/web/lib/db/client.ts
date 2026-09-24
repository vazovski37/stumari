import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Opens a libsql database: a local file in development (`file:./.data/stumari.db`,
 * relative to the working directory, created on demand) or Turso (`libsql://…`).
 * Free of `server-only` so scripts (migrate) and tests can use it.
 */
export function createDb(url: string, authToken?: string | null) {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  return drizzle(client, { schema });
}
