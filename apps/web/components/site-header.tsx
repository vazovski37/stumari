import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale, type LocalizedPath } from "@/lib/i18n/locales";
import type { Utm } from "@/lib/utm";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

type Props = {
  locale: Locale;
  nav: Dictionary["nav"];
  /** Localized page the switcher links between; omit on English-only pages. */
  switcherPath?: LocalizedPath;
  /** Attribution tags the language switcher carries to the other locales (apply page). */
  switcherUtm?: Utm;
  /** Show in-page section links (landing page only). */
  sections?: boolean;
};

export function SiteHeader({ locale, nav, switcherPath, switcherUtm, sections = false }: Props) {
  const anchors = [
    { href: "#how", label: nav.how },
    { href: "#pricing", label: nav.model },
    { href: "#trust", label: nav.trust },
    { href: "#pilot", label: nav.pilot },
    { href: "#faq", label: nav.faq },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={localePath(locale)} aria-label={nav.home} className="shrink-0">
          <Logo />
        </Link>
        {sections && (
          <nav aria-label={nav.sections} className="ml-6 hidden lg:block">
            <ul className="flex items-center gap-6 text-sm font-medium text-ink-soft">
              {anchors.map((a) => (
                <li key={a.href}>
                  <a href={a.href} className="transition-colors hover:text-wine">
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          {switcherPath !== undefined && <LanguageSwitcher locale={locale} path={switcherPath} label={nav.language} utm={switcherUtm} />}
          {switcherPath !== "/apply" && (
            <Link href={localePath(locale, "/apply")} className="btn btn-primary hidden !px-4 !py-2 text-sm sm:inline-flex">
              {nav.apply}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
