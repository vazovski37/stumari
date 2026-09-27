"use client";

import { TEMPLATES, isTemplateId } from "@stumari/core";
import { CheckCircle2, CircleDashed, ExternalLink, Flag, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { RefundTimeline } from "@/components/checkout/refund-timeline";
import { useWallet } from "@/components/wallet/wallet-provider";
import { apiGet, apiPost, ClientApiError, errorMessage } from "@/lib/client/api";
import type { PublicBookingView } from "@/lib/bookings/view";
import { formatHotelDate, formatHotelTime } from "@/lib/bookings/terms";
import { shortAddress } from "@/lib/format";
import { formatUsdc } from "@/lib/money";
import { refundDroppedTo } from "./cancel-guard";

type Action = "cancel" | "dispute" | "void";
type BookingTx = { tx: string; refund_minor?: string };

const STATUS: Record<PublicBookingView["status"], { label: string; tone: string }> = {
  awaiting_signature: { label: "Waiting for payment", tone: "bg-amber-soft text-wine-deep" },
  pending: { label: "Paid · confirming with the hotel", tone: "bg-amber-soft text-wine-deep" },
  confirmed: { label: "Confirmed", tone: "bg-vine-soft text-vine" },
  cancelled: { label: "Cancelled", tone: "bg-sand text-ink" },
  released: { label: "Completed · paid to the hotel", tone: "bg-vine-soft text-vine" },
  disputed: { label: "Disputed · awaiting the arbiter", tone: "bg-amber-soft text-wine-deep" },
  resolved: { label: "Dispute resolved", tone: "bg-sand text-ink" },
  voided: { label: "Not confirmed · fully refunded", tone: "bg-sand text-ink" },
  failed: { label: "Payment did not go through", tone: "bg-clay/10 text-clay" },
};

const pollMs = (s: PublicBookingView["status"]) =>
  s === "awaiting_signature" || s === "pending" ? 3_000 : s === "confirmed" || s === "disputed" ? 15_000 : null;

const usdc = (minor: string) => `${formatUsdc(BigInt(minor))} USDC`;

/**
 * `initialNow` is the chain clock the server built the view at (`initial.now`), so hydration sees
 * the same clock and the refund schedule is timed like the program, not by the browser.
 */
export function BookingPanel({ initial, initialNow }: { initial: PublicBookingView; initialNow: number }) {
  const wallet = useWallet();
  const [view, setView] = useState(initial);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);

  const reload = useCallback(async () => {
    try {
      const next = await apiGet<PublicBookingView>(`/api/bookings/${initial.id}`);
      setView(next);
      setNow(next.now);
    } catch {
      // Keep the last view and clock; the next poll retries.
    }
  }, [initial.id]);

  useEffect(() => {
    const interval = pollMs(view.status);
    if (interval === null) return;
    const t = setInterval(reload, interval);
    return () => clearInterval(t);
  }, [view.status, reload]);

  async function act(action: Action) {
    setError(null);
    try {
      const payer = await wallet.requireWallet();
      setBusy("Preparing the transaction…");
      const built = await apiPost<BookingTx>(`/api/bookings/${view.id}/tx`, { action, wallet: payer.address });
      const dropped = action === "cancel" ? refundDroppedTo(view.refund_if_cancel_now_minor, built.refund_minor) : null;
      if (dropped !== null) {
        // A refund step passed since the page was loaded: never sign for less than was shown.
        setView((v) => ({ ...v, refund_if_cancel_now_minor: dropped }));
        setError(`A refund step has just passed: cancelling now refunds ${usdc(dropped)}. Confirm again if you still want to cancel.`);
        return;
      }
      setBusy("Approve in your wallet…");
      const result = await payer.submit(built.tx, view.id, () => setBusy("Confirming on Solana…"));
      if (result.booking) {
        setView(result.booking);
        setNow(result.booking.now);
      } else await reload();
      setConfirming(null);
    } catch (e) {
      if (e instanceof Error && e.message === "No wallet selected") return;
      setError(
        e instanceof ClientApiError && e.code === "WALLET_MISMATCH"
          ? `Connect the wallet that paid for this booking${wallet.connected ? ` (not ${shortAddress(wallet.connected.address)})` : ""}.`
          : errorMessage(e),
      );
    } finally {
      setBusy(null);
    }
  }

  const tz = view.hotel.timezone;
  const at = (ts: number) => formatHotelTime(ts, tz);
  const option = isTemplateId(view.option_id) ? TEMPLATES[view.option_id].name : view.option_id;
  const status = STATUS[view.status];
  const actions: { key: Action; show: boolean; label: string; icon: typeof Undo2; confirm: string }[] = [
    {
      key: "cancel",
      show: view.can_cancel,
      label: "Cancel booking",
      icon: Undo2,
      confirm:
        view.refund_if_cancel_now_minor === null
          ? "Cancel this booking?"
          : view.refund_if_cancel_now_minor === view.amount_minor
            ? `You get all ${usdc(view.amount_minor)} back now. This cannot be undone.`
            : view.status === "pending"
              ? `You get at least ${usdc(view.refund_if_cancel_now_minor)} back, and all ${usdc(view.amount_minor)} if the hotel has not confirmed when your cancel lands. This cannot be undone.`
              : `You get ${usdc(view.refund_if_cancel_now_minor)} back now; the rest goes to the hotel. This cannot be undone.`,
    },
    {
      key: "dispute",
      show: view.can_dispute,
      label: "Report a problem",
      icon: Flag,
      confirm: "Opening a dispute holds the payment until Stumari's arbiter decides how to split it. Use it if the room was not provided as booked.",
    },
    {
      key: "void",
      show: view.can_void,
      label: "Take a full refund",
      icon: RotateCcw,
      confirm: `The hotel did not confirm in time, so you can take back all ${usdc(view.amount_minor)}.`,
    },
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="eyebrow">Booking {view.id.slice(0, 8)}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {view.room_type.name} at {view.hotel.name}
          </h1>
          <p className="text-ink-soft">
            {at(view.checkin_ts)} → {formatHotelDate(view.checkout_date)} · {option} terms · {usdc(view.amount_minor)}
          </p>
          <p className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`} aria-live="polite">
            {status.label}
          </p>
        </header>

        <section aria-labelledby="progress-title" className="card p-5 sm:p-6">
          <h2 id="progress-title" className="font-sans text-lg font-semibold">
            Progress
          </h2>
          <Timeline view={view} now={now} at={at} />
        </section>

        <section aria-labelledby="terms-title" className="card space-y-4 p-5 sm:p-6">
          <h2 id="terms-title" className="font-sans text-lg font-semibold">
            Your cancellation terms
          </h2>
          {view.can_cancel && (
            <RefundTimeline tiers={view.terms.tiers} checkinTs={view.checkin_ts} now={now} timeZone={tz} label="Refund schedule" />
          )}
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {view.terms.text.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card space-y-4 p-5">
          {view.refund_if_cancel_now_minor !== null && (
            <div className="rounded-2xl bg-sand px-4 py-3">
              <p className="text-xs font-medium text-ink-soft">
                {view.status === "pending" ? "Guaranteed refund if you cancel now" : "Refund if you cancel now"}
              </p>
              <p className="font-display text-2xl font-semibold tabular-nums">{usdc(view.refund_if_cancel_now_minor)}</p>
              {view.status === "pending" && view.refund_if_cancel_now_minor !== view.amount_minor && (
                <p className="mt-1 text-xs text-ink-soft">
                  All {usdc(view.amount_minor)} if the hotel has not confirmed yet when your cancel lands.
                </p>
              )}
            </div>
          )}
          {view.settled && (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Refunded to you</dt>
                <dd className="font-semibold tabular-nums">{usdc(view.settled.refund_minor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Paid to the hotel</dt>
                <dd className="tabular-nums">{usdc(view.settled.hotel_minor)}</dd>
              </div>
              {view.settled.fee_minor !== "0" && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Stumari fee</dt>
                  <dd className="tabular-nums">{usdc(view.settled.fee_minor)}</dd>
                </div>
              )}
            </dl>
          )}
          {actions
            .filter((a) => a.show)
            .map((a) =>
              confirming === a.key ? (
                <div key={a.key} className="space-y-3 rounded-2xl border border-line p-4">
                  <p className="text-sm">{a.confirm}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => act(a.key)} disabled={busy !== null} className="btn btn-primary flex-1 !px-3 !py-2 text-sm disabled:opacity-60">
                      {busy ?? `Yes, ${a.label.toLowerCase()}`}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} disabled={busy !== null} className="btn btn-secondary !px-3 !py-2 text-sm">
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <button key={a.key} type="button" onClick={() => setConfirming(a.key)} className="btn btn-secondary w-full">
                  <a.icon aria-hidden="true" className="size-4" />
                  {a.label}
                </button>
              ),
            )}
          {error && (
            <p role="alert" className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">
              {error}
            </p>
          )}
          {!view.can_cancel && !view.can_dispute && !view.can_void && !view.settled && (
            <p className="text-sm text-ink-soft">No action is needed from you right now.</p>
          )}
        </div>
        <div className="card space-y-2 p-5 text-sm">
          <h2 className="font-sans font-semibold">On-chain record</h2>
          <ExplorerLink href={view.explorer.booking}>Booking escrow account</ExplorerLink>
          {view.explorer.create_tx && <ExplorerLink href={view.explorer.create_tx}>Payment transaction</ExplorerLink>}
          {view.explorer.exit_tx && <ExplorerLink href={view.explorer.exit_tx}>Final transaction</ExplorerLink>}
          <p className="pt-1 text-xs text-ink-soft">
            {view.hotel.name}
            {view.hotel.address ? ` · ${view.hotel.address}` : ""}
            {view.hotel.phone ? ` · ${view.hotel.phone}` : ""}
          </p>
        </div>
      </aside>
    </div>
  );
}

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-wine underline underline-offset-2">
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
}

type Step = { label: string; detail: string; state: "done" | "current" | "todo" | "stopped" };

function Timeline({ view, now, at }: { view: PublicBookingView; now: number; at: (ts: number) => string }) {
  const s = view.status;
  const paid = s !== "awaiting_signature" && s !== "failed";
  const confirmedOrLater = ["confirmed", "released", "disputed", "resolved"].includes(s);
  const steps: Step[] = [
    {
      label: "Paid into escrow",
      detail: paid ? usdc(view.amount_minor) : s === "failed" ? "The payment never landed; nothing was charged." : "Waiting for the payment to land…",
      state: paid ? "done" : s === "failed" ? "stopped" : "current",
    },
  ];
  if (s === "voided") {
    steps.push({ label: "Not confirmed in time", detail: "Full refund sent to your wallet.", state: "stopped" });
  } else if (s === "cancelled") {
    steps.push({ label: "Cancelled by you", detail: view.settled ? `${usdc(view.settled.refund_minor)} refunded by your terms.` : "Refunded by your terms.", state: "stopped" });
  } else if (paid) {
    steps.push({
      label: "Confirmed by the hotel",
      detail: confirmedOrLater
        ? "The room is yours."
        : `The hotel is checking the room is free${view.confirm_deadline_ts ? `. If it is not confirmed by ${at(view.confirm_deadline_ts)}, you get a full refund` : ""}.`,
      state: confirmedOrLater ? "done" : "current",
    });
    steps.push({
      label: "Check-in",
      detail: at(view.checkin_ts),
      state: now >= view.checkin_ts && confirmedOrLater ? "done" : "todo",
    });
    if (s === "disputed" || s === "resolved") {
      steps.push({
        label: s === "disputed" ? "Dispute open" : "Dispute resolved",
        detail: s === "resolved" && view.settled ? `${usdc(view.settled.refund_minor)} refunded, the rest paid to the hotel.` : "Stumari's arbiter will decide how the escrow is split.",
        state: s === "disputed" ? "current" : "stopped",
      });
    } else {
      steps.push({
        label: "Paid to the hotel",
        detail: view.release_after_ts ? `${s === "released" ? "Released" : "Scheduled"} ${at(view.release_after_ts)}, unless you report a problem before then.` : "After check-in.",
        state: s === "released" ? "done" : "todo",
      });
    }
  }
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((step, i) => {
        const Icon = step.state === "done" ? CheckCircle2 : step.state === "stopped" ? XCircle : CircleDashed;
        const color = step.state === "done" ? "text-vine" : step.state === "current" ? "text-amber" : step.state === "stopped" ? "text-clay" : "text-line";
        return (
          <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-6 left-[11px] h-[calc(100%-1.25rem)] w-px bg-line" />}
            <Icon aria-hidden="true" className={`relative size-6 shrink-0 ${color} ${step.state === "current" ? "motion-safe:animate-pulse" : ""}`} />
            <div className="text-sm">
              <p className="font-semibold">{step.label}</p>
              <p className="text-ink-soft">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
