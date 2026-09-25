"use client";

import {
  DEFAULT_RESALE_BPS,
  isCoreError,
  LOW_OCCUPANCY_RESALE_BPS,
  MAX_MULT_BPS_RANGE,
  MIN_MULT_BPS_RANGE,
  TEMPLATE_IDS,
  TEMPLATES,
  validatePolicy,
  WINDOW_LABELS,
  type TemplateId,
} from "@stumari/core";
import { Save } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { apiPatch } from "@/lib/client/api";
import type { HotelPolicy } from "@/lib/db/schema";

/** Integer text → number; anything else → NaN, which validatePolicy rejects like the server does. */
const int = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const times = (bps: number) => `${(bps / 10_000).toFixed(2)}×`;

function policyProblem(candidate: unknown): string | null {
  try {
    validatePolicy(candidate);
    return null;
  } catch (e) {
    return isCoreError(e) ? e.message.slice(e.code.length + 2) : String(e);
  }
}

/**
 * Contract menu and price bounds (pricing-and-risk-model.md §5). The form checks with the same
 * `validatePolicy` as the API and checkout, so what saves is exactly what pricing accepts.
 */
export function PolicyEditor({ hotelId, policy }: { hotelId: string; policy: HotelPolicy }) {
  const { run, busy, error } = useAction();
  const [enabled, setEnabled] = useState<TemplateId[]>(policy.enabled_templates);
  const [reference, setReference] = useState<TemplateId>(policy.reference_template);
  const [resale, setResale] = useState(policy.resale_bps.map(String));
  const [minMult, setMinMult] = useState(String(policy.min_mult_bps));
  const [maxMult, setMaxMult] = useState(String(policy.max_mult_bps));
  const [saved, setSaved] = useState(false);

  const candidate = {
    enabled_templates: TEMPLATE_IDS.filter((id) => enabled.includes(id)),
    reference_template: reference,
    resale_bps: resale.map(int),
    min_mult_bps: int(minMult),
    max_mult_bps: int(maxMult),
  };
  const problem = policyProblem(candidate);

  const edit = (set: (v: string) => void, value: string) => {
    setSaved(false);
    set(value);
  };
  const toggle = (id: TemplateId) => {
    setSaved(false);
    setEnabled((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  };

  async function save() {
    setSaved(false);
    const result = await run("policy", () => apiPatch(`/api/dashboard/${hotelId}/policy`, candidate));
    if (result) setSaved(true);
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="font-semibold">Contracts offered to guests</legend>
        <p className="text-sm text-ink-soft">
          Your current policy (reference) is always priced at your nightly rate. The others are priced from each guest&apos;s estimated
          risk, to target the same expected revenue.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {TEMPLATE_IDS.map((id) => (
            <div key={id} className={`rounded-xl border p-4 ${enabled.includes(id) ? "border-wine bg-white" : "border-line"}`}>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={enabled.includes(id)} onChange={() => toggle(id)} className="size-4 accent-wine" />
                {TEMPLATES[id].name}
              </label>
              <p className="mt-1 text-sm text-ink-soft">{TEMPLATES[id].description}</p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`reference-${hotelId}`}
                  checked={reference === id}
                  onChange={() => {
                    setSaved(false);
                    setReference(id);
                  }}
                  className="size-4 accent-wine"
                />
                My current policy (reference)
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Chance a cancelled night is resold (bps, 10000 = 100%)</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className="btn btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setResale(DEFAULT_RESALE_BPS.map(String))}>
            Occupancy 70% or more
          </button>
          <button
            type="button"
            className="btn btn-secondary !px-3 !py-1.5 text-sm"
            onClick={() => setResale(LOW_OCCUPANCY_RESALE_BPS.map(String))}
          >
            Occupancy below 70%
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {WINDOW_LABELS.map((label, k) => (
            <label key={label} className="flex flex-col justify-end text-sm font-medium">
              Cancelled {label} before
              <input
                inputMode="numeric"
                className="field font-mono"
                value={resale[k] ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setResale((cur) => cur.map((v, i) => (i === k ? e.target.value : v)));
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Price bounds for the other contracts</legend>
        <label className="text-sm font-medium">
          Lowest price, bps of your rate ({MIN_MULT_BPS_RANGE.join("–")})
          <input inputMode="numeric" className="field font-mono" value={minMult} onChange={(e) => edit(setMinMult, e.target.value)} />
          <span className="text-xs text-ink-soft">{Number.isNaN(int(minMult)) ? "—" : times(int(minMult))}</span>
        </label>
        <label className="text-sm font-medium">
          Highest price, bps of your rate ({MAX_MULT_BPS_RANGE.join("–")})
          <input inputMode="numeric" className="field font-mono" value={maxMult} onChange={(e) => edit(setMaxMult, e.target.value)} />
          <span className="text-xs text-ink-soft">{Number.isNaN(int(maxMult)) ? "—" : times(int(maxMult))}</span>
        </label>
      </fieldset>

      {problem && (
        <p role="status" className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-wine-deep">
          {problem}
        </p>
      )}
      <ErrorNote error={error} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={problem !== null || busy !== null} className="btn btn-primary disabled:opacity-60">
          <Save aria-hidden="true" className="size-4" />
          {busy ? "Saving…" : "Save contracts"}
        </button>
        {saved && <span className="text-sm text-vine">Saved. New quotes use these terms.</span>}
      </div>
    </div>
  );
}
