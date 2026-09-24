import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fontVariables } from "@/app/fonts";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { locales, resolveLocale } from "@/lib/i18n/locales";
import { siteUrl } from "@/lib/site";
import "../globals.css";

// '/' and '/apply' are served from /en via rewrites in next.config.ts.
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "Stumari",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[lang]">) {
  const locale = resolveLocale((await params).lang);
  if (!locale) notFound();
  const dict = getDictionary(locale);
  return (
    <html lang={locale} className={fontVariables}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {dict.nav.skip}
        </a>
        {children}
      </body>
    </html>
  );
}
