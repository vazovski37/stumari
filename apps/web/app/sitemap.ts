import type { MetadataRoute } from "next";
import { localePath, locales, type LocalizedPath } from "@/lib/i18n/locales";
import { siteUrl } from "@/lib/site";

const localizedPaths: LocalizedPath[] = ["", "/apply"];

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, siteUrl).toString();
  return [
    ...localizedPaths.flatMap((path) =>
      locales.map((locale) => ({
        url: url(localePath(locale, path)),
        alternates: { languages: Object.fromEntries(locales.map((l) => [l, url(localePath(l, path))])) },
      })),
    ),
    { url: url("/model") },
    { url: url("/privacy") },
  ];
}
