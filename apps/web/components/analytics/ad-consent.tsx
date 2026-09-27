"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { consentPlan } from "@/components/consent/consent";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { setConsent, useConsent } from "@/components/consent/use-consent";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { installMetaPixel, trackPageView } from "./meta-pixel";

/**
 * Mounted by the [lang] layout only when NEXT_PUBLIC_META_PIXEL_ID is set. Shows the consent banner until
 * the visitor chooses; loads the Meta Pixel only after "Accept", then sends a PageView per route.
 */
export function AdConsent({
  pixelId,
  strings,
  privacyHref,
}: {
  pixelId: string;
  strings: Dictionary["consent"];
  privacyHref: string;
}) {
  const snapshot = useConsent();
  const { showBanner, loadPixel } = consentPlan(pixelId, snapshot);
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!loadPixel) return;
    installMetaPixel(pixelId);
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    trackPageView();
  }, [loadPixel, pixelId, pathname]);

  if (!showBanner) return null;
  return (
    <ConsentBanner
      strings={strings}
      privacyHref={privacyHref}
      onAccept={() => setConsent("accepted")}
      onDecline={() => setConsent("declined")}
    />
  );
}
