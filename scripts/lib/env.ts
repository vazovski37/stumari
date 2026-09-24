/**
 * Script environment: process env > scripts/.env > apps/web/.env.local (configuration.md "Scripts"),
 * plus a merge-writer for apps/web/.env.local that keeps comments, order and unknown keys.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { SCRIPTS_ENV, WEB_ENV, WEB_ENV_EXAMPLE } from "./paths";

export type Env = Readonly<Record<string, string | undefined>>;

export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

export function loadEnv(): Env {
  const nonEmpty = (record: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v.trim() !== ""));
  return { ...nonEmpty(readEnvFile(WEB_ENV)), ...nonEmpty(readEnvFile(SCRIPTS_ENV)), ...nonEmpty(process.env) };
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * Sets `updates` in apps/web/.env.local (created from .env.example on first run): an existing
 * `KEY=` line is replaced in place, a missing key is appended. Values must not need quoting.
 * Returns the keys whose value changed; the file is only rewritten when something changed.
 */
export function mergeWebEnv(updates: Record<string, string>): string[] {
  const exists = existsSync(WEB_ENV);
  const current = exists ? readEnvFile(WEB_ENV) : {};
  const changed = Object.keys(updates).filter((k) => current[k] !== updates[k]);
  if (exists && changed.length === 0) return [];

  const lines = readFileSync(exists ? WEB_ENV : WEB_ENV_EXAMPLE, "utf8").split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  const out = lines.map((line) => {
    const key = LINE.exec(line)?.[1];
    if (key === undefined || !pending.has(key)) return line;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  writeFileSync(WEB_ENV, `${out.join("\n")}\n`, { mode: 0o600 });
  return exists ? changed : Object.keys(updates);
}
