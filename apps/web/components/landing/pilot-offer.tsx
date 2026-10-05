import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

/** One big number up front; the pilot terms, verbatim from docs/sales/offer.md, one click away. */
export function PilotOffer({ locale, pilot }: { locale: Locale; pilot: Dictionary["pilot"] }) {
  return (
    <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">{pilot.eyebrow}</p>
            <h2 id="pilot-title" className="headline mt-4 text-4xl sm:text-5xl">
              {pilot.title}
            </h2>
            <p className="mt-5 text-lg text-ink-soft">{pilot.lead}</p>
            <Link href={localePath(locale, "/apply")} className="btn btn-primary mt-8">
              {pilot.cta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="border-t-2 border-ink pt-6">
            <p className="headline text-[7rem] leading-none sm:text-[9rem]">{pilot.big}</p>
            <p className="mt-4 max-w-sm text-lg leading-snug">{pilot.bigNote}</p>
          </div>
        </div>
        <details className="group mt-16 border-y border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold [&::-webkit-details-marker]:hidden">
            {pilot.termsToggle}
            <Plus aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-45" />
          </summary>
          <ul className="grid gap-x-10 pb-6 md:grid-cols-2">
            {pilot.terms.map((term) => (
              <li key={term} className="flex gap-3 border-t border-line py-3 text-sm leading-relaxed">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
