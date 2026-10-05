import type { Metadata } from "next";
import Link from "next/link";
import { fontVariables } from "@/app/fonts";
import { LogoMark } from "@/components/logo";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath, locales } from "@/lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found — Stumari" };

/** Unmatched URLs have no locale, so the message is shown in all three languages. */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVariables}>
      <body className="flex min-h-dvh items-center justify-center px-4">
        <main className="max-w-lg py-16 text-center">
          <LogoMark className="mx-auto size-12" />
          <ul className="mt-8 space-y-6">
            {locales.map((locale, i) => {
              const { notFound } = getDictionary(locale);
              const Heading = i === 0 ? "h1" : "h2";
              return (
                <li key={locale} lang={locale}>
                  <Heading className="text-2xl font-semibold tracking-tight">{notFound.title}</Heading>
                  <p className="mt-1 text-ink-soft">{notFound.body}</p>
                  <Link href={localePath(locale)} className="mt-2 inline-block font-medium text-brand underline underline-offset-2">
                    {notFound.home}
                  </Link>
                </li>
              );
            })}
          </ul>
        </main>
      </body>
    </html>
  );
}
