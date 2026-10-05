"use client";

import { ArrowRight, Building2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, ErrorNote, Pill } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { formatHotelTime } from "@/lib/bookings/terms";
import { apiPatch, apiPost } from "@/lib/client/api";
import { applicationStatuses } from "@/lib/application-fields";
import type { applications } from "@/lib/db/schema";

export type ApplicationItem = typeof applications.$inferSelect & { hotel_id: string | null };

const yesNo = (v: boolean | null) => (v === null ? "not sure" : v ? "yes" : "no");

/** The pilot pipeline: status + notes per application, and "convert" into a draft hotel. */
export function ApplicationsList({ items }: { items: ApplicationItem[] }) {
  if (items.length === 0) return <Empty>No applications yet. They arrive from the Apply and Book a demo forms on the landing page.</Empty>;
  return (
    <ul className="space-y-4">
      {items.map((a) => (
        <ApplicationCard key={a.id} a={a} />
      ))}
    </ul>
  );
}

function ApplicationCard({ a }: { a: ApplicationItem }) {
  const router = useRouter();
  const { run, busy, error } = useAction();
  const [status, setStatus] = useState(a.status);
  const [notes, setNotes] = useState(a.notes ?? "");
  const dirty = status !== a.status || notes !== (a.notes ?? "");

  async function convert() {
    const hotel = await run("convert", () => apiPost<{ id: string }>(`/api/admin/applications/${a.id}/convert`, {}));
    if (hotel) router.push(`/admin/hotels/${hotel.id}`);
  }

  return (
    <li className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-semibold">
            {a.hotel_name} <span className="font-normal text-ink-soft">· {a.city}</span>
          </h3>
          <p className="text-sm text-ink-soft">
            {formatHotelTime(a.created_at, "Asia/Tbilisi")} · {a.locale.toUpperCase()} · {a.rooms_count ?? "?"} rooms
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.intent === "demo" ? <Pill tone="good">Demo request · 15-min call</Pill> : <Pill tone="plain">Pilot application</Pill>}
          {a.ical_single_unit === false && <Pill tone="warn">multi-unit room types: do not promise iCal</Pill>}
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="inline text-ink-soft">Contact: </dt>
          <dd className="inline">
            {a.contact_name} ({a.role ?? "?"})
          </dd>
        </div>
        {a.phone && (
          <div>
            <dt className="inline text-ink-soft">Phone: </dt>
            <dd className="inline">{a.phone}</dd>
          </div>
        )}
        {a.telegram && (
          <div>
            <dt className="inline text-ink-soft">Telegram: </dt>
            <dd className="inline">{a.telegram}</dd>
          </div>
        )}
        {a.email && (
          <div>
            <dt className="inline text-ink-soft">Email: </dt>
            <dd className="inline">{a.email}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-ink-soft">Channels: </dt>
          <dd className="inline">{a.channels.length > 0 ? a.channels.join(", ") : "—"}</dd>
        </div>
        <div>
          <dt className="inline text-ink-soft">Channel manager: </dt>
          <dd className="inline">{a.channel_manager ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-ink-soft">Can export iCal: </dt>
          <dd className="inline">{yesNo(a.has_ical)}</dd>
        </div>
        <div>
          <dt className="inline text-ink-soft">One listing per room: </dt>
          <dd className="inline">{yesNo(a.ical_single_unit)}</dd>
        </div>
        <div>
          <dt className="inline text-ink-soft">Takes crypto today: </dt>
          <dd className="inline">{a.accepts_crypto_today ?? "—"}</dd>
        </div>
        {a.utm && (
          <div>
            <dt className="inline text-ink-soft">Source: </dt>
            <dd className="inline break-all">
              {Object.entries(a.utm)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </dd>
          </div>
        )}
      </dl>
      {a.message && <p className="rounded-xl bg-surface/70 px-4 py-3 text-sm whitespace-pre-line">{a.message}</p>}

      <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
        <label className="text-sm font-medium">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationItem["status"])} className="field">
            {applicationStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Notes
          <textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4_000} className="field" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!dirty || busy !== null}
            onClick={() => run("save", () => apiPatch(`/api/admin/applications/${a.id}`, { status, notes }))}
            className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60"
          >
            <Save aria-hidden="true" className="size-4" />
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          {a.hotel_id ? (
            <Link href={`/admin/hotels/${a.hotel_id}`} className="btn btn-secondary !py-2.5 text-sm">
              Onboarding <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <button type="button" disabled={busy !== null} onClick={convert} className="btn btn-primary !py-2.5 text-sm disabled:opacity-60">
              <Building2 aria-hidden="true" className="size-4" />
              {busy === "convert" ? "Creating…" : "Convert to hotel"}
            </button>
          )}
        </div>
      </div>
      <ErrorNote error={error} />
    </li>
  );
}
