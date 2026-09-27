"use client";

import { useEffect } from "react";
import { browserSessionStorage, rememberUtm } from "@/lib/utm";

/**
 * Mounted by the [lang] layout (landing and apply pages): on the first load, remembers utm_* and ref from
 * the URL for this tab, so a visitor who lands on the landing page from an ad and then opens the apply
 * form is still attributed. First-party sessionStorage only; nothing is sent anywhere. Renders nothing.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      rememberUtm(browserSessionStorage(), window.location.search);
    } catch {
      // Attribution is best effort; never break the page over it.
    }
  }, []);
  return null;
}
