import { describe, expect, it } from "vitest";
import {
  CONSENT_MAX_AGE_SECS,
  CONSENT_STORAGE_KEY,
  consentPlan,
  parseConsent,
  readConsent,
  resolveConsent,
  serializeConsent,
  writeConsent,
  type ConsentStorage,
} from "./consent";

const NOW = 1_790_000_000;

function memoryStorage(initial: Record<string, string> = {}): ConsentStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwing: ConsentStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

describe("parseConsent", () => {
  it("round-trips both choices", () => {
    expect(parseConsent(serializeConsent("accepted", NOW), NOW)).toBe("accepted");
    expect(parseConsent(serializeConsent("declined", NOW), NOW)).toBe("declined");
  });

  it("treats missing, malformed or unknown values as no choice", () => {
    for (const raw of [null, undefined, "", "accepted", "{", "null", "[]", '{"choice":"yes","at":1790000000}', '{"choice":"accepted"}', '{"choice":"accepted","at":"1790000000"}', '{"choice":"accepted","at":1.5}']) {
      expect(parseConsent(raw, NOW)).toBeNull();
    }
  });

  it("asks again after about six months, and ignores timestamps from the future", () => {
    expect(parseConsent(serializeConsent("accepted", NOW - CONSENT_MAX_AGE_SECS), NOW)).toBe("accepted");
    expect(parseConsent(serializeConsent("accepted", NOW - CONSENT_MAX_AGE_SECS - 1), NOW)).toBeNull();
    expect(parseConsent(serializeConsent("accepted", NOW + 3600), NOW)).toBeNull();
  });
});

describe("readConsent / writeConsent", () => {
  it("stores the choice under one key", () => {
    const storage = memoryStorage();
    expect(readConsent(storage, NOW)).toBeNull();
    expect(writeConsent(storage, "declined", NOW)).toBe(true);
    expect([...storage.data.keys()]).toEqual([CONSENT_STORAGE_KEY]);
    expect(readConsent(storage, NOW)).toBe("declined");
    writeConsent(storage, "accepted", NOW);
    expect(readConsent(storage, NOW)).toBe("accepted");
  });

  it("never throws when storage is missing or blocked", () => {
    expect(readConsent(null, NOW)).toBeNull();
    expect(writeConsent(null, "accepted", NOW)).toBe(false);
    expect(readConsent(throwing, NOW)).toBeNull();
    expect(writeConsent(throwing, "accepted", NOW)).toBe(false);
  });
});

describe("consentPlan", () => {
  it("renders nothing and loads nothing without a pixel id, whatever is stored", () => {
    for (const snapshot of ["pending", "unset", "accepted", "declined"] as const) {
      expect(consentPlan(null, snapshot)).toEqual({ showBanner: false, loadPixel: false });
    }
  });

  it("asks only when no choice is stored, and loads the pixel only after Accept", () => {
    const id = "1234567890";
    expect(consentPlan(id, "pending")).toEqual({ showBanner: false, loadPixel: false });
    expect(consentPlan(id, "unset")).toEqual({ showBanner: true, loadPixel: false });
    expect(consentPlan(id, "declined")).toEqual({ showBanner: false, loadPixel: false });
    expect(consentPlan(id, "accepted")).toEqual({ showBanner: false, loadPixel: true });
  });
});

describe("resolveConsent", () => {
  it("prefers the stored choice, then this page's choice, then unset", () => {
    const storage = memoryStorage();
    expect(resolveConsent(storage, null, NOW)).toBe("unset");
    expect(resolveConsent(storage, "accepted", NOW)).toBe("accepted");
    writeConsent(storage, "declined", NOW);
    expect(resolveConsent(storage, "accepted", NOW)).toBe("declined");
  });

  it("keeps an Accept made while storage is missing or blocked", () => {
    expect(resolveConsent(null, "accepted", NOW)).toBe("accepted");
    expect(resolveConsent(throwing, "accepted", NOW)).toBe("accepted");
    expect(resolveConsent(throwing, null, NOW)).toBe("unset");
  });
});
