"use client";

import { BPS_DENOM, perWindowRefund, TEMPLATES, WINDOW_LABELS, type Explain, type TemplateId } from "@stumari/core";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { modelReport } from "@/lib/model-report";
import { formatUsdc } from "@/lib/money";
import { withheldText } from "./menu";

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const count = (n: number) => n.toLocaleString("en-US");

/**
 * "Why this price" (api.md /h/[slug]): the explain block of the quote for one option — P(cancel),
 * per-window cancellation chances, what each costs under this contract, the multiplier, and the
 * resale assumptions it rests on.
 */
export function ExplainDrawer({
  explain,
  optionId,
  basePriceMinor,
  amountCapMinor = null,
  onClose,
}: {
  explain: Explain;
  optionId: TemplateId | null;
  basePriceMinor: bigint;
  /** The pilot cap per booking (public config), to name it when an option is withheld above it. */
  amountCapMinor?: string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (optionId && d && !d.open) d.showModal();
    if (!optionId && d?.open) d.close();
  }, [optionId]);

  const option = explain.options.find((o) => o.id === optionId);
  const reference = explain.options.find((o) => o.id === explain.reference_template);
  const refund = optionId ? perWindowRefund(TEMPLATES[optionId].tiers) : [];
  const maxQ = Math.max(...explain.q, 0.0001);
  const resale = explain.resale_bps.map((b) => b / BPS_DENOM);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="explain-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(34rem,100vw)] max-w-none border-l border-line bg-paper p-0 text-ink backdrop:bg-ink/40"
    >
      {option && optionId && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div>
              <p className="eyebrow">Why this price</p>
              <h2 id="explain-title" className="mt-1 text-2xl font-semibold tracking-tight">
                {TEMPLATES[optionId].name}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">{TEMPLATES[optionId].description}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-surface" aria-label="Close">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-medium text-ink-soft">Chance this booking is cancelled</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{pct(explain.p_cancel)}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-medium text-ink-soft">Booked ahead</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                  {explain.lead_time} <span className="text-base font-medium text-ink-soft">days</span>
                </p>
              </div>
            </section>

            <section aria-labelledby="windows-title">
              <h3 id="windows-title" className="font-sans text-base font-semibold">
                When a cancellation would happen
              </h3>
              <p className="mt-1 text-sm text-ink-soft">
                The model&rsquo;s chance of a cancellation in each window before check-in (q), the refund this contract
                pays in that window, and how likely the hotel is to resell a freed night then.
              </p>
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-ink-soft">
                    <th scope="col" className="py-1.5 font-medium">Before check-in</th>
                    <th scope="col" className="py-1.5 font-medium">Chance (q)</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Refund</th>
                    <th scope="col" className="py-1.5 pl-2 text-right font-medium">Resale</th>
                  </tr>
                </thead>
                <tbody>
                  {explain.q.map((q, k) => {
                    const reachable = explain.hazard[k] !== null;
                    return (
                      <tr key={k} className={`border-t border-line ${reachable ? "" : "text-ink-soft/70"}`}>
                        <th scope="row" className="py-2 pr-2 font-normal whitespace-nowrap">
                          {WINDOW_LABELS[k]}
                        </th>
                        <td className="w-2/5 py-2">
                          {reachable ? (
                            <span className="flex items-center gap-2">
                              <span className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(3, (q / maxQ) * 100)}%` }} />
                              <span className="tabular-nums">{pct(q)}</span>
                            </span>
                          ) : (
                            <span className="text-xs">does not apply</span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{pct(refund[k] ?? 0, 0)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{pct(resale[k] ?? 0, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="price-title" className="space-y-2 text-sm">
              <h3 id="price-title" className="font-sans text-base font-semibold">
                From risk to price
              </h3>
              <dl className="divide-y divide-line rounded-2xl border border-line bg-white">
                <Row term="Risk cost of this contract" detail="Σ q × (refund − resale), never below 0 per window">
                  {pct(option.risk_cost, 2)}
                </Row>
                {reference && reference.id !== option.id && (
                  <Row term={`Risk cost of the hotel's usual contract (${TEMPLATES[reference.id].name})`}>{pct(reference.risk_cost, 2)}</Row>
                )}
                <Row term="Multiplier" detail="(1 − usual risk) ÷ (1 − this risk)">
                  {option.m_bps === null ? "—" : `× ${(option.m_bps / BPS_DENOM).toFixed(4)}`}
                </Row>
                <Row term="Base rate for these nights">{formatUsdc(basePriceMinor)} USDC</Row>
                <Row term="Price" strong>
                  {option.price_minor ? `${formatUsdc(BigInt(option.price_minor))} USDC` : "not offered"}
                </Row>
              </dl>
              <p className="text-ink-soft">
                {option.id === explain.reference_template
                  ? "This is the hotel's usual cancellation policy, so it costs exactly the base rate."
                  : "Every contract is priced to target the same expected revenue for the hotel as its usual policy: more refund costs more, less refund costs less."}
                {option.clamped === "floor" && " This contract hit the hotel's lowest allowed multiplier."}
              </p>
            </section>

            {explain.options.some((o) => o.withheld) && (
              <section className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft">
                {explain.options
                  .filter((o) => o.withheld)
                  .map((o) => (
                    <p key={o.id}>{withheldText(o, explain, amountCapMinor)}</p>
                  ))}
              </section>
            )}

            <section className="space-y-2 text-sm text-ink-soft">
              <p>
                Model {explain.model_version}: a calibrated time-to-cancel model learned from{" "}
                {count(modelReport.training.trainBookings)} bookings at two Portuguese hotels (2015–2017) and evaluated on{" "}
                {count(modelReport.test.bookings)} held-out ones. It has not yet been recalibrated on this hotel&rsquo;s own bookings.
              </p>
              <Link href="/model" className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2">
                How the model works and how well it is calibrated
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}

function Row({ term, detail, strong, children }: { term: string; detail?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt>
        <span className={strong ? "font-semibold text-ink" : "text-ink"}>{term}</span>
        {detail && <span className="block text-xs text-ink-soft">{detail}</span>}
      </dt>
      <dd className={`text-right tabular-nums ${strong ? "font-display text-lg font-semibold" : ""}`}>{children}</dd>
    </div>
  );
}
