"use client";

import { useState } from "react";
import type { ReliabilityBin } from "@/lib/model-report";

/**
 * Reliability diagram: predicted vs observed cancellation rate per equal-count bin, before and
 * after Platt calibration. Two series in a validated pair (clay, ochre) with distinct marker
 * shapes, a legend, per-point hover and a table view.
 */
const SERIES = [
  { key: "after", label: "Platt-calibrated (used for prices)", color: "#a8462a", shape: "circle" },
  { key: "before", label: "Uncalibrated model", color: "#b98a2e", shape: "square" },
] as const;

const W = 560;
const H = 420;
const PAD = { left: 52, right: 16, top: 16, bottom: 48 };
const MAX = 0.6;
const x = (v: number) => PAD.left + (v / MAX) * (W - PAD.left - PAD.right);
const y = (v: number) => H - PAD.bottom - (v / MAX) * (H - PAD.top - PAD.bottom);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

export function ReliabilityChart({ before, after }: { before: ReliabilityBin[]; after: ReliabilityBin[] }) {
  const data = { before, after };
  const [hover, setHover] = useState<{ series: (typeof SERIES)[number]; bin: ReliabilityBin; i: number } | null>(null);

  return (
    <figure className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
              {s.shape === "circle" ? <circle cx="6" cy="6" r="5" fill={s.color} /> : <rect x="1" y="1" width="10" height="10" rx="1.5" fill={s.color} />}
            </svg>
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-ink-soft">
          <svg viewBox="0 0 16 4" className="h-1 w-4" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
          Perfect calibration
        </li>
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Predicted versus observed cancellation rate for ten groups of held-out bookings">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(0)} x2={x(MAX)} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={x(0) - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">
                {t * 100}%
              </text>
              <text x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle" className="fill-ink-soft text-[11px]">
                {t * 100}%
              </text>
            </g>
          ))}
          <text x={(x(0) + x(MAX)) / 2} y={H - 8} textAnchor="middle" className="fill-ink-soft text-[12px]">
            Predicted chance of cancelling
          </text>
          <text transform={`translate(14 ${(y(0) + y(MAX)) / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-soft text-[12px]">
            Share that actually cancelled
          </text>
          <line x1={x(0)} y1={y(0)} x2={x(MAX)} y2={y(MAX)} stroke="var(--color-ink-soft)" strokeWidth="1.5" strokeDasharray="4 4" />
          {/* Drawn last = on top: the calibrated series the prices use. */}
          {[...SERIES].reverse().map((s) => (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                points={data[s.key].map((b) => `${x(b.mean_predicted)},${y(b.observed_rate)}`).join(" ")}
              />
              {data[s.key].map((b, i) => {
                const cx = x(b.mean_predicted);
                const cy = y(b.observed_rate);
                const active = hover?.series.key === s.key && hover.i === i;
                return (
                  <g key={i} onMouseEnter={() => setHover({ series: s, bin: b, i })} onMouseLeave={() => setHover(null)}>
                    <circle cx={cx} cy={cy} r="14" fill="transparent" />
                    {s.shape === "circle" ? (
                      <circle cx={cx} cy={cy} r={active ? 6 : 4.5} fill={s.color} stroke="var(--color-paper)" strokeWidth="2" />
                    ) : (
                      <rect x={cx - (active ? 6 : 4.5)} y={cy - (active ? 6 : 4.5)} width={active ? 12 : 9} height={active ? 12 : 9} rx="1.5" fill={s.color} stroke="var(--color-paper)" strokeWidth="2" />
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-card)]"
            style={{ left: `${(x(hover.bin.mean_predicted) / W) * 100}%`, top: `${(y(hover.bin.observed_rate) / H) * 100 - 3}%` }}
          >
            <p className="font-semibold text-ink">
              {hover.series.label}, group {hover.i + 1} of 10
            </p>
            <p className="text-ink-soft">Predicted {pct(hover.bin.mean_predicted)} · observed {pct(hover.bin.observed_rate)}</p>
            <p className="text-ink-soft">{hover.bin.count.toLocaleString("en-US")} bookings</p>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-wine">Show the numbers</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-xs text-ink-soft">
              <th scope="col" className="py-1 font-medium">Group (~3,630 bookings)</th>
              <th scope="col" className="py-1 font-medium">Uncalibrated: predicted / observed</th>
              <th scope="col" className="py-1 font-medium">Platt: predicted / observed</th>
            </tr>
          </thead>
          <tbody>
            {after.map((b, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">{i + 1}</td>
                <td className="py-1">
                  {before[i] ? `${pct(before[i].mean_predicted)} / ${pct(before[i].observed_rate)}` : "—"}
                </td>
                <td className="py-1">
                  {pct(b.mean_predicted)} / {pct(b.observed_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
