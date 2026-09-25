"use client";

import { isCoreError, toMinor } from "@stumari/core";
import { ExternalLink, Link2, Pause, Play, Plus, Save, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNote, Pill } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { apiPatch, apiPost } from "@/lib/client/api";
import type { DashboardRoomType } from "@/lib/dashboard/units";
import type { HotelRow } from "@/lib/hotels";
import { formatUsdc } from "@/lib/money";

/**
 * Admin onboarding steps (api.md "Onboarding sequence", docs/sales/onboarding-checklist.md):
 * details → room types (USD rates) → units + iCal → contracts → payout wallet → register → activate.
 */

/** "65" / "65.5" / "65.50" USD → USDC base units; null when not a positive amount with ≤ 2 decimals. */
function usdToMinor(text: string): string | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  try {
    const minor = toMinor(t);
    return minor > 0n ? minor.toString() : null;
  } catch (e) {
    if (isCoreError(e)) return null;
    throw e;
  }
}
const minorToUsd = (minor: string | null) => (minor ? formatUsdc(BigInt(minor)).replaceAll(",", "") : "");

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-ink-soft">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- 1. details

type Details = Pick<
  HotelRow,
  "name" | "slug" | "city" | "country" | "address" | "phone" | "checkin_time" | "checkout_time" | "hotel_type" | "contact_email" | "contact_telegram"
>;

export function DetailsStep({ hotel }: { hotel: HotelRow }) {
  const { run, busy, error } = useAction();
  const [d, setD] = useState<Record<keyof Details, string>>({
    name: hotel.name,
    slug: hotel.slug,
    city: hotel.city ?? "",
    country: hotel.country ?? "",
    address: hotel.address ?? "",
    phone: hotel.phone ?? "",
    checkin_time: hotel.checkin_time,
    checkout_time: hotel.checkout_time,
    hotel_type: hotel.hotel_type,
    contact_email: hotel.contact_email ?? "",
    contact_telegram: hotel.contact_telegram ?? "",
  });
  const bind = (k: keyof Details) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void run("details", () => apiPatch(`/api/admin/hotels/${hotel.id}`, d));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Display name">
          <input required maxLength={120} className="field" {...bind("name")} />
        </Field>
        <Field label="URL slug" hint={`Guests book at /h/${d.slug || "…"}`}>
          <input required pattern="[a-z0-9][a-z0-9\-]{0,63}" className="field font-mono" {...bind("slug")} />
        </Field>
        <Field label="City or resort">
          <select className="field" {...bind("hotel_type")}>
            <option value="City Hotel">City Hotel</option>
            <option value="Resort Hotel">Resort Hotel</option>
          </select>
        </Field>
        <Field label="Address">
          <input maxLength={200} className="field" {...bind("address")} />
        </Field>
        <Field label="City">
          <input maxLength={80} className="field" {...bind("city")} />
        </Field>
        <Field label="Country">
          <input maxLength={80} className="field" {...bind("country")} />
        </Field>
        <Field label="Phone (shown to guests)">
          <input maxLength={40} className="field" {...bind("phone")} />
        </Field>
        <Field label="Check-in time" hint={`Hotel time (${hotel.timezone}); refund deadlines count from it`}>
          <input type="time" required className="field" {...bind("checkin_time")} />
        </Field>
        <Field label="Check-out time">
          <input type="time" required className="field" {...bind("checkout_time")} />
        </Field>
        <Field label="Contact email (conflicts, disputes)">
          <input type="email" maxLength={200} className="field" {...bind("contact_email")} />
        </Field>
        <Field label="Contact Telegram">
          <input maxLength={64} className="field" {...bind("contact_telegram")} />
        </Field>
      </div>
      <ErrorNote error={error} />
      <button type="submit" disabled={busy !== null} className="btn btn-primary disabled:opacity-60">
        <Save aria-hidden="true" className="size-4" />
        {busy ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- 2. room types

const MEALS = [
  ["BB", "Breakfast"],
  ["HB", "Half board"],
  ["FB", "Full board"],
  ["SC", "Self catering"],
] as const;

export function RoomTypesStep({ hotelId, roomTypes }: { hotelId: string; roomTypes: DashboardRoomType[] }) {
  return (
    <div className="space-y-4">
      {roomTypes.map((rt) => (
        <RoomTypeRow key={rt.id} hotelId={hotelId} rt={rt} />
      ))}
      <NewRoomType hotelId={hotelId} />
    </div>
  );
}

function RoomTypeRow({ hotelId, rt }: { hotelId: string; rt: DashboardRoomType }) {
  const { run, busy, error } = useAction();
  const [rate, setRate] = useState(minorToUsd(rt.base_rate_minor));
  const [weekend, setWeekend] = useState(minorToUsd(rt.weekend_rate_minor));
  const base = usdToMinor(rate);
  const weekendMinor = weekend.trim() === "" ? null : usdToMinor(weekend);
  const valid = base !== null && (weekend.trim() === "" || weekendMinor !== null);
  const path = `/api/admin/hotels/${hotelId}/room-types/${rt.id}`;

  return (
    <div className="space-y-2 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{rt.name}</span>
        <span className="text-sm text-ink-soft">
          {rt.meal} · up to {rt.max_adults} adults{rt.max_children > 0 ? `, ${rt.max_children} children` : ""} · {rt.units.length} unit
          {rt.units.length === 1 ? "" : "s"}
        </span>
        {rt.active ? <Pill tone="good">sold</Pill> : <Pill tone="plain">not sold</Pill>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nightly rate (USD)">
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="field w-32 font-mono" />
        </Field>
        <Field label="Fri/Sat nights (USD, optional)">
          <input inputMode="decimal" value={weekend} onChange={(e) => setWeekend(e.target.value)} className="field w-32 font-mono" />
        </Field>
        <button
          type="button"
          disabled={!valid || busy !== null}
          onClick={() => run("rate", () => apiPatch(path, { base_rate_minor: base, weekend_rate_minor: weekendMinor }))}
          className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60"
        >
          <Save aria-hidden="true" className="size-4" />
          {busy === "rate" ? "Saving…" : "Save rates"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("active", () => apiPatch(path, { active: !rt.active }))}
          className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60"
        >
          {rt.active ? "Stop selling" : "Sell again"}
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

function NewRoomType({ hotelId }: { hotelId: string }) {
  const { run, busy, error } = useAction();
  const empty = { name: "", rate: "", weekend: "", meal: "BB", max_adults: "2", max_children: "0" };
  const [f, setF] = useState(empty);
  const base = usdToMinor(f.rate);
  const weekend = f.weekend.trim() === "" ? null : usdToMinor(f.weekend);
  const valid = f.name.trim() !== "" && base !== null && (f.weekend.trim() === "" || weekend !== null);

  return (
    <form
      className="space-y-3 rounded-xl border border-dashed border-line p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await run("create", () =>
          apiPost(`/api/admin/hotels/${hotelId}/room-types`, {
            name: f.name,
            base_rate_minor: base,
            weekend_rate_minor: weekend,
            meal: f.meal,
            max_adults: Number(f.max_adults),
            max_children: Number(f.max_children),
          }),
        );
        if (created) setF(empty);
      }}
    >
      <p className="font-semibold">Add a room type</p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Name">
          <input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="field" />
        </Field>
        <Field label="Nightly rate (USD)" hint="45 USD = 45 USDC">
          <input required inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} className="field font-mono" />
        </Field>
        <Field label="Fri/Sat (USD)">
          <input inputMode="decimal" value={f.weekend} onChange={(e) => setF({ ...f, weekend: e.target.value })} className="field font-mono" />
        </Field>
        <Field label="Meals">
          <select value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value })} className="field">
            {MEALS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Max adults">
          <input type="number" min={1} max={20} value={f.max_adults} onChange={(e) => setF({ ...f, max_adults: e.target.value })} className="field" />
        </Field>
        <Field label="Max children">
          <input type="number" min={0} max={20} value={f.max_children} onChange={(e) => setF({ ...f, max_children: e.target.value })} className="field" />
        </Field>
      </div>
      <ErrorNote error={error} />
      <button type="submit" disabled={!valid || busy !== null} className="btn btn-secondary disabled:opacity-60">
        <Plus aria-hidden="true" className="size-4" />
        {busy ? "Adding…" : "Add room type"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- 3. units + iCal

export function UnitsStep({ hotelId, roomTypes }: { hotelId: string; roomTypes: DashboardRoomType[] }) {
  if (roomTypes.length === 0) return <p className="text-sm text-ink-soft">Add a room type first.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        One unit per physical room. Paste each unit&apos;s iCal export link from Booking.com / Airbnb (the hotel copies it from their own
        extranet — never ask for their password). Multi-unit room types: do not promise iCal; use manual blocks in the dashboard.
      </p>
      {roomTypes.map((rt) => (
        <div key={rt.id} className="space-y-2 rounded-xl border border-line bg-white p-4">
          <p className="font-semibold">{rt.name}</p>
          <ul className="space-y-1 text-sm">
            {rt.units.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{u.label}</span>
                <Pill tone={u.import_urls.length > 0 ? "good" : "plain"}>
                  {u.import_urls.length} import calendar{u.import_urls.length === 1 ? "" : "s"}
                </Pill>
                <span className="truncate font-mono text-xs text-ink-soft" title={u.export_url}>
                  export: {u.export_url}
                </span>
              </li>
            ))}
          </ul>
          <NewUnit hotelId={hotelId} roomTypeId={rt.id} />
        </div>
      ))}
    </div>
  );
}

function NewUnit({ hotelId, roomTypeId }: { hotelId: string; roomTypeId: string }) {
  const { run, busy, error } = useAction();
  const [label, setLabel] = useState("");
  const [urls, setUrls] = useState("");
  return (
    <form
      className="grid gap-2 pt-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await run("unit", () =>
          apiPost(`/api/admin/hotels/${hotelId}/room-types/${roomTypeId}/units`, {
            label,
            ical_import_urls: urls.split("\n").map((s) => s.trim()).filter(Boolean),
          }),
        );
        if (created) {
          setLabel("");
          setUrls("");
        }
      }}
    >
      <Field label="Unit label">
        <input required maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} className="field font-mono" placeholder="101" />
      </Field>
      <Field label="iCal import links (one per line, optional)">
        <textarea rows={1} value={urls} onChange={(e) => setUrls(e.target.value)} className="field font-mono text-xs" />
      </Field>
      <button type="submit" disabled={busy !== null} className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60">
        <Plus aria-hidden="true" className="size-4" />
        {busy ? "Adding…" : "Add unit"}
      </button>
      <div className="sm:col-span-3">
        <ErrorNote error={error} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 5. payout wallet

export function PayoutStep({ hotel }: { hotel: HotelRow }) {
  const { run, busy, error } = useAction();
  const [wallet, setWallet] = useState(hotel.payout_wallet ?? "");
  const changed = wallet.trim() !== (hotel.payout_wallet ?? "");
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        The owner&apos;s self-custody Phantom address (Receive → Solana). Read back the first and last 4 characters.{" "}
        <strong className="text-ink">Never an exchange deposit address:</strong> this wallet also signs in to the dashboard.
        {hotel.onchain_hotel && " Changing it sends update_hotel: only bookings made afterwards pay the new wallet."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Payout wallet">
          <input value={wallet} onChange={(e) => setWallet(e.target.value)} className="field w-[28rem] max-w-full font-mono text-sm" spellCheck={false} />
        </Field>
        <button
          type="button"
          disabled={!changed || wallet.trim() === "" || busy !== null}
          onClick={() => run("payout", () => apiPatch(`/api/admin/hotels/${hotel.id}`, { payout_wallet: wallet.trim() }))}
          className="btn btn-primary !py-2.5 disabled:opacity-60"
        >
          <Save aria-hidden="true" className="size-4" />
          {busy ? (hotel.onchain_hotel ? "Updating on Solana…" : "Saving…") : "Save payout wallet"}
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

// ---------------------------------------------------------------- 6. register, 7. status

export function RegisterStep({ hotel, explorer }: { hotel: HotelRow; explorer: { hotel: string | null; tx: string | null } }) {
  const { run, busy, error } = useAction();
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Creates the payout wallet&apos;s USDC account and runs <code>register_hotel</code>, signed by the admin key. The hotel becomes active; pause it
        right away unless you are running a supervised test booking.
      </p>
      {hotel.onchain_hotel && (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <Pill tone="good">registered</Pill>
          {explorer.hotel && (
            <a href={explorer.hotel} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wine hover:underline">
              Hotel account <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          )}
          {explorer.tx && (
            <a href={explorer.tx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wine hover:underline">
              Transaction <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </p>
      )}
      <button
        type="button"
        disabled={busy !== null || !hotel.payout_wallet}
        onClick={() => run("register", () => apiPost(`/api/admin/hotels/${hotel.id}/register`, {}))}
        className="btn btn-primary disabled:opacity-60"
      >
        <ShieldCheck aria-hidden="true" className="size-4" />
        {busy ? "Registering on Solana…" : hotel.onchain_hotel ? "Re-check registration" : "Register on-chain"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

export function StatusStep({ hotel }: { hotel: HotelRow }) {
  const { run, busy, error } = useAction();
  const set = (status: "active" | "paused") => run(status, () => apiPatch(`/api/admin/hotels/${hotel.id}`, { status }));
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Active hotels take bookings at <code>/h/{hotel.slug}</code>. On devnet a real pilot hotel stays paused except during a supervised
        test booking, and its export feeds are pasted into Booking.com / Airbnb only at go-live.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={hotel.status === "active" ? "good" : hotel.status === "paused" ? "warn" : "plain"}>{hotel.status}</Pill>
        <button type="button" disabled={busy !== null || !hotel.onchain_hotel || hotel.status === "active"} onClick={() => set("active")} className="btn btn-secondary !py-2 disabled:opacity-60">
          <Play aria-hidden="true" className="size-4" />
          {busy === "active" ? "Activating…" : "Activate"}
        </button>
        <button type="button" disabled={busy !== null || !hotel.onchain_hotel || hotel.status === "paused"} onClick={() => set("paused")} className="btn btn-secondary !py-2 disabled:opacity-60">
          <Pause aria-hidden="true" className="size-4" />
          {busy === "paused" ? "Pausing…" : "Pause"}
        </button>
        {hotel.status === "active" && (
          <a href={`/h/${hotel.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-wine hover:underline">
            <Link2 aria-hidden="true" className="size-4" /> Open the booking page
          </a>
        )}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
