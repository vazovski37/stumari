import Image from "next/image";
import type { CSSProperties } from "react";
import { contractExamples } from "@/lib/contract-examples";
import { contractTemplates } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatUsdc } from "@/lib/money";
import roomPhoto from "@/public/landing/room-gallery.jpg";
import windowPhoto from "@/public/landing/window-seat.jpg";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;
const num = (i: number) => String(i + 1).padStart(2, "0");

type Props = {
  how: Dictionary["how"];
  templates: Dictionary["model"]["templates"];
  example: string;
  images: Dictionary["images"];
};

/**
 * Bento: a tall photo card for step 1, a black card showing a real priced menu for step 2,
 * and a photo card with the 24 h payout for step 3.
 */
export function HowItWorks({ how, templates, example, images }: Props) {
  const [step1, step2, step3] = how.steps;
  const menu = contractExamples[0];
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <h2 id="how-title" data-reveal className="display text-5xl sm:text-6xl lg:text-7xl">
          {how.title}
        </h2>

        <ol className="mt-14 grid gap-4 lg:mt-20 lg:grid-cols-12 lg:grid-rows-[auto_auto] lg:gap-5">
          {step1 && (
            <li data-reveal className="photo-card min-h-[26rem] text-white lg:col-span-7 lg:row-span-2 lg:min-h-[40rem]">
              <Image src={roomPhoto} alt={images.room} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgb(0_0_0/0.82)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-7 sm:p-10">
                <span className="font-label text-sm text-white/60">{num(0)}</span>
                <h3 className="display mt-3 text-4xl sm:text-5xl">{step1.title}</h3>
                <p className="mt-3 max-w-md text-lg leading-snug text-white/75">{step1.body}</p>
              </div>
            </li>
          )}

          {step2 && (
            <li data-reveal style={delay(0.1)} className="on-dark rounded-[1.5rem] p-7 sm:p-9 lg:col-span-5">
              <span className="font-label text-sm text-white/50">{num(1)}</span>
              <h3 className="display mt-3 text-3xl sm:text-4xl">{step2.title}</h3>
              <p className="mt-3 leading-snug text-white/70">{step2.body}</p>
              <div className="mt-7">
                <p className="eyebrow">{example}</p>
                <ul className="mt-3 divide-y divide-white/10 rounded-2xl border border-white/15">
                  {contractTemplates.map((template) => {
                    const price = menu[template];
                    if (price === null) return null;
                    return (
                      <li key={template} className="flex items-baseline justify-between gap-4 px-4 py-3">
                        <span className="text-sm font-semibold">{templates[template].name}</span>
                        <span className="text-sm text-white/80 tabular-nums">{formatUsdc(price)} USDC</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          )}

          {step3 && (
            <li data-reveal style={delay(0.2)} className="photo-card min-h-[22rem] text-white lg:col-span-5">
              <Image src={windowPhoto} alt={images.window} fill sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.15)_0%,rgb(0_0_0/0.85)_100%)]" />
              <div className="absolute inset-0 flex flex-col justify-between p-7 sm:p-9">
                <span className="font-label text-sm text-white/60">{num(2)}</span>
                <div>
                  <p className="display text-7xl sm:text-8xl">
                    <strong>{how.bigNumber}</strong>
                  </p>
                  <h3 className="display mt-3 text-3xl sm:text-4xl">{step3.title}</h3>
                  <p className="mt-2 max-w-sm leading-snug text-white/75">{step3.body}</p>
                </div>
              </div>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}
