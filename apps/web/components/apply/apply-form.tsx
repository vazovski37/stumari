"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { trackLead } from "@/components/analytics/meta-pixel";
import {
  applicationChannels,
  applicationRoles,
  cryptoAcceptance,
  HONEYPOT_FIELD,
  type ApplicationIntent,
} from "@/lib/application-fields";
import { localePath, type Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { browserSessionStorage, utmForSubmission } from "@/lib/utm";

type Strings = Dictionary["apply"];
type DemoStrings = Dictionary["demo"];
type Status = { kind: "idle" | "submitting" | "done" } | { kind: "error"; message: string };

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink shadow-xs outline-none transition-colors placeholder:text-ink-soft/85 focus:border-wine focus:ring-2 focus:ring-wine/20 aria-[invalid=true]:border-clay aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-clay/20";

function triState(value: FormDataEntryValue | null): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function text(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Collects the form into the JSON body POST /api/applications expects (the demo form sends fewer fields).
 * Attribution: the apply URL's utm_* / ref, else the ones remembered from this tab's landing (lib/utm.ts).
 */
function toPayload(form: HTMLFormElement, locale: Locale, intent: ApplicationIntent) {
  const data = new FormData(form);
  const utm = utmForSubmission(window.location.search, browserSessionStorage());
  const rooms = text(data.get("rooms_count"));
  return {
    hotel_name: text(data.get("hotel_name")),
    city: text(data.get("city")) ?? "Tbilisi",
    rooms_count: rooms === null ? null : Number(rooms),
    contact_name: text(data.get("contact_name")),
    role: data.get("role"),
    phone: text(data.get("phone")),
    telegram: text(data.get("telegram")),
    email: text(data.get("email")),
    channels: data.getAll("channels"),
    channel_manager: text(data.get("channel_manager")),
    has_ical: triState(data.get("has_ical")),
    ical_single_unit: triState(data.get("ical_single_unit")),
    accepts_crypto_today: data.get("accepts_crypto_today"),
    message: text(data.get("message")),
    locale,
    intent,
    utm,
    consent: data.get("consent") === "on",
    [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) ?? "",
  };
}

export function ApplyForm({
  locale,
  strings,
  privacyHref,
  intent = "pilot",
  demo,
}: {
  locale: Locale;
  strings: Strings;
  privacyHref: string;
  /** `demo`: the short "book a 15-minute demo" variant for ad traffic (`demo` strings required). */
  intent?: ApplicationIntent;
  demo?: DemoStrings;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const successRef = useRef<HTMLHeadingElement>(null);
  const f = strings.fields;

  useEffect(() => {
    if (status.kind === "done") successRef.current?.focus();
  }, [status.kind]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = toPayload(form, locale, intent);
    if (payload.phone === null && payload.telegram === null) {
      setInvalid(new Set(["phone", "telegram"]));
      setStatus({ kind: "error", message: strings.errors.contactRequired });
      form.querySelector<HTMLInputElement>("#phone")?.focus();
      return;
    }
    setStatus({ kind: "submitting" });
    setInvalid(new Set());
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 201) {
        trackLead(intent);
        setStatus({ kind: "done" });
        return;
      }
      if (response.status === 429) {
        setStatus({ kind: "error", message: strings.errors.rateLimited });
        return;
      }
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { error?: { issues?: { path: string }[] } } | null;
        const fields = new Set((body?.error?.issues ?? []).map((i) => i.path.split(".")[0] ?? ""));
        setInvalid(fields);
        setStatus({ kind: "error", message: strings.errors.validation });
        return;
      }
      setStatus({ kind: "error", message: strings.errors.generic });
    } catch {
      setStatus({ kind: "error", message: strings.errors.generic });
    }
  }

  const isDemo = intent === "demo" && demo !== undefined;
  const success = isDemo ? demo.success : strings.success;

  if (status.kind === "done") {
    return (
      <div className="card p-8 text-center" role="status">
        <CircleCheck aria-hidden="true" className="mx-auto size-12 text-vine" />
        <h2 ref={successRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
          {success.title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">{success.body}</p>
        <Link href={localePath(locale)} className="btn btn-secondary mt-6">
          {strings.success.home}
        </Link>
      </div>
    );
  }

  const bad = (name: string) => invalid.has(name) || undefined;

  const errorNote = status.kind === "error" && (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {status.message}
    </p>
  );
  const honeypot = (
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label htmlFor={HONEYPOT_FIELD}>Website</label>
      <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
  const consent = (
    <label className="flex gap-3 rounded-xl bg-sand p-4 text-sm leading-relaxed text-ink">
      <input name="consent" type="checkbox" required aria-invalid={bad("consent")} className="mt-0.5 size-4 shrink-0 accent-wine" />
      <span>
        {f.consent}{" "}
        <Link href={privacyHref} className="font-medium text-wine underline underline-offset-2">
          {f.privacyLink}
        </Link>
      </span>
    </label>
  );

  if (isDemo) {
    // Short form for ad traffic: who, which hotel, how to reach them. Everything else waits for the call.
    return (
      <form onSubmit={onSubmit} className="card relative space-y-6 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="contact_name" label={f.contactName} required strings={strings}>
            <input id="contact_name" name="contact_name" required maxLength={120} autoComplete="name" aria-invalid={bad("contact_name")} className={inputClass} />
          </Field>
          <Field id="hotel_name" label={f.hotelName} required strings={strings}>
            <input id="hotel_name" name="hotel_name" required maxLength={120} autoComplete="organization" aria-invalid={bad("hotel_name")} className={inputClass} />
          </Field>
        </div>
        <fieldset className="space-y-5">
          <legend className="text-sm text-ink-soft">{f.contactHint}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="phone" label={f.phone} hint={f.phoneHint} strings={strings}>
              <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" aria-invalid={bad("phone")} className={inputClass} />
            </Field>
            <Field id="telegram" label={f.telegram} hint={f.telegramHint} strings={strings}>
              <input id="telegram" name="telegram" maxLength={64} autoCapitalize="none" aria-invalid={bad("telegram")} className={inputClass} />
            </Field>
          </div>
        </fieldset>
        <Field id="rooms_count" label={f.roomsCount} strings={strings}>
          <input id="rooms_count" name="rooms_count" type="number" inputMode="numeric" min={1} max={1000} aria-invalid={bad("rooms_count")} className={`${inputClass} sm:max-w-[12rem]`} />
        </Field>
        {honeypot}
        {consent}
        {errorNote}
        <button type="submit" disabled={status.kind === "submitting"} className="btn btn-primary w-full disabled:opacity-70 sm:w-auto">
          {status.kind === "submitting" ? strings.submitting : demo.submit}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-9 p-6 sm:p-8">
      <Fieldset legend={strings.sections.property}>
        <Field id="hotel_name" label={f.hotelName} required strings={strings}>
          <input id="hotel_name" name="hotel_name" required maxLength={120} autoComplete="organization" aria-invalid={bad("hotel_name")} className={inputClass} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="city" label={f.city} required strings={strings}>
            <input id="city" name="city" required maxLength={80} defaultValue="Tbilisi" autoComplete="address-level2" aria-invalid={bad("city")} className={inputClass} />
          </Field>
          <Field id="rooms_count" label={f.roomsCount} strings={strings}>
            <input id="rooms_count" name="rooms_count" type="number" inputMode="numeric" min={1} max={1000} aria-invalid={bad("rooms_count")} className={inputClass} />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend={strings.sections.you}>
        <Field id="contact_name" label={f.contactName} required strings={strings}>
          <input id="contact_name" name="contact_name" required maxLength={120} autoComplete="name" aria-invalid={bad("contact_name")} className={inputClass} />
        </Field>
        <Choices legend={f.role} required strings={strings} invalid={bad("role")}>
          {applicationRoles.map((role, i) => (
            <Choice key={role} type="radio" name="role" value={role} label={f.roles[role]} required={i === 0} />
          ))}
        </Choices>
      </Fieldset>

      <Fieldset legend={strings.sections.contact} hint={f.contactHint}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="phone" label={f.phone} hint={f.phoneHint} strings={strings}>
            <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" aria-invalid={bad("phone")} className={inputClass} />
          </Field>
          <Field id="telegram" label={f.telegram} hint={f.telegramHint} strings={strings}>
            <input id="telegram" name="telegram" maxLength={64} autoCapitalize="none" aria-invalid={bad("telegram")} className={inputClass} />
          </Field>
        </div>
        <Field id="email" label={f.email} strings={strings}>
          <input id="email" name="email" type="email" maxLength={200} autoComplete="email" aria-invalid={bad("email")} className={inputClass} />
        </Field>
      </Fieldset>

      <Fieldset legend={strings.sections.channels}>
        <Choices legend={f.channels} strings={strings} invalid={bad("channels")}>
          {applicationChannels.map((channel) => (
            <Choice key={channel} type="checkbox" name="channels" value={channel} label={f.channelOptions[channel]} />
          ))}
        </Choices>
        <Field id="channel_manager" label={f.channelManager} hint={f.channelManagerHint} strings={strings}>
          <input id="channel_manager" name="channel_manager" maxLength={80} aria-invalid={bad("channel_manager")} className={inputClass} />
        </Field>
        <YesNo name="has_ical" legend={f.hasIcal} strings={strings} />
        <YesNo name="ical_single_unit" legend={f.icalSingleUnit} hint={f.icalSingleUnitHint} strings={strings} />
        <Choices legend={f.acceptsCrypto} strings={strings}>
          {cryptoAcceptance.map((value) => (
            <Choice key={value} type="radio" name="accepts_crypto_today" value={value} label={f.cryptoOptions[value]} />
          ))}
        </Choices>
      </Fieldset>

      <Fieldset legend={strings.sections.more}>
        <Field id="message" label={f.message} strings={strings}>
          <textarea id="message" name="message" rows={4} maxLength={2000} placeholder={f.messagePlaceholder} aria-invalid={bad("message")} className={inputClass} />
        </Field>
        {honeypot}
        {consent}
      </Fieldset>

      {errorNote}

      <button type="submit" disabled={status.kind === "submitting"} className="btn btn-primary w-full disabled:opacity-70 sm:w-auto">
        {status.kind === "submitting" ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}

function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="relative space-y-5">
      <legend className="font-display text-xl font-semibold text-ink">{legend}</legend>
      {hint && <p className="-mt-3 text-sm text-ink-soft">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Tag({ required, strings }: { required?: boolean; strings: Strings }) {
  return <span className="ml-1.5 text-xs font-normal text-ink-soft">({required ? strings.required : strings.optional})</span>;
}

function Field({
  id,
  label,
  hint,
  required,
  strings,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  strings: Strings;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        <Tag required={required} strings={strings} />
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function Choices({
  legend,
  hint,
  required,
  invalid,
  strings,
  children,
}: {
  legend: string;
  hint?: string;
  required?: boolean;
  invalid?: boolean;
  strings: Strings;
  children: ReactNode;
}) {
  return (
    <fieldset aria-invalid={invalid}>
      <legend className="text-sm font-medium text-ink">
        {legend}
        <Tag required={required} strings={strings} />
      </legend>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Choice({
  type,
  name,
  value,
  label,
  required,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm text-ink transition-colors hover:border-ink-soft has-[:checked]:border-wine has-[:checked]:bg-wine/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-wine/30">
      <input type={type} name={name} value={value} required={required} className="size-4 accent-wine" />
      {label}
    </label>
  );
}

function YesNo({ name, legend, hint, strings }: { name: string; legend: string; hint?: string; strings: Strings }) {
  const options = strings.fields.yesNo;
  return (
    <Choices legend={legend} hint={hint} strings={strings}>
      <Choice type="radio" name={name} value="yes" label={options.yes} />
      <Choice type="radio" name={name} value="no" label={options.no} />
      <Choice type="radio" name={name} value="unsure" label={options.unsure} />
    </Choices>
  );
}
