import { ArrowRight, CalendarClock, LockKeyhole, Undo2, Wallet, WalletCards } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

/** Guest pays → held in escrow → paid to the hotel; the last step is the positive colour. */
const stepIcons = [WalletCards, LockKeyhole, Wallet] as const;

/** Georgian words run about a third longer than English, so its headline steps down a size. */
const headlineSize = {
  default: "text-[2.5rem] sm:text-[3.4rem] lg:text-[4rem]",
  ka: "text-[2.1rem] sm:text-[2.7rem] lg:text-[3.1rem]",
} as const;

export function Hero({ locale, hero }: { locale: Locale; hero: Dictionary["hero"] }) {
  const { card } = hero;
  return (
    <section className="on-dark">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-16 lg:pt-28 lg:pb-32">
        <div>
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1 className={`headline mt-6 ${headlineSize[locale === "ka" ? "ka" : "default"]}`}>
            {hero.title} <span className="mt-1 block text-white/50">{hero.titleAccent}*</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-white/75">{hero.lead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={localePath(locale, "/apply")} className="btn btn-light">
              {hero.ctaPrimary}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href={localePath(locale, "/apply?type=demo")} className="btn btn-outline-light">
              <CalendarClock aria-hidden="true" className="size-4" />
              {hero.ctaDemo}
            </Link>
          </div>
          <p className="mt-6 text-xs text-white/50">* {hero.footnote}</p>
        </div>

        <figure className="on-light rounded-[var(--radius-card)] p-6 sm:p-8" aria-label={card.label}>
          <figcaption className="flex items-baseline justify-between gap-4">
            <span className="eyebrow">{card.label}</span>
            <span className="text-sm text-ink-soft">{card.room}</span>
          </figcaption>
          <p className="headline mt-4 text-5xl tabular-nums">{card.amount}</p>
          <ol className="mt-8">
            {card.steps.map((step, i) => {
              const Icon = stepIcons[i] ?? Wallet;
              const last = i === card.steps.length - 1;
              return (
                <li key={step} className="relative flex items-center gap-4 pb-6 last:pb-0">
                  {!last && <span aria-hidden="true" className="absolute top-10 bottom-0 left-5 w-px bg-line" />}
                  <span
                    aria-hidden="true"
                    className={`grid size-10 shrink-0 place-items-center rounded-full ${last ? "bg-positive text-paper" : "bg-surface text-ink"}`}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className={`font-semibold ${last ? "text-positive" : ""}`}>{step}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-8 flex items-center gap-2 border-t border-line pt-5 text-sm text-ink-soft">
            <Undo2 aria-hidden="true" className="size-4 shrink-0" />
            {card.cancel}
          </p>
        </figure>
      </div>
    </section>
  );
}
