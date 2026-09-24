import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

export function CtaBand({ locale, cta }: { locale: Locale; cta: Dictionary["cta"] }) {
  return (
    <section aria-labelledby="cta-title" className="arches bg-wine text-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 id="cta-title" className="text-3xl font-semibold tracking-tight">
            {cta.title}
          </h2>
          <p className="mt-3 text-lg text-paper/85">{cta.body}</p>
        </div>
        <Link href={localePath(locale, "/apply")} className="btn btn-light shrink-0">
          {cta.button}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
