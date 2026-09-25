"use client";

import { TEMPLATES, isTemplateId } from "@stumari/core";
import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { useWallet } from "@/components/wallet/wallet-provider";
import { apiGet, errorMessage } from "@/lib/client/api";
import { formatHotelDate } from "@/lib/bookings/terms";
import type { PublicBookingView } from "@/lib/bookings/view";
import { formatUsdc } from "@/lib/money";

const STATUS_LABEL: Record<PublicBookingView["status"], string> = {
  awaiting_signature: "Waiting for payment",
  pending: "Confirming",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  released: "Completed",
  disputed: "Disputed",
  resolved: "Dispute resolved",
  voided: "Refunded (not confirmed)",
  failed: "Failed",
};

/** "Find my bookings": the connected wallet's bookings (public data; no sign-in needed). */
export function MyBookings() {
  const { connected, openPicker } = useWallet();
  const [result, setResult] = useState<{ wallet: string; bookings: PublicBookingView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    apiGet<PublicBookingView[]>(`/api/wallets/${connected.address}/bookings`)
      .then((bookings) => !cancelled && setResult({ wallet: connected.address, bookings }))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [connected]);

  if (!connected) {
    return (
      <div className="card flex flex-col items-start gap-4 p-6">
        <p className="text-ink-soft">Connect the wallet you paid with to see your bookings.</p>
        <button type="button" onClick={openPicker} className="btn btn-primary">
          <Wallet aria-hidden="true" className="size-4" />
          Connect wallet
        </button>
      </div>
    );
  }
  if (error) return <p className="text-clay">{error}</p>;
  const bookings = result?.wallet === connected.address ? result.bookings : null;
  if (!bookings) return <p className="text-ink-soft">Looking up bookings for {shortAddress(connected.address)}…</p>;
  if (bookings.length === 0) return <p className="text-ink-soft">No bookings for {shortAddress(connected.address)} yet.</p>;

  return (
    <ul className="space-y-3">
      {bookings.map((b) => (
        <li key={b.id}>
          <Link href={`/b/${b.id}`} className="card flex items-center gap-4 p-5 transition-colors hover:border-ink-soft">
            <div className="flex-1">
              <p className="font-semibold">
                {b.room_type.name} · {b.hotel.name}
              </p>
              <p className="text-sm text-ink-soft">
                {formatHotelDate(b.checkin_date)} → {formatHotelDate(b.checkout_date)} · {isTemplateId(b.option_id) ? TEMPLATES[b.option_id].name : b.option_id} ·{" "}
                {formatUsdc(BigInt(b.amount_minor))} USDC
              </p>
            </div>
            <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold">{STATUS_LABEL[b.status]}</span>
            <ArrowRight aria-hidden="true" className="size-4 text-ink-soft" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
