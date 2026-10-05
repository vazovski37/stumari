import { Plus } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Native <details> disclosure: accessible and zero client JS. */
export function Faq({ faq }: { faq: Dictionary["faq"] }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-28">
        <h2 id="faq-title" className="headline text-4xl sm:text-5xl">
          {faq.title}
        </h2>
        <div className="mt-12 border-t-2 border-ink">
          {faq.items.map((item) => (
            <details key={item.q} className="group border-b border-ink/15">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus aria-hidden="true" className="mt-1 size-5 shrink-0 transition-transform group-open:rotate-45" />
              </summary>
              <p className="-mt-1 pr-9 pb-6 leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
