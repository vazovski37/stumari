import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { Wordmark } from "./logo";

/** Black footer that ends in the full-width wordmark, like the master logo's field. */
export function SiteFooter({ locale, footer }: { locale: Locale; footer: Dictionary["footer"] }) {
  return (
    <footer className="on-dark">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-8 border-t border-white/15 py-12 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <p className="max-w-md text-sm leading-relaxed text-white/70">{footer.tagline}</p>
            <p className="text-sm text-white/55">{footer.georgian}</p>
          </div>
          <div className="space-y-3 text-sm md:text-right">
            <ul className="flex gap-5 font-medium md:justify-end">
              <li>
                <Link href={localePath(locale, "/apply")} className="underline-offset-4 hover:underline">
                  {footer.apply}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="underline-offset-4 hover:underline">
                  {footer.privacy}
                </Link>
              </li>
            </ul>
            <p className="text-white/55">{footer.disclaimer}</p>
            <p className="text-white/55">© 2026 Stumari</p>
          </div>
        </div>
        <Wordmark className="block h-auto w-full pb-10 sm:pb-14" />
      </div>
    </footer>
  );
}
