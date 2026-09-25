"use client";

import { addDays, nightsBetween, TEMPLATES, type QuoteEnvelope, type QuoteOption } from "@stumari/core";
import { ArrowRight, BedDouble, Clock, Info, LockKeyhole, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaucetButton } from "@/components/wallet/wallet-button";
import { shortAddress } from "@/lib/format";
import { useWallet } from "@/components/wallet/wallet-provider";
import { apiGet, apiPost, ClientApiError, errorMessage } from "@/lib/client/api";
import type { hotelProfile } from "@/lib/hotels";
import { formatChange, formatUsdc } from "@/lib/money";
import type { PublicConfig } from "@/lib/public-config";
import { ExplainDrawer } from "./explain-drawer";
import { errorHint, radioKeyTarget } from "./menu";
import { RefundTimeline } from "./refund-timeline";

export type HotelProfile = ReturnType<typeof hotelProfile>;
type Availability = { room_type_id: string; available: boolean; nights: number; base_price_minor: string }[];
type PayResponse = { booking_id: string; tx: string };
type Stage = "idle" | "building" | "signing" | "confirming";

const stageText: Record<Stage, string> = {
  idle: "",
  building: "Preparing your payment…",
  signing: "Approve the payment in your wallet…",
  confirming: "Confirming on Solana…",
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** An error after signing where the create may still have landed (we just could not see it confirm). */
const UNSEEN_OUTCOME = new Set(["CONFIRMATION_TIMEOUT"]);

export function Checkout({ hotel, today }: { hotel: HotelProfile; today: string }) {
  const router = useRouter();
  const wallet = useWallet();
  const [dates, setDates] = useState({ checkin: addDays(today, 14), checkout: addDays(today, 16) });
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [availability, setAvailability] = useState<{ key: string; rows: Availability } | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [roomTypeId, setRoomTypeId] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteEnvelope | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [explainFor, setExplainFor] = useState<QuoteOption["id"] | null>(null);
  const [contact, setContact] = useState({ name: "", email: "" });
  const [busyQuote, setBusyQuote] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const [amountCap, setAmountCap] = useState<string | null>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const now = useNow(1000);

  const nights = useMemo(() => {
    try {
      return nightsBetween(dates.checkin, dates.checkout);
    } catch {
      return 0;
    }
  }, [dates]);
  const query = `checkin=${dates.checkin}&checkout=${dates.checkout}&adults=${guests.adults}&children=${guests.children}`;
  const rows = availability?.key === query ? availability.rows : null;

  useEffect(() => {
    if (nights < 1) return;
    let cancelled = false;
    apiGet<Availability>(`/api/hotels/${hotel.slug}/availability?${query}`)
      .then((r) => {
        if (cancelled) return;
        setAvailability({ key: query, rows: r });
        setAvailabilityError(null);
      })
      .catch((e: unknown) => !cancelled && setAvailabilityError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [hotel.slug, query, nights]);

  // The pilot cap is named only when the menu withholds an option above it.
  const needsCap = quote?.explain.options.some((o) => o.withheld === "over_amount_cap") ?? false;
  useEffect(() => {
    if (!needsCap || amountCap !== null) return;
    let cancelled = false;
    apiGet<PublicConfig>("/api/config/public")
      .then((c) => !cancelled && setAmountCap(c.pilot_offer.amount_cap_minor))
      .catch(() => {
        // The drawer states the limit without the number.
      });
    return () => {
      cancelled = true;
    };
  }, [needsCap, amountCap]);

  const expiresIn = quote ? quote.quote.expires_at - now : 0;
  const quoteLive = quote !== null && expiresIn > 0;
  const option = quote?.quote.options[optionIndex] ?? null;
  const roomType = hotel.room_types.find((rt) => rt.id === (quote?.quote.room_type_id ?? roomTypeId));

  function changeStay(next: Partial<typeof dates>, nextGuests?: Partial<typeof guests>) {
    const merged = { ...dates, ...next };
    if (next.checkin && merged.checkout <= merged.checkin) merged.checkout = addDays(merged.checkin, 1);
    setDates(merged);
    if (nextGuests) setGuests({ ...guests, ...nextGuests });
    setQuote(null);
    setError(null);
  }

  async function seePrices(id: string) {
    setRoomTypeId(id);
    setBusyQuote(true);
    setError(null);
    try {
      const envelope = await apiPost<QuoteEnvelope>("/api/quotes", {
        hotel_slug: hotel.slug,
        room_type_id: id,
        checkin_date: dates.checkin,
        checkout_date: dates.checkout,
        adults: guests.adults,
        children: guests.children,
        ...(wallet.connected ? { buyer_wallet: wallet.connected.address } : {}),
      });
      setQuote(envelope);
      const reference = envelope.quote.options.findIndex((o) => o.id === envelope.explain.reference_template);
      setOptionIndex(Math.max(0, reference));
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusyQuote(false);
    }
  }

  async function pay() {
    if (!quote || !option) return;
    setError(null);
    let built: PayResponse | null = null;
    try {
      const payer = await wallet.requireWallet();
      setStage("building");
      built = await apiPost<PayResponse>(`/api/quotes/${quote.quote.id}/pay`, {
        option_index: optionIndex,
        payer: payer.address,
        guest_name: contact.name || null,
        guest_email: contact.email || null,
      });
      setStage("signing");
      const bookingId = built.booking_id;
      await payer.submit(built.tx, bookingId, () => setStage("confirming"));
      router.push(`/b/${bookingId}`);
    } catch (e) {
      setStage("idle");
      // The payment may have landed even though we could not see it confirm: the booking page
      // re-reads the chain, while staying here would invite a second payment.
      if (built && e instanceof ClientApiError && UNSEEN_OUTCOME.has(e.code)) return router.push(`/b/${built.booking_id}`);
      if (e instanceof ClientApiError && e.code === "ALREADY_PAID") {
        const booking = e.body.booking as { id?: string } | undefined;
        if (booking?.id) return router.push(`/b/${booking.id}`);
      }
      if (e instanceof Error && e.message === "No wallet selected") return;
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  const base = quote ? BigInt(quote.quote.base_price_minor) : 0n;
  const code = error instanceof ClientApiError ? error.code : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-8">
        <section aria-labelledby="stay-title" className="card p-5 sm:p-6">
          <h2 id="stay-title" className="font-sans text-lg font-semibold">
            Your stay
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <label className="text-sm font-medium">
              Check-in
              <input
                type="date"
                value={dates.checkin}
                min={today}
                onChange={(e) => e.target.value && changeStay({ checkin: e.target.value })}
                className="field"
              />
            </label>
            <label className="text-sm font-medium">
              Check-out
              <input
                type="date"
                value={dates.checkout}
                min={addDays(dates.checkin, 1)}
                onChange={(e) => e.target.value && changeStay({ checkout: e.target.value })}
                className="field"
              />
            </label>
            <label className="text-sm font-medium">
              Adults
              <select value={guests.adults} onChange={(e) => changeStay({}, { adults: Number(e.target.value) })} className="field">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Children
              <select value={guests.children} onChange={(e) => changeStay({}, { children: Number(e.target.value) })} className="field">
                {[0, 1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Check-out must be after check-in"} · check-in from{" "}
            {hotel.checkin_time}, check-out by {hotel.checkout_time} (hotel time)
          </p>
        </section>

        <section aria-labelledby="rooms-title" className="space-y-4">
          <h2 id="rooms-title" className="text-2xl font-semibold tracking-tight">
            Rooms
          </h2>
          {availabilityError && <p className="text-sm text-clay">{availabilityError}</p>}
          <ul className="space-y-3">
            {hotel.room_types.map((rt) => {
              const row = rows?.find((r) => r.room_type_id === rt.id);
              const selected = quote?.quote.room_type_id === rt.id;
              return (
                <li key={rt.id} className={`card flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${selected ? "ring-2 ring-wine" : ""}`}>
                  <div className="flex-1">
                    <h3 className="flex items-center gap-2 font-sans text-lg font-semibold">
                      <BedDouble aria-hidden="true" className="size-5 text-clay" />
                      {rt.name}
                    </h3>
                    {rt.description && <p className="mt-1 text-sm text-ink-soft">{rt.description}</p>}
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        <Users aria-hidden="true" className="size-3.5" /> up to {rt.max_adults} adult{rt.max_adults === 1 ? "" : "s"}
                        {rt.max_children > 0 ? `, ${rt.max_children} child${rt.max_children === 1 ? "" : "ren"}` : ""}
                      </span>
                      <span>{rt.meal === "BB" ? "Breakfast included" : rt.meal}</span>
                      <span>
                        from {formatUsdc(BigInt(rt.base_rate_minor))} USDC / night
                        {rt.weekend_rate_minor ? ` (Fri–Sat ${formatUsdc(BigInt(rt.weekend_rate_minor))})` : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
                    {row ? (
                      row.available ? (
                        <p className="text-sm">
                          <span className="font-display text-xl font-semibold">{formatUsdc(BigInt(row.base_price_minor))}</span>{" "}
                          <span className="text-ink-soft">USDC base</span>
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-ink-soft">Not available for these dates</p>
                      )
                    ) : (
                      <p className="text-sm text-ink-soft">{nights > 0 ? "Checking…" : ""}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => seePrices(rt.id)}
                      disabled={!row?.available || busyQuote || stage !== "idle"}
                      className="btn btn-primary !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyQuote && roomTypeId === rt.id ? "Pricing…" : "See prices"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {quote && roomType && (
          <section aria-labelledby="menu-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="menu-title" className="text-2xl font-semibold tracking-tight">
                  Choose your cancellation terms
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {roomType.name} · {quote.quote.nights} night{quote.quote.nights === 1 ? "" : "s"} · base rate {formatUsdc(base)} USDC. Each
                  price is for these terms only, signed by Stumari.
                </p>
              </div>
              <p className={`inline-flex items-center gap-1.5 text-sm ${quoteLive ? "text-ink-soft" : "font-medium text-clay"}`} aria-live="polite">
                <Clock aria-hidden="true" className="size-4" />
                {quoteLive
                  ? `Room held for ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`
                  : "Prices expired — ask again"}
              </p>
            </div>
            <div role="radiogroup" aria-labelledby="menu-title" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {quote.quote.options.map((o, i) => {
                const price = BigInt(o.price_minor);
                const chosen = i === optionIndex;
                return (
                  <div
                    key={o.id}
                    ref={(el) => {
                      cards.current[i] = el;
                    }}
                    role="radio"
                    aria-checked={chosen}
                    tabIndex={chosen ? 0 : -1}
                    onClick={() => setOptionIndex(i)}
                    onKeyDown={(e) => {
                      // Keys pressed on the inner "Why this price" button are that button's.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setOptionIndex(i);
                        return;
                      }
                      const next = radioKeyTarget(e.key, i, quote.quote.options.length);
                      if (next === null) return;
                      e.preventDefault();
                      setOptionIndex(next);
                      cards.current[next]?.focus();
                    }}
                    className={`card flex cursor-pointer flex-col gap-3 p-5 transition-shadow ${chosen ? "ring-2 ring-wine" : "hover:border-ink-soft"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-sans text-base font-semibold">{TEMPLATES[o.id].name}</h3>
                      {o.id === quote.explain.reference_template && (
                        <span className="rounded-full bg-sand px-2 py-0.5 text-[0.7rem] font-medium text-ink-soft">Hotel&rsquo;s usual</span>
                      )}
                    </div>
                    <p>
                      <span className="font-display text-3xl font-semibold tracking-tight tabular-nums">{formatUsdc(price)}</span>{" "}
                      <span className="text-sm text-ink-soft">USDC</span>
                    </p>
                    <p className="text-xs text-ink-soft">{price === base ? "Base rate" : `${formatChange(price, base)} vs. base rate`}</p>
                    <RefundTimeline
                      tiers={o.tiers}
                      checkinTs={quote.quote.checkin_ts}
                      now={now}
                      timeZone={hotel.timezone}
                      label={`${TEMPLATES[o.id].name} refund schedule`}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExplainFor(o.id);
                      }}
                      className="mt-auto inline-flex items-center gap-1 self-start text-sm font-medium text-wine underline underline-offset-2"
                    >
                      <Info aria-hidden="true" className="size-4" />
                      Why this price
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Payment" className="lg:sticky lg:top-24 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="font-sans text-lg font-semibold">Pay with USDC</h2>
          {option && quote ? (
            <>
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink-soft">
                  {TEMPLATES[option.id].name} · {roomType?.name}
                </span>
                <span className="font-display text-2xl font-semibold tabular-nums">{formatUsdc(BigInt(option.price_minor))} USDC</span>
              </p>
              <label className="block text-sm font-medium">
                Name <span className="font-normal text-ink-soft">(optional, shared with the hotel only)</span>
                <input
                  value={contact.name}
                  maxLength={100}
                  autoComplete="name"
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  className="field"
                />
              </label>
              <label className="block text-sm font-medium">
                Email <span className="font-normal text-ink-soft">(optional)</span>
                <input
                  type="email"
                  value={contact.email}
                  maxLength={200}
                  autoComplete="email"
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  className="field"
                />
              </label>
              <button
                type="button"
                onClick={pay}
                disabled={!quoteLive || stage !== "idle"}
                className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stage !== "idle" ? stageText[stage] : wallet.connected ? `Pay ${formatUsdc(BigInt(option.price_minor))} USDC` : "Choose wallet and pay"}
                {stage === "idle" && <ArrowRight aria-hidden="true" className="size-4" />}
              </button>
              {wallet.connected && (
                <p className="text-xs text-ink-soft">
                  Paying from {wallet.connected.kind === "demo" ? "the test wallet" : wallet.connected.name} {shortAddress(wallet.connected.address)}. No SOL
                  needed: Stumari pays the network fee.
                </p>
              )}
              <p className="flex gap-2 text-xs text-ink-soft">
                <LockKeyhole aria-hidden="true" className="size-4 shrink-0 text-vine" />
                Your USDC goes into an escrow for this booking alone. Refunds follow the schedule above automatically; the hotel
                is paid after check-in.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Pick dates and a room, then &ldquo;See prices&rdquo; to get your options.</p>
          )}
          {error && (
            <div role="alert" className="space-y-2 rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">
              <p>{error.message}</p>
              {errorHint(code) && <p>{errorHint(code)}</p>}
              {code === "INSUFFICIENT_FUNDS" && wallet.connected?.kind === "demo" && <FaucetButton />}
              {(code === "WALLET_MISMATCH" || code === "QUOTE_EXPIRED" || code === "HOLD_LOST") && roomTypeId && (
                <button type="button" onClick={() => seePrices(roomTypeId)} className="font-medium text-wine underline">
                  Get new prices{wallet.connected ? " for this wallet" : ""}
                </button>
              )}
            </div>
          )}
          {wallet.config.demoMode && !error && <FaucetButton />}
        </div>
      </aside>

      {quote && (
        <ExplainDrawer
          explain={quote.explain}
          optionId={explainFor}
          basePriceMinor={base}
          amountCapMinor={amountCap}
          onClose={() => setExplainFor(null)}
        />
      )}
    </div>
  );
}
