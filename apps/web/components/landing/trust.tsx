import { Hourglass, Info, LockKeyhole, Scale, ScrollText } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const icons = [LockKeyhole, ScrollText, Scale, Hourglass];

export function Trust({ trust }: { trust: Dictionary["trust"] }) {
  return (
    <section id="trust" aria-labelledby="trust-title" className="arches scroll-mt-20 bg-wine-deep text-paper">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-sm font-semibold tracking-[0.08em] text-amber uppercase">{trust.eyebrow}</p>
        <h2 id="trust-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {trust.title}
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-paper/85">{trust.lead}</p>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {trust.items.map((item, i) => {
            const Icon = icons[i % icons.length] ?? LockKeyhole;
            return (
              <li key={item.title} className="rounded-[var(--radius-card)] border border-paper/15 bg-wine-deep/80 p-6 backdrop-blur-sm">
                <Icon aria-hidden="true" className="size-6 text-amber" />
                <h3 className="mt-4 font-sans text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-paper/85">{item.body}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex gap-4 rounded-[var(--radius-card)] border border-amber/40 bg-wine-deep/80 p-6">
          <Info aria-hidden="true" className="size-6 shrink-0 text-amber" />
          <div>
            <h3 className="font-sans text-lg font-semibold">{trust.limits.title}</h3>
            <p className="mt-2 leading-relaxed text-paper/85">{trust.limits.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
