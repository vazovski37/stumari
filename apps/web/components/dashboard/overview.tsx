import { AlertTriangle, CalendarClock, Landmark, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, StatusBadge, usdc } from "@/components/operator/ui";
import { formatHotelDate } from "@/lib/bookings/terms";
import type { HotelOverview } from "@/lib/dashboard/bookings";

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="card flex gap-4 p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand text-wine">{icon}</span>
      <div>
        <p className="text-sm text-ink-soft">{label}</p>
        <p className="font-display text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-ink-soft">{note}</p>
      </div>
    </div>
  );
}

/** Stat tiles, calendar conflicts and the next arrivals. */
export function Overview({ overview }: { overview: HotelOverview }) {
  const { counts, payouts, upcoming, conflicts } = overview;
  const attention = conflicts.length + (counts.disputed ?? 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<CalendarClock aria-hidden="true" className="size-5" />}
          label="Upcoming arrivals"
          value={String(upcoming.length)}
          note={`${counts.pending ?? 0} awaiting confirmation`}
        />
        <Stat icon={<Lock aria-hidden="true" className="size-5" />} label="In escrow for you" value={usdc(payouts.pending_minor)} note="Released after check-in unless the guest disputes" />
        <Stat icon={<Landmark aria-hidden="true" className="size-5" />} label="Paid out to your wallet" value={usdc(payouts.released_minor)} note={`${(counts.released ?? 0) + (counts.resolved ?? 0)} stays settled`} />
        <Stat
          icon={<AlertTriangle aria-hidden="true" className="size-5" />}
          label="Needs attention"
          value={String(attention)}
          note={payouts.disputed_minor !== "0" ? `${usdc(payouts.disputed_minor)} disputed` : "Conflicts and disputes"}
        />
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="space-y-2 rounded-[var(--radius-card)] border border-clay/40 bg-clay/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-clay">
            <AlertTriangle aria-hidden="true" className="size-5" /> Calendar conflicts
          </p>
          <p className="text-sm text-ink-soft">
            These bookings overlap a block or another booking on the same unit, so they were not confirmed automatically. If you have
            moved the other guest, confirm below before the deadline; otherwise Stumari voids the booking and the guest is refunded in full.
          </p>
          <ul className="text-sm">
            {conflicts.map((b) => (
              <li key={b.id}>
                {b.guest.name ?? "Guest"} · {b.room_type} <span className="font-mono">{b.unit}</span> · {formatHotelDate(b.checkin_date)} →{" "}
                {formatHotelDate(b.checkout_date)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5">
        <h3 className="mb-3 font-sans text-base font-semibold">Next arrivals</h3>
        {upcoming.length === 0 ? (
          <Empty>No upcoming stays booked through Stumari.</Empty>
        ) : (
          <ul className="divide-y divide-line/70 text-sm">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-32 font-medium">{formatHotelDate(b.checkin_date)}</span>
                <span className="flex-1">
                  {b.guest.name ?? "Guest"} · {b.room_type} <span className="font-mono">{b.unit}</span> · until {formatHotelDate(b.checkout_date)}
                </span>
                <span className="font-mono">{usdc(b.amount_minor)}</span>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
