import "server-only";
import { serverEnv } from "../env";
import { createDb, type Db } from "./client";

const globalForDb = globalThis as typeof globalThis & { stumariDb?: Db };

/** Process-wide database handle (survives dev hot reloads). */
export function getDb(): Db {
  if (!globalForDb.stumariDb) {
    const env = serverEnv();
    globalForDb.stumariDb = createDb(env.libsqlUrl, env.libsqlAuthToken);
  }
  return globalForDb.stumariDb;
}

export type { Db } from "./client";
