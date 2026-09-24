import { Plus } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Native <details> disclosure: accessible and zero client JS. */
export function Faq({ faq }: { faq: Dictionary["faq"] }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-line bg-sand/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {faq.title}
        </h2>
        <div className="mt-10 space-y-3">
          {faq.items.map((item) => (
            <details key={item.q} className="group card !shadow-none open:!shadow-[var(--shadow-card)]">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-wine transition-transform group-open:rotate-45" />
              </summary>
              <p className="-mt-1 px-5 pb-5 leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
