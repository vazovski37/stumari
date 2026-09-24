"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

export type CompareRow = { key: string; name: string; terms: string; price: string | null; change: string | null };
export type CompareGuest = { label: string; detail: string; rows: CompareRow[] };

type Props = {
  guests: CompareGuest[];
  labels: { illustrative: string; caption: string; contract: string; price: string; vsBase: string; notShown: string };
};

/** Tabs switching between the two illustrative requests; the table itself is plain markup. */
export function ContractCompare({ guests, labels }: Props) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const guest = guests[active];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (active + (event.key === "ArrowRight" ? 1 : guests.length - 1)) % guests.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 pt-5 pb-4">
        <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold tracking-wide text-wine-deep uppercase">
          {labels.illustrative}
        </span>
        <span className="text-xs text-ink-soft">{labels.caption}</span>
      </div>
      <div role="tablist" aria-label={labels.illustrative} className="grid grid-cols-2 gap-2 px-5 pt-4">
        {guests.map((g, i) => (
          <button
            key={g.label}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              i === active ? "border-wine bg-wine text-paper" : "border-line text-ink hover:border-ink-soft"
            }`}
          >
            <span className="block text-sm font-semibold">{g.label}</span>
            <span className={`block text-xs ${i === active ? "text-paper/85" : "text-ink-soft"}`}>{g.detail}</span>
          </button>
        ))}
      </div>
      {guest && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} className="px-5 pt-3 pb-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-soft">
                <th scope="col" className="py-2 font-medium">{labels.contract}</th>
                <th scope="col" className="py-2 text-right font-medium">{labels.price}</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">{labels.vsBase}</th>
              </tr>
            </thead>
            <tbody>
              {guest.rows.map((row) => (
                <tr key={row.key} className="border-t border-line align-top">
                  <th scope="row" className="py-3 pr-2 font-normal">
                    <span className="block font-semibold text-ink">{row.name}</span>
                    <span className="block text-xs text-ink-soft">{row.terms}</span>
                  </th>
                  {row.price === null ? (
                    <td colSpan={2} className="py-3 text-right text-xs text-ink-soft">
                      {labels.notShown}
                    </td>
                  ) : (
                    <>
                      <td className="py-3 text-right font-display text-base font-semibold whitespace-nowrap text-ink tabular-nums">
                        {row.price}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap text-ink-soft tabular-nums">{row.change}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
