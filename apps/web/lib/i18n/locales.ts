export const locales = ["en", "ka", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Paths that exist in every locale (relative to the locale root). */
export type LocalizedPath = "" | "/apply";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ka: "ქართული",
  ru: "Русский",
};

/** Open Graph locale tags. */
export const ogLocales: Record<Locale, string> = {
  en: "en_US",
  ka: "ka_GE",
  ru: "ru_RU",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Maps a route param to a supported locale, or null when unsupported. */
export function resolveLocale(param: string | undefined): Locale | null {
  return isLocale(param) ? param : null;
}

/**
 * Public URL of a localized page. English is served without a prefix
 * ('/', '/apply'); other locales are prefixed ('/ka', '/ru/apply').
 */
export function localePath(locale: Locale, path: LocalizedPath = ""): string {
  if (locale === defaultLocale) return path === "" ? "/" : path;
  return `/${locale}${path}`;
}

