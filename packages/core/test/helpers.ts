import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const repoPath = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));

export function readJson<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(repoPath(rel), "utf8")) as T;
}

export const repoFileExists = (rel: string): boolean => existsSync(repoPath(rel));
