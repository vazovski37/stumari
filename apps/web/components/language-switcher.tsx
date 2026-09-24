import Link from "next/link";
import { localeNames, localePath, locales, type Locale, type LocalizedPath } from "@/lib/i18n/locales";

const shortNames: Record<Locale, string> = { en: "EN", ka: "KA", ru: "RU" };

/** Links to the same page in every locale. Server-rendered; no client JS. */
export function LanguageSwitcher({ locale, path, label }: { locale: Locale; path: LocalizedPath; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex items-center rounded-full border border-line bg-paper p-0.5 text-xs font-semibold">
        {locales.map((l) => (
          <li key={l}>
            <Link
              href={localePath(l, path)}
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
