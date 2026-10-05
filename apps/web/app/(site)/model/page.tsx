import { WINDOW_LABELS } from "@stumari/core";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ReliabilityChart } from "@/components/model/reliability-chart";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { modelReport as r } from "@/lib/model-report";

export const metadata: Metadata = {
  title: "How pricing works",
  description:
    "How Stumari's cancellation model prices each contract, how well it is calibrated on 36,294 held-out bookings, and its honest limitations.",
  alternates: { canonical: "/model" },
};

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const num = (v: number) => v.toLocaleString("en-US");

function Stat({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="card p-5">
      <p className="font-display text-3xl font-semibold tracking-tight text-brand tabular-nums">{value}</p>
      <p className="mt-1 font-semibold">{label}</p>
      <p className="mt-1 text-sm text-ink-soft">{detail}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ModelPage() {
  const dict = getDictionary("en");
  const t = r.test;
  const worst = t.windows.reduce((a, b) => (Math.abs(Math.log(b.ratio)) > Math.abs(Math.log(a.ratio)) ? b : a));
  return (
    <>
      <SiteHeader locale="en" nav={dict.nav} />
      <main id="main" className="mx-auto max-w-4xl space-y-14 px-4 py-14 sm:px-6">
        <header className="space-y-4">
          <p className="eyebrow">How pricing works</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">A calibrated model writes each contract</h1>
          <p className="text-lg leading-relaxed text-ink-soft">
            For every request, a time-to-cancel model estimates how likely the booking is to be cancelled in each window
            before check-in. Each cancellation contract is then priced so the hotel expects the same revenue from this guest
            as under its usual policy. Here is how that works, how well the model does on bookings it never saw, and where
            it falls short.
          </p>
        </header>

        <Section id="how-title" title="From a request to a price">
          <ol className="list-decimal space-y-3 pl-5 leading-relaxed text-ink-soft marker:font-semibold marker:text-brand">
            <li>
              <span className="text-ink">Hazard per window.</span> A gradient-boosted model scores six windows before check-in
              (30+ days, 14–30, 7–14, 3–7, 1–3, last day) from what is known at quote time: lead time, dates, nights, party
              size, meal plan, hotel type and — if a wallet is connected — how many stays it completed before.
            </li>
            <li>
              <span className="text-ink">Chance of cancelling in each window (q).</span> The hazards combine into q for each
              window and P(cancel) for the booking.
            </li>
            <li>
              <span className="text-ink">Risk cost of a contract.</span> For each window: q × (refund the contract pays − the
              chance the hotel resells the freed night), never below zero. A cancellation that refunds nothing earns the
              hotel no credit.
            </li>
            <li>
              <span className="text-ink">Price.</span> The hotel&rsquo;s usual contract costs its base rate. Any other contract
              costs base × (1 − usual risk) ÷ (1 − its risk), within the hotel&rsquo;s bounds, rounded up to a cent. More
              refund costs more; less refund costs less.
            </li>
          </ol>
          <p className="text-sm text-ink-soft">
            Every quote carries this breakdown: open &ldquo;Why this price&rdquo; next to any option at checkout. The prices
            and refund schedule are signed and written into the booking&rsquo;s escrow on Solana; the probabilities are not.
          </p>
        </Section>

        <Section id="metrics-title" title="How good is it?">
          <p className="leading-relaxed text-ink-soft">
            Model {r.version}: {r.training.trees} trees trained on {num(r.training.trainBookings)} bookings, evaluated on{" "}
            {num(t.bookings)} held-out bookings arriving January–August 2017 (Hotel Booking Demand dataset). {pct(t.cancelRate)} of
            them cancelled; the model predicted {pct(t.meanPCancel)} on average.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat value={t.auc.toFixed(3)} label="Ranking (AUC)" detail={`vs ${t.aucLeadTimeOnly.toFixed(3)} ranking by lead time alone. Modest, but clearly better than the strongest rule of thumb.`} />
            <Stat value={t.brier.toFixed(4)} label="Brier score" detail={`vs ${t.brierBaseRate.toFixed(4)} for always predicting the true cancel rate (lower is better).`} />
            <Stat value={t.ece.toFixed(3)} label="Calibration error" detail={`Average gap between predicted and observed rates across ten groups (${t.eceUncalibrated.toFixed(3)} before calibration).`} />
          </div>
        </Section>

        <Section id="calibration-title" title="Calibration: do the probabilities mean what they say?">
          <p className="leading-relaxed text-ink-soft">
            Held-out bookings sorted by predicted P(cancel) into ten equal groups. A well-calibrated model sits on the dashed
            line: of bookings given a 30% chance, about 30% cancel.
          </p>
          <div className="card p-4 sm:p-6">
            <ReliabilityChart before={r.reliability.before} after={r.reliability.after} />
          </div>
          <div className="rounded-2xl bg-surface px-5 py-4 text-sm leading-relaxed text-ink-soft">
            <p className="font-semibold text-ink">Why Platt scaling and not isotonic regression</p>
            <p className="mt-1">
              Isotonic regression calibrates slightly better on paper (error {t.isotonic.ece.toFixed(3)} vs {t.ece.toFixed(3)})
              but it is a step function: nearby requests would share identical prices and prices would jump at step edges. Platt
              scaling is smooth and strictly increasing, so a slightly riskier request always costs slightly more. We accept
              the small, disclosed calibration cost (isotonic also ranks worse here: AUC {t.isotonic.auc.toFixed(3)}).
            </p>
          </div>
        </Section>

        <Section id="windows-title" title="Per-window accuracy">
          <p className="leading-relaxed text-ink-soft">
            Prices use the per-window chances, so this is where drift matters. Mean predicted vs observed chance of cancelling
            in each window, on the same held-out bookings:
          </p>
          <div className="card overflow-x-auto p-2">
            <table className="w-full text-left text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-ink-soft">
                  <th scope="col" className="px-3 py-2 font-medium">Before check-in</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Predicted</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Observed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Predicted ÷ observed</th>
                </tr>
              </thead>
              <tbody>
                {t.windows.map((w) => (
                  <tr key={w.window} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 font-normal">
                      {WINDOW_LABELS[w.window]}
                    </th>
                    <td className="px-3 py-2 text-right">{pct(w.predicted_q, 2)}</td>
                    <td className="px-3 py-2 text-right">{pct(w.observed_q, 2)}</td>
                    <td className={`px-3 py-2 text-right ${w === worst ? "font-semibold text-danger" : ""}`}>{w.ratio.toFixed(2)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="limits-title" title="Honest limitations">
          <ul className="list-disc space-y-3 pl-5 leading-relaxed text-ink-soft">
            <li>
              <span className="text-ink">It is a prior from elsewhere.</span> The model learned from two Portuguese hotels in
              2015–2017. Tbilisi guesthouses in 2026 differ in guests, seasons and channels. Every hotel shares this prior during
              the pilot and tunes it only through its own settings; recalibrating on each hotel&rsquo;s own outcomes (recorded
              on-chain) is on the roadmap.
            </li>
            <li>
              <span className="text-ink">Timing drift.</span> Cancellations moved between windows from 2016 to 2017: the{" "}
              {WINDOW_LABELS[worst.window]} window is over-predicted {worst.ratio.toFixed(2)}× on 2017 arrivals, while overall
              P(cancel) stays close because errors partly offset. Per-hotel recalibration corrects exactly this.
            </li>
            <li>
              <span className="text-ink">Request-time information only.</span> No price, nationality or deposit features, and
              wallet history can only lower a guest&rsquo;s estimated risk, never raise it.
            </li>
            <li>
              <span className="text-ink">AI agents are priced as direct bookers.</span> An agent booking for its own user is
              treated like a direct booking rather than an online travel agency.
            </li>
            <li>
              <span className="text-ink">Prices target, not guarantee, revenue.</span> Each option is priced to target the same
              expected revenue as the hotel&rsquo;s usual policy; actual revenue depends on who really cancels.
            </li>
          </ul>
          <p className="text-sm text-ink-soft">
            Full report and reproduction steps: <code className="rounded bg-surface px-1.5 py-0.5">ml/reports/metrics.md</code> in
            the Stumari repository. <Link href="/" className="font-medium text-brand underline underline-offset-2">Back to Stumari</Link>
          </p>
        </Section>
      </main>
      <SiteFooter locale="en" footer={dict.footer} />
    </>
  );
}
