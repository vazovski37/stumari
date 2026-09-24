import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

/** The pilot terms, verbatim from docs/sales/offer.md (via the dictionaries). */
export function PilotOffer({ locale, pilot }: { locale: Locale; pilot: Dictionary["pilot"] }) {
  return (
    <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">{pilot.eyebrow}</p>
            <h2 id="pilot-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {pilot.title}
            </h2>
            <p className="mt-4 text-lg text-ink-soft">{pilot.lead}</p>
            <Link href={localePath(locale, "/apply")} className="btn btn-primary mt-8">
              {pilot.cta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ul className="card divide-y divide-line">
            {pilot.terms.map((term) => (
              <li key={term} className="flex gap-3 px-6 py-4 leading-relaxed text-ink">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-vine" />
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
