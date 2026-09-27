import { describe, expect, it } from "vitest";
import { pickUtm, recallUtm, rememberUtm, UTM_STORAGE_KEY, utmForSubmission, withUtm, type UtmStorage } from "./utm";

function memoryStorage(initial: Record<string, string> = {}): UtmStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwing: UtmStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

const ad = "?utm_source=facebook&utm_campaign=pilot&utm_content=usdc&type=demo&fbclid=abc";

describe("pickUtm", () => {
  it("keeps only utm_* and ref, from every input shape", () => {
    const expected = { utm_source: "facebook", utm_campaign: "pilot", utm_content: "usdc" };
    expect(pickUtm(ad)).toEqual(expected);
    expect(pickUtm(new URLSearchParams(ad))).toEqual(expected);
    expect(pickUtm({ utm_source: ["facebook", "x"], utm_campaign: "pilot", utm_content: "usdc", type: "demo" })).toEqual(expected);
    expect(pickUtm("?ref=luka")).toEqual({ ref: "luka" });
  });

  it("drops empty values and caps length at 200", () => {
    expect(pickUtm("?utm_source=&utm_medium=%20%20&ref=")).toEqual({});
    expect(pickUtm(`?utm_term=${"a".repeat(300)}`).utm_term).toHaveLength(200);
    expect(pickUtm("")).toEqual({});
  });
});

describe("rememberUtm / recallUtm", () => {
  it("stores the first tagged load and keeps it (first touch wins)", () => {
    const storage = memoryStorage();
    expect(rememberUtm(storage, "")).toEqual({});
    expect(storage.data.size).toBe(0);
    expect(rememberUtm(storage, ad)).toEqual({ utm_source: "facebook", utm_campaign: "pilot", utm_content: "usdc" });
    expect([...storage.data.keys()]).toEqual([UTM_STORAGE_KEY]);
    rememberUtm(storage, "?utm_source=instagram");
    expect(recallUtm(storage)).toEqual({ utm_source: "facebook", utm_campaign: "pilot", utm_content: "usdc" });
  });

  it("treats malformed stored values as none and drops unknown keys", () => {
    for (const raw of ["", "{", "null", "[]", '"x"', "42"]) {
      expect(recallUtm(memoryStorage({ [UTM_STORAGE_KEY]: raw }))).toEqual({});
    }
    const storage = memoryStorage({ [UTM_STORAGE_KEY]: JSON.stringify({ utm_source: "fb", evil: "x", ref: 5 }) });
    expect(recallUtm(storage)).toEqual({ utm_source: "fb" });
  });

  it("never throws when storage is missing or blocked", () => {
    expect(recallUtm(null)).toEqual({});
    expect(recallUtm(throwing)).toEqual({});
    expect(rememberUtm(null, ad)).toEqual(pickUtm(ad));
    expect(rememberUtm(throwing, ad)).toEqual(pickUtm(ad));
  });
});

describe("utmForSubmission", () => {
  it("prefers the apply URL's own tags, else falls back to the remembered ones", () => {
    const storage = memoryStorage();
    rememberUtm(storage, "?utm_source=facebook&utm_content=founding");
    expect(utmForSubmission("?type=demo", storage)).toEqual({ utm_source: "facebook", utm_content: "founding" });
    expect(utmForSubmission("?utm_source=telegram", storage)).toEqual({ utm_source: "telegram" });
    expect(utmForSubmission("", memoryStorage())).toEqual({});
    expect(utmForSubmission("", throwing)).toEqual({});
  });
});

describe("withUtm", () => {
  it("appends the tags to a bare path or one that already has a query", () => {
    const utm = { utm_source: "facebook", utm_campaign: "pilot one" };
    expect(withUtm("/ka/apply", utm)).toBe("/ka/apply?utm_source=facebook&utm_campaign=pilot+one");
    expect(withUtm("/ru/apply?type=demo", utm)).toBe("/ru/apply?type=demo&utm_source=facebook&utm_campaign=pilot+one");
    expect(withUtm("/apply", {})).toBe("/apply");
  });
});
