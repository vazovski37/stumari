import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
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
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20 lg:py-36">
        <div data-reveal>
          <p className="eyebrow">{model.eyebrow}</p>
          <h2 id="pricing-title" className="display mt-5 text-5xl sm:text-6xl">
            {model.title}
          </h2>
          <p className="mt-6 max-w-md text-lg leading-snug text-ink-soft">{model.lead}</p>
          <Link href="/model" className="mt-8 inline-flex items-center gap-2 border-b border-ink pb-1 text-sm font-semibold tracking-wide uppercase transition-[gap] hover:gap-3">
            {model.learnMore}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div data-reveal style={{ "--d": "0.12s" } as CSSProperties}>
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
