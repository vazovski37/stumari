import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { Logo } from "./logo";

export function SiteFooter({ locale, footer }: { locale: Locale; footer: Dictionary["footer"] }) {
  return (
    <footer className="border-t border-line bg-sand/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">{footer.tagline}</p>
          <p className="text-sm text-ink-soft">{footer.georgian}</p>
        </div>
        <div className="space-y-3 text-sm md:text-right">
          <ul className="flex gap-5 font-medium md:justify-end">
            <li>
              <Link href={localePath(locale, "/apply")} className="text-ink hover:text-wine">
                {footer.apply}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-ink hover:text-wine">
                {footer.privacy}
              </Link>
            </li>
          </ul>
          <p className="text-ink-soft">{footer.disclaimer}</p>
          <p className="text-ink-soft">© 2026 Stumari</p>
        </div>
      </div>
    </footer>
  );
}
