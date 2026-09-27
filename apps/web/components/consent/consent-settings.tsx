"use client";

import { clearMetaCookies } from "@/components/analytics/meta-pixel";
import { setConsent, useConsent } from "./use-consent";

const status = {
  pending: "Checking your choice…",
  unset: "You have not chosen yet. The pixel is not loaded.",
  accepted: "You accepted ad measurement. The Meta Pixel loads on our landing and apply pages.",
  declined: "You declined ad measurement. The Meta Pixel is never loaded.",
} as const;

/** Privacy page control (English, like the page): see and change the ad-measurement choice. */
export function ConsentSettings() {
  const snapshot = useConsent();
  return (
    <div className="rounded-2xl border border-line bg-white/60 p-5">
      <p className="text-ink" role="status">
        {status[snapshot]}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={snapshot === "declined" || snapshot === "pending"}
          onClick={() => {
            setConsent("declined");
            clearMetaCookies();
          }}
          className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60"
        >
          {snapshot === "accepted" ? "Withdraw consent" : "Decline"}
        </button>
        <button
          type="button"
          disabled={snapshot === "accepted" || snapshot === "pending"}
          onClick={() => setConsent("accepted")}
          className="btn btn-secondary !py-2.5 text-sm disabled:opacity-60"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
