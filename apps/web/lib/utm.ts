/**
 * Source attribution (utm_* and ref) for the landing and apply pages. Pure helpers, safe on the server
 * and in tests: storage is passed in, and every storage access is wrapped because it can throw (private
 * windows, blocked site data). Nothing here ever throws.
 *
 * Flow: the [lang] layout remembers the tags of the first page load that carried any (sessionStorage,
 * this tab only); the apply form sends the apply URL's own tags, or the remembered ones when it has none;
 * the language switcher on the apply page carries the current tags to the other languages.
 */
import { utmKeys } from "./application-fields";

export type UtmKey = (typeof utmKeys)[number];
export type Utm = Partial<Record<UtmKey, string>>;

export const UTM_STORAGE_KEY = "stumari.utm";
/** Longest value kept per tag (the API accepts no more). */
export const UTM_MAX_LENGTH = 200;

export type UtmStorage = Pick<Storage, "getItem" | "setItem">;

type SearchInput = string | URLSearchParams | Record<string, string | string[] | undefined>;

function valueOf(input: SearchInput, key: UtmKey): string | undefined {
  if (typeof input === "string") return new URLSearchParams(input).get(key) ?? undefined;
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

/** The attribution tags in a query string (`?a=b`), URLSearchParams or Next.js `searchParams` object. */
export function pickUtm(input: SearchInput): Utm {
  const utm: Utm = {};
  for (const key of utmKeys) {
    const value = valueOf(input, key)?.trim();
    if (value) utm[key] = value.slice(0, UTM_MAX_LENGTH);
  }
  return utm;
}

export function hasUtm(utm: Utm): boolean {
  return Object.keys(utm).length > 0;
}

/** Reads the remembered tags; anything malformed counts as none. */
export function recallUtm(storage: UtmStorage | null): Utm {
  if (!storage) return {};
  let value: unknown;
  try {
    value = JSON.parse(storage.getItem(UTM_STORAGE_KEY) ?? "null");
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const utm: Utm = {};
  for (const key of utmKeys) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim() !== "") utm[key] = v.trim().slice(0, UTM_MAX_LENGTH);
  }
  return utm;
}

/**
 * Remembers the tags in `search` unless tags are already remembered (first touch wins for the session).
 * Returns what is remembered afterwards.
 */
export function rememberUtm(storage: UtmStorage | null, search: SearchInput): Utm {
  const stored = recallUtm(storage);
  if (hasUtm(stored)) return stored;
  const current = pickUtm(search);
  if (!storage || !hasUtm(current)) return current;
  try {
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Blocked or full storage: attribution then comes from the apply URL alone.
  }
  return current;
}

/** What the apply form sends: the apply URL's own tags, else the remembered ones. */
export function utmForSubmission(search: SearchInput, storage: UtmStorage | null): Utm {
  const current = pickUtm(search);
  return hasUtm(current) ? current : recallUtm(storage);
}

/** Appends the tags to a path that may already carry a query (`/apply?type=demo`). */
export function withUtm(path: string, utm: Utm): string {
  const query = new URLSearchParams();
  for (const key of utmKeys) {
    const value = utm[key];
    if (value) query.set(key, value);
  }
  const extra = query.toString();
  if (extra === "") return path;
  return `${path}${path.includes("?") ? "&" : "?"}${extra}`;
}

/** The browser's sessionStorage, or null when it is missing or access throws. */
export function browserSessionStorage(): UtmStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
