import { Check } from "lucide-react";
import { contractExamples, EXAMPLE_BASE_MINOR } from "@/lib/contract-examples";
import { contractTemplates } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatChange, formatUsdc } from "@/lib/money";
import { ContractCompare, type CompareGuest } from "./contract-compare";

export function ModelSection({ model }: { model: Dictionary["model"] }) {
  const { compare, templates } = model;
  const guests: CompareGuest[] = contractExamples.map((prices, i) => ({
    label: compare.guests[i]?.label ?? "",
    detail: compare.guests[i]?.detail ?? "",
    rows: contractTemplates.map((template) => {
      const price = prices[template];
      return {
        key: template,
        name: templates[template].name,
        terms: templates[template].terms,
        price: price === null ? null : `${formatUsdc(price)} USDC`,
        change: price === null ? null : formatChange(price, EXAMPLE_BASE_MINOR),
      };
    }),
  }));

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-y border-line bg-sand/60">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div>
          <p className="eyebrow">{model.eyebrow}</p>
          <h2 id="pricing-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {model.title}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">{model.lead}</p>
          <ul className="mt-6 space-y-3">
            {model.points.map((point) => (
              <li key={point} className="flex gap-3 text-ink">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-vine" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <ContractCompare
            guests={guests}
            labels={{
              illustrative: compare.illustrative,
              caption: compare.caption,
              contract: compare.contract,
              price: compare.price,
              vsBase: compare.vsBase,
              notShown: compare.notShown,
            }}
          />
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">{compare.footnote}</p>
        </div>
      </div>
    </section>
  );
}
