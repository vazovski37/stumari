import { describe, expect, it } from "vitest";
import { adCopy, adFileName, adFormats, adVariants, parseAdFile } from "./copy";

const all = (locale: keyof typeof adCopy) => JSON.stringify(adCopy[locale]);

/** ADR-0013 and docs/sales/offer.md: ads say no more than the landing page does. */
describe("ad copy honesty", () => {
  it("never promises demand, revenue, lari payouts or compliance", () => {
    expect(all("en")).not.toMatch(/guarantee|more bookings|more guests|increase|boost|GEL|lari|compliant|legal|tax/i);
    expect(all("ka")).not.toMatch(/გარანტ|ლარ|მეტი ჯავშ|მეტი სტუმ|შენარჩუნ/);
    expect(all("ru")).not.toMatch(/гарант|лари|больше брониров|больше гост|сохран/i);
  });

  it("never mentions swapping or exchanging tokens (Meta's crypto ad policy)", () => {
    expect(all("en")).not.toMatch(/swap|exchang|convert|Phantom/i);
    expect(all("ka")).not.toMatch(/ცვლ|გადაცვ|კონვერტ|Phantom/);
    expect(all("ru")).not.toMatch(/(?<![а-яё])(по)?меня|обмен|конвертир|Phantom/i);
    for (const locale of ["en", "ka", "ru"] as const) {
      expect(Object.keys(adCopy[locale].usdc).sort()).toEqual(["accent", "body", "headline"]);
      expect(adCopy[locale].usdc.body).toMatch(/USDC/);
    }
  });

  it("claims only that some guests already pay in USDT, never that they often do", () => {
    expect(adCopy.en.usdc.headline).toContain("some of your guests already pay in USDT");
    expect(adCopy.ka.usdc.headline).toContain("ზოგიერთი სტუმარი უკვე");
    expect(adCopy.ru.usdc.headline).toContain("Некоторые гости уже");
    expect(all("en")).not.toMatch(/often|most guests|many guests/i);
    expect(all("ka")).not.toMatch(/ხშირად|ბევრი სტუმ/);
    expect(all("ru")).not.toMatch(/часто|многие гости/i);
  });

  it("keeps the dispute caveat next to the 24-hour payout", () => {
    for (const locale of ["en", "ka", "ru"] as const) {
      const { usdc, founding } = adCopy[locale];
      for (const text of [usdc.body, founding.bullets[0]!]) {
        expect(text).toContain("24");
        expect(text).toMatch(/dispute|დავა|спор/);
      }
    }
  });

  it("states the fee after 2026 and the per-booking cap exactly", () => {
    expect(adCopy.en.founding.accent).toBe("Stumari fee until 31 December 2026. Then a flat 1.5% of what the hotel receives.");
    expect(adCopy.ka.founding.accent).toContain("2026 წლის 31 დეკემბრამდე");
    expect(adCopy.ka.founding.accent).toContain("1,5%");
    expect(adCopy.ru.founding.accent).toContain("до 31 декабря 2026 года");
    expect(adCopy.ru.founding.accent).toContain("1,5%");
    expect(adCopy.en.founding.bullets[1]).toContain("1,500 USDC");
    expect(adCopy.ka.founding.bullets[1]).toContain("1\u00a0500 USDC");
    expect(adCopy.ru.founding.bullets[1]).toContain("1\u00a0500 USDC");
    for (const locale of ["en", "ka", "ru"] as const) expect(adCopy[locale].founding.big).toBe("0%");
  });

  it("quotes the cancellation statistics exactly as the landing page", () => {
    expect(adCopy.en.contracts.stat).toBe("27% of ordinary bookings cancel");
    expect(adCopy.en.contracts.statNote).toBe(
      "37% overall, including no-shows and group blocks (Hotel Booking Demand, 119,390 bookings)",
    );
    for (const locale of ["ka", "ru"] as const) {
      expect(adCopy[locale].contracts.stat).toContain("27%");
      expect(adCopy[locale].contracts.statNote).toContain("37%");
      expect(adCopy[locale].contracts.statNote).toContain("119\u00a0390");
    }
  });

  it("uses the positioning line, never 'travel app' or 'escrow app'", () => {
    expect(adCopy.en.common.brand).toBe("Stablecoin checkout for independent hotels");
    expect(all("en")).not.toMatch(/travel app|escrow app/i);
  });
});

describe("ad file names", () => {
  it("round-trips every variant and format", () => {
    for (const variant of adVariants) {
      for (const format of Object.keys(adFormats) as (keyof typeof adFormats)[]) {
        expect(parseAdFile(adFileName(variant, format))).toEqual({ variant, format });
      }
    }
    expect(adFileName("usdc", "square")).toBe("usdc.png");
    expect(adFileName("founding", "wide")).toBe("founding-wide.png");
  });

  it("rejects anything else", () => {
    for (const file of ["usdc", "usdc.jpg", "other.png", "usdc-tall.png", "../usdc.png", "USDC.png", "usdc-wide-wide.png"]) {
      expect(parseAdFile(file)).toBeNull();
    }
  });
});
