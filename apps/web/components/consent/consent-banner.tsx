"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Non-modal cookie choice, pinned to the bottom of the viewport. Accept and Decline carry equal weight,
 * and nothing loads until one of them is pressed.
 */
export function ConsentBanner({
  strings,
  privacyHref,
  onAccept,
  onDecline,
}: {
  strings: Dictionary["consent"];
  privacyHref: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      aria-label={strings.label}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-6 print:hidden"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-paper p-4 shadow-lg sm:flex-row sm:items-end sm:gap-4 sm:p-5">
        <div className="flex gap-3">
          <Cookie aria-hidden="true" className="mt-0.5 hidden size-5 shrink-0 text-wine sm:block" />
          <p className="text-[13px] leading-snug text-ink sm:text-sm sm:leading-relaxed">
            {strings.body}{" "}
            <Link href={privacyHref} className="font-medium text-wine underline underline-offset-2">
              {strings.privacy}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onDecline} className="btn btn-secondary flex-1 !py-2 text-sm sm:flex-none sm:!py-2.5">
            {strings.decline}
          </button>
          <button type="button" onClick={onAccept} className="btn btn-secondary flex-1 !py-2 text-sm sm:flex-none sm:!py-2.5">
            {strings.accept}
          </button>
        </div>
      </div>
    </section>
  );
}
