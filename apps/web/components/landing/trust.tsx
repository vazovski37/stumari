import { Hourglass, Info, LockKeyhole, Scale, ScrollText } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import panoramaPhoto from "@/public/landing/tbilisi-panorama.jpg";

const icons = [LockKeyhole, ScrollText, Scale, Hourglass];
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** Night panorama behind frosted cards: where the money sits, and the honest limits. */
export function Trust({ trust, images }: { trust: Dictionary["trust"]; images: Dictionary["images"] }) {
  return (
    <section id="trust" aria-labelledby="trust-title" className="on-dark relative isolate scroll-mt-20 overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image src={panoramaPhoto} alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.55)_45%,rgb(0_0_0/0.9)_100%)]" />
      </div>
      <p className="sr-only">{images.panorama}</p>

      <div className="mx-auto max-w-7xl px-5 py-28 sm:px-8 lg:py-40">
        <div data-reveal className="max-w-3xl">
          <p className="eyebrow">{trust.eyebrow}</p>
          <h2 id="trust-title" className="display mt-5 text-5xl sm:text-6xl lg:text-7xl">
            {trust.title}
          </h2>
        </div>
        <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:mt-24 lg:grid-cols-4 lg:gap-5">
          {trust.items.map((item, i) => {
            const Icon = icons[i % icons.length] ?? LockKeyhole;
            return (
              <li key={item.title} data-reveal style={delay(i * 0.08)} className="glass flex flex-col rounded-[1.5rem] p-7">
                <Icon aria-hidden="true" className="size-7" strokeWidth={1.4} />
                <h3 className="mt-10 text-xl font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-snug text-white/70">{item.body}</p>
              </li>
            );
          })}
        </ul>
        <p data-reveal className="mt-12 flex max-w-4xl gap-3 text-sm leading-relaxed text-white/65">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold text-white">{trust.limits.title}.</strong> {trust.limits.body}
          </span>
        </p>
      </div>
    </section>
  );
}
