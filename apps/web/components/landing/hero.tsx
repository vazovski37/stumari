import { ArrowRight, CalendarClock, LockKeyhole, MapPin, Undo2, Wallet, WalletCards } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import heroPhoto from "@/public/landing/hero-narikala.jpg";

/** Guest pays → held in escrow → paid to the hotel; the last step is the positive colour. */
const stepIcons = [WalletCards, LockKeyhole, Wallet] as const;

/** Georgian words run about a third longer than English, so its headline steps down a size. */
const headlineSize = {
  default: "text-[2.9rem] sm:text-[4rem] lg:text-[5.1rem]",
  ka: "text-[2.2rem] sm:text-[3rem] lg:text-[3.6rem]",
} as const;

/** Stagger for the hero's rise-in (globals.css .rise). */
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

type Props = { locale: Locale; hero: Dictionary["hero"]; images: Dictionary["images"] };

/**
 * Full-screen cinematic hero: the black-and-white Tbilisi photo opens from a tile to full bleed,
 * the headline rises in, and the example booking floats on frosted glass.
 */
export function Hero({ locale, hero, images }: Props) {
  const { card } = hero;
  return (
    <section className="on-dark relative isolate min-h-[100svh] overflow-hidden">
      <div aria-hidden="true" className="hero-open absolute inset-0 -z-10 overflow-hidden bg-black">
        <Image
          src={heroPhoto}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="hero-zoom object-cover object-[50%_35%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.65)_0%,rgb(0_0_0/0.15)_30%,rgb(0_0_0/0.35)_60%,rgb(0_0_0/0.92)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(80rem_40rem_at_15%_60%,rgb(0_0_0/0.55),transparent_70%)]" />
      </div>
      <p className="sr-only">{images.hero}</p>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col px-5 pt-28 pb-8 sm:px-8 lg:pt-36">
        <div className="grid flex-1 items-center gap-12 lg:grid-cols-[1.45fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow rise" style={delay(0)}>
              {hero.eyebrow}
            </p>
            <h1 className={`display mt-6 ${headlineSize[locale === "ka" ? "ka" : "default"]}`}>
              <span className="rise block" style={delay(0.1)}>
                {hero.title}
              </span>
              <strong className="rise mt-1 block" style={delay(0.22)}>
                {hero.titleAccent}
                <span className="text-white/45">*</span>
              </strong>
            </h1>
            <p className="rise mt-8 max-w-md text-lg leading-relaxed text-white/75" style={delay(0.36)}>
              {hero.lead}
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={delay(0.46)}>
              <Link href={localePath(locale, "/apply")} className="btn btn-light">
                {hero.ctaPrimary}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={localePath(locale, "/apply?type=demo")} className="btn btn-outline-light backdrop-blur-sm">
                <CalendarClock aria-hidden="true" className="size-4" />
                {hero.ctaDemo}
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm lg:mr-0">
            <figure className="glass rise rounded-[1.75rem] p-6 sm:p-7" style={delay(0.55)} aria-label={card.label}>
              <figcaption className="flex items-baseline justify-between gap-4">
                <span className="eyebrow">{card.label}</span>
                <span className="text-xs text-white/60">{card.room}</span>
              </figcaption>
              <p className="display mt-4 text-5xl tabular-nums">
                <strong>{card.amount}</strong>
              </p>
              <ol className="mt-7">
                {card.steps.map((step, i) => {
                  const Icon = stepIcons[i] ?? Wallet;
                  const last = i === card.steps.length - 1;
                  return (
                    <li key={step} className="relative flex items-center gap-4 pb-5 last:pb-0">
                      {!last && <span aria-hidden="true" className="absolute top-10 bottom-0 left-5 w-px bg-white/20" />}
                      <span
                        aria-hidden="true"
                        className={`grid size-10 shrink-0 place-items-center rounded-full ${last ? "bg-white text-black" : "bg-white/10 text-white"}`}
                      >
                        <Icon className="size-[1.1rem]" strokeWidth={1.75} />
                      </span>
                      <span className={`text-sm ${last ? "font-semibold text-white" : "text-white/80"}`}>{step}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-white/60">
                <Undo2 aria-hidden="true" className="size-3.5 shrink-0" />
                {card.cancel}
              </p>
            </figure>
          </div>
        </div>

        <div className="rise mt-14 grid grid-cols-[1fr_auto_1fr] items-end gap-4 text-xs text-white/55" style={delay(0.9)}>
          <p className="max-w-xs">* {hero.footnote}</p>
          <a href="#how" className="flex flex-col items-center gap-3 tracking-[0.2em] uppercase hover:text-white">
            {hero.scroll}
            <span aria-hidden="true" className="scroll-line relative block h-10 w-px bg-white/20" />
          </a>
          <p className="flex items-center justify-end gap-1.5 text-right tracking-wide uppercase">
            <MapPin aria-hidden="true" className="size-3.5" />
            {hero.place}
          </p>
        </div>
      </div>
    </section>
  );
}
