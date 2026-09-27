import { ArrowRight, CalendarClock, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

const stepTones = ["bg-vine", "bg-amber", "bg-clay", "bg-wine"] as const;

export function Hero({ locale, hero }: { locale: Locale; hero: Dictionary["hero"] }) {
  const { card } = hero;
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,var(--color-amber-soft),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-20 lg:pb-28">
        <div>
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.6rem]">
            {hero.title} <span className="block text-wine">{hero.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{hero.lead}</p>
          <p className="mt-4 max-w-xl border-l-2 border-amber pl-4 text-sm leading-relaxed text-ink-soft">
            {hero.caveat}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={localePath(locale, "/apply")} className="btn btn-primary">
              {hero.ctaPrimary}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href={localePath(locale, "/apply?type=demo")} className="btn btn-secondary">
              <CalendarClock aria-hidden="true" className="size-4" />
              {hero.ctaDemo}
            </Link>
          </div>
          <a href="#how" className="mt-4 inline-flex text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-wine">
            {hero.ctaSecondary}
          </a>
        </div>

        <figure className="card relative p-6 sm:p-7" aria-label={card.label}>
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold text-wine-deep">{card.label}</span>
            <span className="text-xs font-medium text-ink-soft">{card.contract}</span>
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-ink">{card.room}</p>
            <p className="text-sm text-ink-soft">{card.dates}</p>
          </div>
          <div className="mt-5 rounded-2xl bg-sand px-5 py-4">
            <p className="font-display text-3xl font-semibold tracking-tight text-ink">{card.amount}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
              <LockKeyhole aria-hidden="true" className="size-4 text-vine" />
              {card.held}
            </p>
          </div>
          <figcaption className="mt-6 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {card.timelineTitle}
          </figcaption>
          <ol className="mt-3 space-y-0">
            {card.steps.map((step, i) => (
              <li key={step.when} className="relative flex gap-4 pb-4 last:pb-0">
                {i < card.steps.length - 1 && (
                  <span aria-hidden="true" className="absolute top-4 left-[5px] h-full w-px bg-line" />
                )}
                <span aria-hidden="true" className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ${stepTones[i % stepTones.length]}`} />
                <div className="text-sm">
                  <p className="font-semibold text-ink">{step.when}</p>
                  <p className="text-ink-soft">{step.what}</p>
                </div>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}
