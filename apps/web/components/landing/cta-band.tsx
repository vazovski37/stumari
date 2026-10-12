import { ArrowRight, CalendarClock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import streetPhoto from "@/public/landing/doorway.jpg";

/** The black close: runs straight into the black footer and its full-width wordmark. */
export function CtaBand({ locale, cta, images }: { locale: Locale; cta: Dictionary["cta"]; images: Dictionary["images"] }) {
  return (
    <section aria-labelledby="cta-title" className="on-dark overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pt-28 pb-20 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:pt-40">
        <div data-reveal>
          <h2 id="cta-title" className="display text-5xl sm:text-6xl lg:text-[5.5rem]">
            {cta.title}
          </h2>
          <p className="mt-6 max-w-md text-lg text-white/70">{cta.body}</p>
          <div className="mt-10 flex flex-wrap gap-3">
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
        <div data-reveal className="drift photo-card mx-auto aspect-[4/3] w-full max-w-md rotate-[3deg] ring-1 ring-white/10 lg:mr-0">
          <Image src={streetPhoto} alt={images.street} fill sizes="(min-width: 1024px) 448px, 90vw" className="object-cover" />
        </div>
      </div>
    </section>
  );
}
