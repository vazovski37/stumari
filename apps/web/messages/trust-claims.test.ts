import { describe, expect, it } from "vitest";
import en from "./en.json";
import ka from "./ka.json";
import ru from "./ru.json";

/**
 * security.md "Honest limits": during the pilot Stumari holds the program upgrade authority, so the
 * landing never states the escrow's rules as absolute. Each rule claim points to "What we don't claim".
 */
describe("landing trust claims", () => {
  it("point to the honest limits wherever they say the terms or money cannot be changed", () => {
    expect(en.trust.items[1]!.title).toBe("Terms fixed before payment");
    expect(en.faq.items[3]!.q).toBe("What happens if a guest disputes?");
    for (const dict of [en, ka, ru]) {
      const limits = dict.trust.limits.title;
      const fixedTerms = dict.trust.items[1]!.body;
      const dispute = dict.faq.items[3]!.a;
      expect(fixedTerms).toContain(limits);
      expect(dispute).toContain(limits);
    }
  });

  it("drop the absolute English phrasings", () => {
    const all = JSON.stringify(en);
    expect(all).not.toContain("including us");
    expect(all).not.toContain("nobody can redirect");
    expect(all).not.toContain("neither you, the guest nor Stumari can change");
  });
});
