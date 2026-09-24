import type { Metadata } from "next";
import { localePath, locales, ogLocales, type Locale, type LocalizedPath } from "./locales";

/** Title, description, canonical + hreflang alternates and Open Graph tags for a localized page. */
export function localizedMetadata(
  locale: Locale,
  path: LocalizedPath,
  { title, description }: { title: string; description: string },
): Metadata {
  const languages = Object.fromEntries(locales.map((l) => [l, localePath(l, path)]));
  return {
    title,
    description,
    alternates: { canonical: localePath(locale, path), languages: { ...languages, "x-default": localePath("en", path) } },
    openGraph: {
      title,
      description,
      url: localePath(locale, path),
      siteName: "Stumari",
      locale: ogLocales[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
