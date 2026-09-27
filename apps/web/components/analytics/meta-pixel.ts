/**
 * Meta Pixel loader. Nothing here runs until the visitor has accepted ad measurement in the consent
 * banner (components/consent); with no NEXT_PUBLIC_META_PIXEL_ID the banner and this loader never mount.
 */
import type { ApplicationIntent } from "@/lib/application-fields";
import { getConsentSnapshot } from "@/components/consent/use-consent";

export const META_PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Meta's standard base code, as a function: a queueing stub, then the async script. Idempotent. */
export function installMetaPixel(pixelId: string): void {
  if (typeof window === "undefined" || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq ??= fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = META_PIXEL_SRC;
  document.head.appendChild(script);

  // No automatic events (button clicks, page metadata): only the PageView and Lead we send ourselves.
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
}

export function trackPageView(): void {
  window.fbq?.("track", "PageView");
}

/**
 * A "Lead" after a stored application (both forms). Only the form type is sent, never what was typed.
 * No-op unless the pixel is loaded and the visitor's choice is still "accepted" (the same snapshot the
 * banner uses, so an Accept made while storage is blocked still counts for this page).
 */
export function trackLead(intent: ApplicationIntent): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (getConsentSnapshot() !== "accepted") return;
  window.fbq("track", "Lead", { content_name: intent });
}

/** Best effort: removes the first-party cookies the pixel sets (`_fbp`, `_fbc`) after consent is withdrawn. */
export function clearMetaCookies(): void {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = ["", host, ...parts.slice(1).map((_, i) => parts.slice(i + 1).join("."))].filter(
    (d, i, all) => all.indexOf(d) === i && (d === "" || d.includes(".") || d === host),
  );
  for (const name of ["_fbp", "_fbc"]) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}
