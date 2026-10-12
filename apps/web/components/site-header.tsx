import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale, type LocalizedPath } from "@/lib/i18n/locales";
import type { Utm } from "@/lib/utm";
import { HeaderScroll } from "./header-scroll";
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
  /** Float transparent over a full-bleed hero and turn solid on scroll (landing page only). */
  overlay?: boolean;
};

/** White wordmark on black, or floating over the hero photo (docs/product/brand.md). */
export function SiteHeader({ locale, nav, switcherPath, switcherUtm, sections = false, overlay = false }: Props) {
  const anchors = [
    { href: "#how", label: nav.how },
    { href: "#pricing", label: nav.model },
    { href: "#trust", label: nav.trust },
    { href: "#pilot", label: nav.pilot },
    { href: "#faq", label: nav.faq },
  ];
  const position = overlay
    ? "fixed inset-x-0 top-0 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-500 data-[scrolled]:border-white/10 data-[scrolled]:bg-black/75 data-[scrolled]:backdrop-blur-xl"
    : "sticky top-0 border-b border-white/10 bg-black";
  return (
    <HeaderScroll className={`z-40 text-white [--focus-ring:#fff] ${position}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8 lg:h-20">
        <Link href={localePath(locale)} aria-label={nav.home} className="shrink-0 py-2">
          <Logo />
        </Link>
        {sections && (
          <nav aria-label={nav.sections} className="mx-auto hidden lg:block">
            <ul className="flex items-center gap-8 text-[0.8rem] font-medium tracking-wide text-white/70 uppercase">
              {anchors.map((a) => (
                <li key={a.href}>
                  <a href={a.href} className="transition-colors hover:text-white">
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className={`flex items-center gap-3 ${sections ? "" : "ml-auto"} max-lg:ml-auto`}>
          {switcherPath !== undefined && <LanguageSwitcher locale={locale} path={switcherPath} label={nav.language} utm={switcherUtm} />}
          {switcherPath !== "/apply" && (
            <Link href={localePath(locale, "/apply")} className="btn btn-light hidden !px-5 !py-2.5 text-sm sm:inline-flex">
              {nav.apply}
            </Link>
          )}
        </div>
      </div>
    </HeaderScroll>
  );
}
