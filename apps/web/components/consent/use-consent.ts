"use client";

import { useSyncExternalStore } from "react";
import {
  browserStorage,
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  resolveConsent,
  writeConsent,
  type ConsentChoice,
  type ConsentSnapshot,
} from "./consent";

/** The choice made on this page when storage is unavailable (it then lasts until the next page load). */
let pageChoice: ConsentChoice | null = null;

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CONSENT_STORAGE_KEY) onChange();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The visitor's choice right now, exactly as the banner sees it (including an Accept made while storage
 * is blocked). Safe to call outside React, e.g. before sending a Lead event.
 */
export function getConsentSnapshot(): ConsentChoice | "unset" {
  return resolveConsent(browserStorage(), pageChoice);
}

/** Server render and hydration: unknown, so nothing consent-dependent renders until storage is read. */
const getServerSnapshot = (): ConsentSnapshot => "pending";

/** The visitor's ad-measurement choice, kept in sync across components and tabs. */
export function useConsent(): ConsentSnapshot {
  return useSyncExternalStore(subscribe, getConsentSnapshot, getServerSnapshot);
}

export function setConsent(choice: ConsentChoice): void {
  pageChoice = choice;
  writeConsent(browserStorage(), choice);
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}
