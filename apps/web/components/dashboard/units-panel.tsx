"use client";

import { CalendarPlus, Check, Copy, RefreshCw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorNote, Pill } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { formatHotelDate, formatHotelTime } from "@/lib/bookings/terms";
import { apiDelete, apiPost, apiPut } from "@/lib/client/api";
import type { DashboardRoomType, DashboardUnit } from "@/lib/dashboard/units";

/** Units and calendars: export feeds, import URLs, sync status, manual blocks (inventory-ical.md). */
export function UnitsPanel({ hotelId, roomTypes, timeZone }: { hotelId: string; roomTypes: DashboardRoomType[]; timeZone: string }) {
  const { run, busy, error } = useAction();
  const [summary, setSummary] = useState<string | null>(null);

  async function syncNow() {
    setSummary(null);
    const res = await run("sync", () => apiPost<{ units: { label: string; errors: string[] }[] }>(`/api/dashboard/${hotelId}/sync`, {}));
    if (!res) return;
    const failed = res.units.filter((u) => u.errors.length > 0).length;
    setSummary(
      res.units.length === 0
        ? "No unit has an import calendar yet."
        : `Synced ${res.units.length} unit${res.units.length === 1 ? "" : "s"}${failed ? `, ${failed} with errors (see below)` : ", no errors"}.`,
    );
  }

  const units = roomTypes.flatMap((rt) => rt.units);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={syncNow} disabled={busy !== null || units.length === 0} className="btn btn-secondary disabled:opacity-60">
          <RefreshCw aria-hidden="true" className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} />
          {busy === "sync" ? "Syncing calendars…" : "Sync calendars now"}
        </button>
        {summary && (
          <span role="status" className="text-sm text-ink-soft">
            {summary}
          </span>
        )}
      </div>
      <ErrorNote error={error} />
      {units.length === 0 && <Empty>No rooms yet. Stumari adds your room types and units during onboarding.</Empty>}
      {roomTypes.map((rt) =>
        rt.units.length === 0 ? null : (
          <div key={rt.id} className="space-y-3">
            <h3 className="font-sans text-base font-semibold">
              {rt.name} {!rt.active && <Pill tone="plain">not sold</Pill>}
            </h3>
            {rt.units.map((u) => (
              <UnitCard key={u.id} hotelId={hotelId} unit={u} timeZone={timeZone} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="text-sm font-medium">
      {label}
      <div className="mt-1.5 flex gap-2">
        <input readOnly value={value} className="field !mt-0 min-w-0 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label={label} />
        <button
          type="button"
          className="btn btn-secondary shrink-0 !px-3 !py-2 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1_500);
          }}
        >
          {copied ? <Check aria-hidden="true" className="size-4 text-positive" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function UnitCard({ hotelId, unit, timeZone }: { hotelId: string; unit: DashboardUnit; timeZone: string }) {
  const { run, busy, error } = useAction();
  const [urls, setUrls] = useState(unit.import_urls.join("\n"));
  const [block, setBlock] = useState({ start_date: "", end_date: "", summary: "" });
  const base = `/api/dashboard/${hotelId}/units/${unit.id}`;
  const manual = unit.blocks.filter((b) => b.source === "manual");
  const imported = unit.blocks.filter((b) => b.source === "ical");

  return (
    <article className="space-y-4 rounded-xl border border-line bg-white p-4" aria-label={`Unit ${unit.label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold">{unit.label}</span>
        {!unit.active && <Pill tone="plain">inactive</Pill>}
        {unit.import_urls.length === 0 ? (
          <Pill tone="plain">no import calendar</Pill>
        ) : unit.sync_error ? (
          <Pill tone="bad">sync failed</Pill>
        ) : unit.last_synced_at ? (
          <Pill tone="good">synced {formatHotelTime(unit.last_synced_at, timeZone)}</Pill>
        ) : (
          <Pill tone="warn">not synced yet</Pill>
        )}
      </div>
      {unit.sync_error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{unit.sync_error}</p>}

      <CopyField label="Export feed (paste into Booking.com / Airbnb at go-live)" value={unit.export_url} />

      <label className="block text-sm font-medium">
        Import calendars (iCal links from Booking.com / Airbnb, one per line, https, up to 5)
        <textarea rows={Math.max(2, urls.split("\n").length)} value={urls} onChange={(e) => setUrls(e.target.value)} className="field font-mono text-xs" />
      </label>
      <button
        type="button"
        disabled={busy !== null || urls.trim() === unit.import_urls.join("\n")}
        onClick={() => run("ical", () => apiPut(`${base}/ical`, { import_urls: urls.split("\n").map((s) => s.trim()).filter(Boolean) }))}
        className="btn btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-60"
      >
        <Save aria-hidden="true" className="size-4" />
        {busy === "ical" ? "Saving…" : "Save import calendars"}
      </button>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Blocked dates</h4>
        {unit.blocks.length === 0 && <p className="text-sm text-ink-soft">Nothing blocked from today on.</p>}
        <ul className="space-y-1.5 text-sm">
          {manual.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">manual</Pill>
              {formatHotelDate(b.start_date)} → {formatHotelDate(b.end_date)}
              {b.summary && <span className="text-ink-soft">· {b.summary}</span>}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run(`del:${b.id}`, () => apiDelete(`${base}/blocks/${b.id}`))}
                className="ml-auto inline-flex items-center gap-1 text-danger hover:underline disabled:opacity-60"
              >
                <Trash2 aria-hidden="true" className="size-3.5" /> Remove
              </button>
            </li>
          ))}
          {imported.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2">
              <Pill tone="plain">calendar</Pill>
              {formatHotelDate(b.start_date)} → {formatHotelDate(b.end_date)}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run("block", () => apiPost(`${base}/blocks`, { ...block, summary: block.summary || undefined }));
            if (ok) setBlock({ start_date: "", end_date: "", summary: "" });
          }}
        >
          <label className="text-sm font-medium">
            First night
            <input type="date" required value={block.start_date} onChange={(e) => setBlock({ ...block, start_date: e.target.value })} className="field" />
          </label>
          <label className="text-sm font-medium">
            Free again on
            <input type="date" required value={block.end_date} onChange={(e) => setBlock({ ...block, end_date: e.target.value })} className="field" />
          </label>
          <label className="text-sm font-medium">
            Note (optional)
            <input maxLength={120} value={block.summary} onChange={(e) => setBlock({ ...block, summary: e.target.value })} className="field" />
          </label>
          <button type="submit" disabled={busy !== null} className="btn btn-secondary !px-3 !py-2.5 text-sm disabled:opacity-60">
            <CalendarPlus aria-hidden="true" className="size-4" />
            {busy === "block" ? "Blocking…" : "Block dates"}
          </button>
        </form>
      </div>
      <ErrorNote error={error} />
    </article>
  );
}
