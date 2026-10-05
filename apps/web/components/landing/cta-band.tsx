import { ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

/** The black close: runs straight into the black footer (docs/product/brand.md). */
export function CtaBand({ locale, cta }: { locale: Locale; cta: Dictionary["cta"] }) {
  return (
    <section aria-labelledby="cta-title" className="on-dark">
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 lg:pt-28">
        <h2 id="cta-title" className="headline max-w-3xl text-4xl sm:text-6xl">
          {cta.title}
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-white/70">{cta.body}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href={localePath(locale, "/apply")} className="btn btn-light">
            {cta.button}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link href={localePath(locale, "/apply?type=demo")} className="btn btn-outline-light">
            <CalendarClock aria-hidden="true" className="size-4" />
            {cta.demoButton}
          </Link>
        </div>
      </div>
    </section>
  );
}
