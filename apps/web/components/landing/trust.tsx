import { Hourglass, Info, LockKeyhole, Scale, ScrollText } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const icons = [LockKeyhole, ScrollText, Scale, Hourglass];

export function Trust({ trust }: { trust: Dictionary["trust"] }) {
  return (
    <section id="trust" aria-labelledby="trust-title" className="on-dark scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <p className="eyebrow">{trust.eyebrow}</p>
        <h2 id="trust-title" className="headline mt-4 text-4xl sm:text-5xl">
          {trust.title}
        </h2>
        <ul className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {trust.items.map((item, i) => {
            const Icon = icons[i % icons.length] ?? LockKeyhole;
            return (
              <li key={item.title}>
                <Icon aria-hidden="true" className="size-7" strokeWidth={1.5} />
                <h3 className="mt-5 text-xl font-extrabold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-2 leading-snug text-white/65">{item.body}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-16 flex gap-3 border-t border-white/20 pt-6 text-sm leading-relaxed text-white/65">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold text-white">{trust.limits.title}.</strong> {trust.limits.body}
          </span>
        </p>
      </div>
    </section>
  );
}
