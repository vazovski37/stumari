import { describe, expect, it } from "vitest";
import {
  addDays,
  bookingIdHex,
  bytesToHex,
  checkinTs,
  CoreError,
  deriveBookingId,
  formatMinor,
  formatUsdc,
  hexToBytes,
  leadTimeDays,
  localDate,
  monthOf,
  nightsBetween,
  parseMinor,
  priceFromMultiplier,
  toMinor,
  U64_MAX,
  uuidToBytes,
  uuidV4,
  weekdayMon0,
  weekendNights,
} from "../src/index";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CoreError ? e.code : "not-a-CoreError";
  }
  return undefined;
};

describe("money", () => {
  it("round-trips u64 decimal strings", () => {
    expect(parseMinor("123450000")).toBe(123_450_000n);
    expect(parseMinor("0")).toBe(0n);
    expect(parseMinor(U64_MAX.toString())).toBe(U64_MAX);
    expect(formatMinor(123_450_000n)).toBe("123450000");
    for (const bad of ["", "-1", "01", "1.5", "1e6", " 1", (U64_MAX + 1n).toString()]) {
      expect(code(() => parseMinor(bad)), bad).toBe("InvalidAmount");
    }
    expect(code(() => formatMinor(-1n))).toBe("InvalidAmount");
  });

  it("parses and formats display amounts", () => {
    expect(toMinor("123.45")).toBe(123_450_000n);
    expect(toMinor("0.000001")).toBe(1n);
    expect(toMinor("7")).toBe(7_000_000n);
    expect(code(() => toMinor("1.0000001"))).toBe("InvalidAmount");
    expect(code(() => toMinor("-1"))).toBe("InvalidAmount");
    expect(formatUsdc(123_450_000n)).toBe("123.45 USDC");
    expect(formatUsdc(100_000_000n)).toBe("100.00 USDC");
    expect(formatUsdc(1_500_000_000n)).toBe("1,500.00 USDC");
    expect(formatUsdc(1n)).toBe("0.000001 USDC");
    expect(formatUsdc(0n)).toBe("0.00 USDC");
  });

  it("priceFromMultiplier rounds up to a whole cent", () => {
    expect(priceFromMultiplier(100_000_000n, 10_473)).toBe(104_730_000n);
    expect(priceFromMultiplier(100_000_000n, 10_000)).toBe(100_000_000n);
    expect(priceFromMultiplier(1n, 10_000)).toBe(10_000n);
    expect(priceFromMultiplier(0n, 12_345)).toBe(0n);
    // 123.456789 · 1.0001 = 123.4691347… → 123.47
    expect(priceFromMultiplier(123_456_789n, 10_001)).toBe(123_470_000n);
    // exactly on a cent stays put
    expect(priceFromMultiplier(50_000_000n, 9_000)).toBe(45_000_000n);
    for (let b = 1n; b < 2_000_000n; b += 99_991n) {
      for (const m of [5000, 8500, 9589, 10_000, 10_521, 20_000]) {
        const p = priceFromMultiplier(b, m);
        expect(p % 10_000n).toBe(0n);
        expect(p * 10_000n >= b * BigInt(m)).toBe(true);
        expect((p - 10_000n) * 10_000n < b * BigInt(m)).toBe(true);
      }
    }
  });
});

describe("ids", () => {
  it("uuidToBytes is lowercase RFC 4122 order", () => {
    const want = "00112233445566778899aabbccddeeff";
    expect(bytesToHex(uuidToBytes("00112233-4455-6677-8899-aabbccddeeff"))).toBe(want);
    expect(bytesToHex(uuidToBytes("00112233-4455-6677-8899-AABBCCDDEEFF"))).toBe(want);
    expect(code(() => uuidToBytes("00112233445566778899aabbccddeeff"))).toBe("InvalidInput");
  });

  it("hex round trip", () => {
    const b = Uint8Array.from([0, 1, 127, 128, 255]);
    expect(bytesToHex(b)).toBe("00017f80ff");
    expect(hexToBytes("00017F80FF")).toEqual(b);
    expect(code(() => hexToBytes("abc"))).toBe("InvalidInput");
    expect(code(() => hexToBytes("zz"))).toBe("InvalidInput");
  });

  it("deriveBookingId = sha256('stumari-booking-v1' ‖ quote id)[0..16]", () => {
    const id = "6f1c1c9e-3f0a-4c43-9d2b-8a7e5b0c4d21";
    expect(deriveBookingId(id)).toHaveLength(16);
    expect(bookingIdHex(id)).toBe(bytesToHex(deriveBookingId(id)));
    // Independent computation with node:crypto.
    return import("node:crypto").then(({ createHash }) => {
      const full = createHash("sha256").update("stumari-booking-v1").update(id, "utf8").digest("hex");
      expect(bookingIdHex(id)).toBe(full.slice(0, 32));
    });
  });

  it("uuidV4 sets version and variant bits", () => {
    const u = uuidV4(new Uint8Array(16).fill(0xff));
    expect(u).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("dates", () => {
  it("calendar helpers", () => {
    expect(weekdayMon0("2026-11-05")).toBe(3); // Thursday
    expect(weekdayMon0("2026-11-09")).toBe(0); // Monday
    expect(monthOf("2026-11-05")).toBe(11);
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(code(() => nightsBetween("2026-02-30", "2026-03-02"))).toBe("InvalidInput");
    expect(code(() => monthOf("2026-1-05"))).toBe("InvalidInput");
  });

  it("weekend nights are nights starting on Friday or Saturday", () => {
    expect(weekendNights("2026-11-05", "2026-11-08")).toBe(2); // Thu, Fri, Sat
    expect(weekendNights("2026-11-06", "2026-11-07")).toBe(1); // Fri
    expect(weekendNights("2026-11-08", "2026-11-13")).toBe(0); // Sun..Thu
    expect(weekendNights("2026-11-01", "2026-11-15")).toBe(4);
  });

  it("checkinTs resolves wall-clock time in the hotel timezone", () => {
    expect(checkinTs("2026-11-05", "14:00", "Asia/Tbilisi")).toBe(Date.UTC(2026, 10, 5, 10, 0) / 1000);
    expect(checkinTs("2026-10-01", "00:00", "Asia/Tbilisi")).toBe(1_790_798_400);
    expect(checkinTs("2026-07-01", "14:00", "UTC")).toBe(Date.UTC(2026, 6, 1, 14) / 1000);
    // DST: Berlin is UTC+1 in winter, UTC+2 in summer (change on 2026-03-29 at 02:00).
    expect(checkinTs("2026-01-15", "14:00", "Europe/Berlin")).toBe(Date.UTC(2026, 0, 15, 13) / 1000);
    expect(checkinTs("2026-03-29", "14:00", "Europe/Berlin")).toBe(Date.UTC(2026, 2, 29, 12) / 1000);
    expect(code(() => checkinTs("2026-11-05", "24:00", "Asia/Tbilisi"))).toBe("InvalidInput");
    expect(code(() => checkinTs("2026-11-05", "14:00", "Mars/Olympus"))).toBe("InvalidInput");
  });

  it("localDate and leadTimeDays", () => {
    expect(localDate(Date.UTC(2026, 10, 4, 21) / 1000, "Asia/Tbilisi")).toBe("2026-11-05");
    expect(localDate(Date.UTC(2026, 10, 4, 19, 59, 59) / 1000, "Asia/Tbilisi")).toBe("2026-11-04");
    expect(leadTimeDays(1_790_798_400, 1_793_872_800)).toBe(35);
    expect(leadTimeDays(100, 100 + 86_399)).toBe(0);
    expect(leadTimeDays(100, 100 + 86_400)).toBe(1);
    expect(leadTimeDays(100, 99)).toBe(-1);
  });
});
