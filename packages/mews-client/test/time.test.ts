import { describe, expect, it } from "vitest";
import {
  addDays,
  dayNumber,
  durationSeconds,
  localDate,
  nightsBetween,
  stayUtc,
  timeUnitStartUtc,
  zonedTimeToUnix,
} from "../src";

describe("dates", () => {
  it("validates and shifts YYYY-MM-DD", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(nightsBetween("2026-10-28", "2026-10-30")).toBe(2);
    expect(() => dayNumber("2026-02-30")).toThrow(/not a real date/);
    expect(() => dayNumber("28/10/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("converts local midnight to the UTC time-unit start", () => {
    // Tbilisi is UTC+4 all year.
    expect(timeUnitStartUtc("2026-10-28", "Asia/Tbilisi")).toBe("2026-10-27T20:00:00Z");
    // London: BST (UTC+1) until 2026-10-25 01:00 UTC, then GMT.
    expect(timeUnitStartUtc("2026-10-24", "Europe/London")).toBe("2026-10-23T23:00:00Z");
    expect(timeUnitStartUtc("2026-10-25", "Europe/London")).toBe("2026-10-24T23:00:00Z");
    expect(timeUnitStartUtc("2026-10-26", "Europe/London")).toBe("2026-10-26T00:00:00Z");
    expect(timeUnitStartUtc("2026-11-02", "America/New_York")).toBe("2026-11-02T05:00:00Z");
  });

  it("round-trips local dates", () => {
    const t = zonedTimeToUnix("2026-10-28", 0, "Asia/Tbilisi");
    expect(localDate(t, "Asia/Tbilisi")).toBe("2026-10-28");
    expect(localDate(t - 1, "Asia/Tbilisi")).toBe("2026-10-27");
    expect(localDate(t, "UTC")).toBe("2026-10-27");
  });

  it("parses Mews offsets", () => {
    expect(durationSeconds("P0M0DT15H0M0S")).toBe(15 * 3600);
    expect(durationSeconds("P0M0DT12H30M0S")).toBe(12 * 3600 + 1800);
    expect(durationSeconds("P1DT2H")).toBe(26 * 3600);
    expect(durationSeconds("-P0M0DT2H0M0S")).toBe(-7200);
    expect(durationSeconds("PT0S")).toBe(0);
    expect(() => durationSeconds("P1M0DT0H")).toThrow(/years\/months/);
    expect(() => durationSeconds("15:00")).toThrow(/duration/);
    expect(() => durationSeconds("P")).toThrow(/duration/);
  });

  it("builds reservation StartUtc/EndUtc from the service offsets", () => {
    const offsets = { startOffset: "P0M0DT14H0M0S", endOffset: "P0M0DT12H0M0S" };
    expect(stayUtc("2026-10-28", "2026-10-30", "Asia/Tbilisi", offsets)).toEqual({
      startUtc: "2026-10-28T10:00:00Z",
      endUtc: "2026-10-30T08:00:00Z",
    });
    // Across the London DST switch: 15:00 BST in, 12:00 GMT out.
    expect(
      stayUtc("2026-10-24", "2026-10-26", "Europe/London", { startOffset: "P0M0DT15H0M0S", endOffset: "P0M0DT12H0M0S" }),
    ).toEqual({ startUtc: "2026-10-24T14:00:00Z", endUtc: "2026-10-26T12:00:00Z" });
    expect(() => stayUtc("2026-10-28", "2026-10-28", "Asia/Tbilisi", offsets)).toThrow(/after checkin/);
  });
});
