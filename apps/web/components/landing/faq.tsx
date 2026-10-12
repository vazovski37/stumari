import { Plus } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Native <details> disclosure: accessible and zero client JS. */
export function Faq({ faq }: { faq: Dictionary["faq"] }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-surface">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-36">
        <h2 id="faq-title" data-reveal className="display text-5xl sm:text-6xl lg:sticky lg:top-28 lg:self-start">
          {faq.title}
        </h2>
        <div data-reveal className="border-t border-ink/20">
          {faq.items.map((item) => (
            <details key={item.q} className="group border-b border-ink/15">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-ink/20 transition-colors group-open:bg-ink group-open:text-paper">
                  <Plus className="size-4 transition-transform duration-300 group-open:rotate-45" />
                </span>
              </summary>
              <p className="-mt-2 pr-14 pb-7 leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
