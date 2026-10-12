import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

/** One cinematic number up front; the pilot terms, verbatim from docs/sales/offer.md, one click away. */
export function PilotOffer({ locale, pilot }: { locale: Locale; pilot: Dictionary["pilot"] }) {
  return (
    <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 lg:py-40">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-end lg:gap-16">
          <div data-reveal>
            <p className="eyebrow">{pilot.eyebrow}</p>
            <h2 id="pilot-title" className="display mt-5 text-5xl sm:text-6xl lg:text-7xl">
              {pilot.title}
            </h2>
            <p className="mt-6 max-w-md text-lg text-ink-soft">{pilot.lead}</p>
            <Link href={localePath(locale, "/apply")} className="btn btn-primary mt-9">
              {pilot.cta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div data-reveal className="lg:text-right">
            <p className="display text-[9rem] leading-[0.8] tracking-[-0.06em] sm:text-[13rem] lg:text-[16rem]">
              <strong>{pilot.big}</strong>
            </p>
            <p className="mt-6 max-w-sm text-lg leading-snug lg:ml-auto">{pilot.bigNote}</p>
          </div>
        </div>
        <details data-reveal className="group mt-20 border-y border-ink/15">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 text-sm font-semibold tracking-wide uppercase [&::-webkit-details-marker]:hidden">
            {pilot.termsToggle}
            <Plus aria-hidden="true" className="size-5 shrink-0 transition-transform duration-300 group-open:rotate-45" />
          </summary>
          <ul className="grid gap-x-12 pb-8 md:grid-cols-2">
            {pilot.terms.map((term) => (
              <li key={term} className="flex gap-3 border-t border-line py-3.5 text-sm leading-relaxed">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
