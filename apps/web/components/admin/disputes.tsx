"use client";

import { splitResolve } from "@stumari/core";
import { Gavel } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorNote, usdc } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { formatHotelDate } from "@/lib/bookings/terms";
import { apiPost } from "@/lib/client/api";
import type { OperatorBooking } from "@/lib/dashboard/bookings";
import { shortAddress } from "@/lib/format";

/**
 * Disputes (ADR-0006: a single admin key is the arbiter — a disclosed stub). The slider sets the
 * guest's share in bps; the split shown is `splitResolve`, the same math as `resolve_dispute`.
 */
export function Disputes({ items }: { items: OperatorBooking[] }) {
  if (items.length === 0) return <Empty>No open disputes.</Empty>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Arbiter: a single Stumari admin key (disclosed stub; a multisig of bonded arbiters is on the roadmap). Escrow can only go to this
        guest, this hotel&apos;s snapshotted payout wallet, or the fee treasury.
      </p>
      {items.map((b) => (
        <DisputeCard key={b.id} b={b} />
      ))}
    </div>
  );
}

function DisputeCard({ b }: { b: OperatorBooking }) {
  const { run, busy, error } = useAction();
  const [guestBps, setGuestBps] = useState(5_000);
  const split = splitResolve({ amount: BigInt(b.amount_minor), feeBps: b.fee_bps ?? 0, guestBps });

  function resolve() {
    const text = `Resolve: ${usdc(split.refund)} to the guest, ${usdc(split.hotelNet)} to the hotel${split.fee > 0n ? `, ${usdc(split.fee)} fee` : ""}? This is final.`;
    if (window.confirm(text)) void run("resolve", () => apiPost(`/api/admin/bookings/${b.id}/resolve`, { guest_bps: guestBps }));
  }

  return (
    <article className="card space-y-4 p-5" aria-label={`Dispute on booking ${b.id}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-sans text-lg font-semibold">{b.hotel.name}</h3>
          <p className="text-sm text-ink-soft">
            {b.room_type} <span className="font-mono">{b.unit}</span> · {formatHotelDate(b.checkin_date)} → {formatHotelDate(b.checkout_date)} ·{" "}
            {b.guest.name ?? "Guest"} {b.guest.email ? `(${b.guest.email})` : ""} · <span className="font-mono">{shortAddress(b.guest.wallet)}</span>
          </p>
        </div>
        <p className="font-mono text-lg font-semibold">{usdc(b.amount_minor)}</p>
      </div>
      <label className="block text-sm font-medium">
        Guest&apos;s share: {(guestBps / 100).toFixed(2)}% ({guestBps} bps)
        <input
          type="range"
          min={0}
          max={10_000}
          step={50}
          value={guestBps}
          onChange={(e) => setGuestBps(Number(e.target.value))}
          className="mt-2 w-full accent-wine"
        />
      </label>
      <dl className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-xl bg-sand/70 p-3">
          <dt className="text-ink-soft">Refund to guest</dt>
          <dd className="font-mono font-semibold">{usdc(split.refund)}</dd>
        </div>
        <div className="rounded-xl bg-vine-soft p-3">
          <dt className="text-ink-soft">To the hotel</dt>
          <dd className="font-mono font-semibold">{usdc(split.hotelNet)}</dd>
        </div>
        <div className="rounded-xl bg-sand/70 p-3">
          <dt className="text-ink-soft">Fee ({b.fee_bps ?? 0} bps)</dt>
          <dd className="font-mono font-semibold">{usdc(split.fee)}</dd>
        </div>
      </dl>
      <button type="button" onClick={resolve} disabled={busy !== null} className="btn btn-primary disabled:opacity-60">
        <Gavel aria-hidden="true" className="size-4" />
        {busy ? "Resolving on Solana…" : "Resolve dispute"}
      </button>
      <ErrorNote error={error} />
    </article>
  );
}
