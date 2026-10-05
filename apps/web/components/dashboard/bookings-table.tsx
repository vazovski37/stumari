"use client";

import { splitRelease } from "@stumari/core";
import { AlertTriangle, Banknote, CheckCircle2, ExternalLink, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNote, StatusBadge, usdc } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { formatHotelDate } from "@/lib/bookings/terms";
import type { BookingStatus } from "@/lib/bookings/view";
import { apiPost } from "@/lib/client/api";
import type { OperatorBooking } from "@/lib/dashboard/bookings";
import { shortAddress } from "@/lib/format";

const FILTERS: { label: string; statuses: BookingStatus[] | null }[] = [
  { label: "All", statuses: null },
  { label: "Needs confirming", statuses: ["pending"] },
  { label: "Confirmed", statuses: ["confirmed"] },
  { label: "Disputed", statuses: ["disputed"] },
  { label: "Closed", statuses: ["cancelled", "released", "resolved", "voided"] },
];

/** What the hotel receives: the settled amount once closed, else the release share (fee snapshot). */
function payout(b: OperatorBooking): { minor: string; final: boolean } {
  if (b.settled) return { minor: b.settled.hotel_minor, final: true };
  return { minor: splitRelease({ amount: BigInt(b.amount_minor), feeBps: b.fee_bps ?? 0 }).hotelNet.toString(), final: false };
}

/**
 * Bookings with guest contact (visible to the hotel and admin only). Actions post to
 * `{actionsBase}/{id}/{confirm|void|release}`; `admin` adds void and release. `now` comes from the
 * server render (the server re-checks every action against the chain clock).
 */
export function BookingsTable({
  bookings,
  now,
  actionsBase,
  admin = false,
}: {
  bookings: OperatorBooking[];
  now: number;
  actionsBase: string;
  admin?: boolean;
}) {
  const [filter, setFilter] = useState(0);
  const { run, busy, error } = useAction();
  const statuses = FILTERS[filter]!.statuses;
  const shown = statuses ? bookings.filter((b) => statuses.includes(b.status)) : bookings;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Filter bookings" className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            type="button"
            role="tab"
            aria-selected={i === filter}
            onClick={() => setFilter(i)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${i === filter ? "border-brand bg-brand text-paper" : "border-line text-ink-soft hover:border-ink-soft"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {shown.length === 0 ? (
        <Empty>No bookings here yet.</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">Guest</th>
                <th className="px-3 py-2 font-semibold">Stay</th>
                <th className="px-3 py-2 font-semibold">Contract</th>
                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                <th className="px-3 py-2 text-right font-semibold">To the hotel</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {shown.map((b) => {
                const p = payout(b);
                const canConfirm = b.status === "pending" && b.confirm_deadline_ts !== null && now < b.confirm_deadline_ts;
                const canRelease = admin && b.status === "confirmed" && b.release_after_ts !== null && now >= b.release_after_ts;
                const act = (action: "confirm" | "void" | "release") => run(`${action}:${b.id}`, () => apiPost(`${actionsBase}/${b.id}/${action}`, {}));
                return (
                  <tr key={b.id} className="align-top">
                    <td className="px-3 py-3">
                      <span className="block font-medium">{b.guest.name ?? "Guest"}</span>
                      {b.guest.email && (
                        <a href={`mailto:${b.guest.email}`} className="block text-brand hover:underline">
                          {b.guest.email}
                        </a>
                      )}
                      {b.guest.phone && <span className="block text-ink-soft">{b.guest.phone}</span>}
                      <span className="block font-mono text-xs text-ink-soft" title={b.guest.wallet}>
                        {shortAddress(b.guest.wallet)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {admin && <span className="block font-medium">{b.hotel.name}</span>}
                      <span className="block">
                        {b.room_type} · <span className="font-mono">{b.unit}</span>
                      </span>
                      <span className="block text-ink-soft">
                        {formatHotelDate(b.checkin_date)} → {formatHotelDate(b.checkout_date)}
                      </span>
                    </td>
                    <td className="px-3 py-3 capitalize">{b.option_id}</td>
                    <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{usdc(b.amount_minor)}</td>
                    <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                      {usdc(p.minor)}
                      {!p.final && <span className="block font-sans text-xs text-ink-soft">in escrow</span>}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={b.status} />
                      {b.conflict && b.status === "pending" && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
                          <AlertTriangle aria-hidden="true" className="size-3.5" /> Calendar conflict
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-end gap-2">
                        {canConfirm && (
                          <button type="button" disabled={busy !== null} onClick={() => act("confirm")} className="btn btn-primary !px-3 !py-1.5 text-sm disabled:opacity-60">
                            <CheckCircle2 aria-hidden="true" className="size-4" />
                            {busy === `confirm:${b.id}` ? "Confirming…" : "Confirm"}
                          </button>
                        )}
                        {admin && b.status === "pending" && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => window.confirm("Void this booking? The guest gets a full refund.") && act("void")}
                            className="btn btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-60"
                          >
                            <Undo2 aria-hidden="true" className="size-4" />
                            {busy === `void:${b.id}` ? "Voiding…" : "Void (refund)"}
                          </button>
                        )}
                        {canRelease && (
                          <button type="button" disabled={busy !== null} onClick={() => act("release")} className="btn btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-60">
                            <Banknote aria-hidden="true" className="size-4" />
                            {busy === `release:${b.id}` ? "Releasing…" : "Release"}
                          </button>
                        )}
                        <Link href={`/b/${b.id}`} className="inline-flex items-center gap-1 text-sm text-brand hover:underline" target="_blank">
                          Booking page <ExternalLink aria-hidden="true" className="size-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
