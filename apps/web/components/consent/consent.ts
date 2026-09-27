/**
 * Ad-measurement consent (Meta Pixel). Pure helpers, safe on the server and in tests: storage is passed
 * in, and every storage access is wrapped because it can throw (private windows, blocked site data).
 */

export const CONSENT_STORAGE_KEY = "stumari.ad-consent";
/** Fired on `window` whenever this tab changes the stored choice (the `storage` event covers other tabs). */
export const CONSENT_CHANGE_EVENT = "stumari:ad-consent";
/** A stored choice older than this is asked again (about six months). */
export const CONSENT_MAX_AGE_SECS = 182 * 24 * 60 * 60;

export type ConsentChoice = "accepted" | "declined";
/** `pending` is the server render and the first client render, before storage has been read. */
export type ConsentSnapshot = ConsentChoice | "unset" | "pending";

export type ConsentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredConsent = { choice: ConsentChoice; at: number };

const nowSecs = () => Math.floor(Date.now() / 1000);

/** Parses the stored value; anything malformed, from the future or expired counts as no choice. */
export function parseConsent(raw: string | null | undefined, now: number = nowSecs()): ConsentChoice | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { choice, at } = value as Partial<StoredConsent>;
  if (choice !== "accepted" && choice !== "declined") return null;
  if (typeof at !== "number" || !Number.isInteger(at) || at > now + 60 || now - at > CONSENT_MAX_AGE_SECS) return null;
  return choice;
}

export function serializeConsent(choice: ConsentChoice, now: number = nowSecs()): string {
  return JSON.stringify({ choice, at: now } satisfies StoredConsent);
}

export function readConsent(storage: ConsentStorage | null, now?: number): ConsentChoice | null {
  if (!storage) return null;
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY), now);
  } catch {
    return null;
  }
}

/** Stores the choice; returns false when storage is unavailable (the choice then lasts for this page only). */
export function writeConsent(storage: ConsentStorage | null, choice: ConsentChoice, now?: number): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONSENT_STORAGE_KEY, serializeConsent(choice, now));
    return true;
  } catch {
    return false;
  }
}

/**
 * The visitor's current choice: the stored one, else the one made on this page when storage could not
 * keep it (blocked or full), else "unset". The banner, the pixel loader and the Lead event all use this.
 */
export function resolveConsent(
  storage: ConsentStorage | null,
  pageChoice: ConsentChoice | null,
  now?: number,
): ConsentChoice | "unset" {
  return readConsent(storage, now) ?? pageChoice ?? "unset";
}

/** The browser's localStorage, or null when it is missing or access throws. */
export function browserStorage(): ConsentStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** What the page does for a given configuration and stored choice. */
export function consentPlan(pixelId: string | null, snapshot: ConsentSnapshot): { showBanner: boolean; loadPixel: boolean } {
  if (pixelId === null) return { showBanner: false, loadPixel: false };
  return { showBanner: snapshot === "unset", loadPixel: snapshot === "accepted" };
}
