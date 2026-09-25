"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { apiPost } from "@/lib/client/api";

const JOBS = [
  { id: "sync", title: "Sync", text: "iCal imports for stale units, quote expiry, reconcile pending bookings with the chain and auto-confirm them." },
  { id: "release", title: "Release", text: "Release confirmed bookings past their payout time; void pending ones past the confirm deadline (full refund)." },
] as const;

/** Runs the cron jobs now (api.md "Cron"); the scheduler runs them on its own otherwise. */
export function Operations() {
  const { run, busy, error } = useAction();
  const [result, setResult] = useState<{ job: string; body: unknown } | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {JOBS.map((j) => (
          <div key={j.id} className="card space-y-3 p-5">
            <h3 className="font-sans text-lg font-semibold">{j.title}</h3>
            <p className="text-sm text-ink-soft">{j.text}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const body = await run(j.id, () => apiPost(`/api/admin/cron/${j.id}`, {}));
                if (body) setResult({ job: j.id, body });
              }}
              className="btn btn-secondary disabled:opacity-60"
            >
              <Play aria-hidden="true" className="size-4" />
              {busy === j.id ? "Running…" : `Run ${j.id} now`}
            </button>
          </div>
        ))}
      </div>
      <ErrorNote error={error} />
      {result && (
        <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs text-paper" aria-label={`Result of ${result.job}`}>
          {JSON.stringify(result.body, null, 2)}
        </pre>
      )}
    </div>
  );
}
