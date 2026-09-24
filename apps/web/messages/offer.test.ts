import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "./en.json";

/** ADR-0013: the landing page states the pilot offer word for word from docs/sales/offer.md. */
describe("pilot offer", () => {
  it("matches the 'copy exactly' list in docs/sales/offer.md", () => {
    const offer = readFileSync(fileURLToPath(new URL("../../../docs/sales/offer.md", import.meta.url)), "utf8");
    const section = offer.split(/^## The offer \(copy exactly\)\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const bullets = section
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
    expect(bullets.length).toBeGreaterThan(0);
    expect(en.pilot.terms).toEqual(bullets);
  });
});
