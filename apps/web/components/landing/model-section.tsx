import { ArrowRight } from "lucide-react";
import Link from "next/link";
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
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-32">
        <div>
          <p className="eyebrow">{model.eyebrow}</p>
          <h2 id="pricing-title" className="headline mt-4 text-4xl sm:text-5xl">
            {model.title}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-snug text-ink-soft">{model.lead}</p>
          <Link href="/model" className="mt-7 inline-flex items-center gap-1.5 font-semibold text-ink underline decoration-2 underline-offset-4 hover:decoration-ink/40">
            {model.learnMore}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
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
