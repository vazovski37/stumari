import Link from "next/link";
import { localeNames, localePath, locales, type Locale, type LocalizedPath } from "@/lib/i18n/locales";
import { withUtm, type Utm } from "@/lib/utm";

const shortNames: Record<Locale, string> = { en: "EN", ka: "KA", ru: "RU" };

/**
 * Links to the same page in every locale. Server-rendered; no client JS. `utm` (the apply page's own
 * utm_* / ref) is carried over so switching language keeps the ad attribution.
 */
export function LanguageSwitcher({
  locale,
  path,
  label,
  utm = {},
}: {
  locale: Locale;
  path: LocalizedPath;
  label: string;
  utm?: Utm;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex items-center rounded-full border border-line bg-paper p-0.5 text-xs font-semibold">
        {locales.map((l) => (
          <li key={l}>
            <Link
              href={withUtm(localePath(l, path), utm)}
              hrefLang={l}
              lang={l}
              title={localeNames[l]}
              aria-current={l === locale ? "page" : undefined}
              className={`block rounded-full px-2.5 py-1.5 transition-colors ${
                l === locale ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              <span aria-hidden="true">{shortNames[l]}</span>
              <span className="sr-only">{localeNames[l]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
