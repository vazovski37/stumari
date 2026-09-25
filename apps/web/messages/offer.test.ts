import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import ka from "./ka.json";
import ru from "./ru.json";

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

  it("has one translated term per English term", () => {
    expect(ka.pilot.terms).toHaveLength(en.pilot.terms.length);
    expect(ru.pilot.terms).toHaveLength(en.pilot.terms.length);
  });

  it("never promises to preserve revenue in translation (ADR-0013: the model targets it)", () => {
    // Pilot term 8 (index 7): EN "target your current expected revenue".
    expect(en.pilot.terms[7]).toContain("target your current expected revenue");
    expect(ka.pilot.terms[7]).toContain("მიზნად ისახავდეს");
    expect(ka.pilot.terms[7]).not.toContain("შენარჩუნდეს");
    expect(ru.pilot.terms[7]).toContain("нацелена на");
    expect(ru.pilot.terms[7]).not.toContain("сохранить");
  });
});
