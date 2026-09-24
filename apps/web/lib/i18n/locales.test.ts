import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ka from "@/messages/ka.json";
import ru from "@/messages/ru.json";
import { defaultLocale, isLocale, localePath, locales, resolveLocale } from "./locales";

describe("locale resolution", () => {
  it("resolves supported locales and rejects everything else", () => {
    expect(locales).toEqual(["en", "ka", "ru"]);
    expect(defaultLocale).toBe("en");
    expect(resolveLocale("ka")).toBe("ka");
    expect(resolveLocale("ru")).toBe("ru");
    expect(resolveLocale("en")).toBe("en");
    for (const bad of ["", "KA", "de", "ka-GE", "favicon.ico", undefined]) {
      expect(resolveLocale(bad)).toBeNull();
    }
    expect(isLocale(42)).toBe(false);
  });

  it("builds public paths: English unprefixed, others prefixed", () => {
    expect(localePath("en")).toBe("/");
    expect(localePath("en", "/apply")).toBe("/apply");
    expect(localePath("ka")).toBe("/ka");
    expect(localePath("ru", "/apply")).toBe("/ru/apply");
  });
});

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Paths of every leaf, with array items indexed, e.g. "pilot.terms.3". */
function leafPaths(value: Json, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leafPaths(v, `${prefix}${i}.`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, `${prefix}${k}.`));
  }
  return [prefix.slice(0, -1)];
}

describe("dictionaries", () => {
  const source = leafPaths(en as Json).sort();

  it.each([
    ["ka", ka],
    ["ru", ru],
  ])("%s has exactly the English keys plus the machine-draft note", (_, dict) => {
    const { _note, ...rest } = dict as Record<string, Json>;
    expect(_note).toBe("machine-drafted, needs native review");
    expect(leafPaths(rest).sort()).toEqual(source);
  });

  it("keeps the 11 pilot terms in every locale", () => {
    for (const dict of [en, ka, ru]) expect(dict.pilot.terms).toHaveLength(11);
  });
});
