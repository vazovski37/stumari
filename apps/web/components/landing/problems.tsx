import Image from "next/image";
import type { CSSProperties } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import alleyPhoto from "@/public/landing/alley.jpg";
import lampPhoto from "@/public/landing/room-lamp.jpg";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** Big centred heading between two drifting photo cards, then three oversized numbers. */
export function Problems({ problems, images }: { problems: Dictionary["problems"]; images: Dictionary["images"] }) {
  return (
    <section aria-labelledby="problems-title" className="relative overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-5 pt-28 pb-24 sm:px-8 lg:pt-40 lg:pb-32">
        <div aria-hidden="true" className="drift photo-card absolute top-24 left-8 hidden aspect-[3/4] w-52 rotate-[-5deg] xl:block 2xl:w-60">
          <Image src={alleyPhoto} alt="" fill sizes="224px" className="object-cover" />
        </div>
        <div aria-hidden="true" className="drift-reverse photo-card absolute top-52 right-8 hidden aspect-[4/3] w-52 rotate-[4deg] xl:block 2xl:w-72">
          <Image src={lampPhoto} alt="" fill sizes="256px" className="object-cover" />
        </div>
        <p className="sr-only">
          {images.alley}. {images.lamp}.
        </p>

        <h2 id="problems-title" data-reveal className="display mx-auto max-w-3xl text-center text-5xl sm:text-6xl lg:text-7xl">
          {problems.title}
        </h2>

        <ul className="mt-20 grid gap-14 md:grid-cols-3 md:gap-10 lg:mt-28">
          {problems.items.map((item, i) => (
            <li key={item.stat} data-reveal style={delay(i * 0.12)} className="border-t border-ink/15 pt-7">
              <p className="display text-6xl tabular-nums md:text-[3.4rem] lg:text-7xl">
                <strong>{item.stat}</strong>
              </p>
              <p className="mt-5 max-w-xs text-lg leading-snug text-ink-soft">{item.title}</p>
              {"source" in item && item.source && <p className="mt-3 text-xs text-ink-soft/80">{item.source}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
