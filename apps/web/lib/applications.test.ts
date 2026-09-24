import { describe, expect, it } from "vitest";
import { applicationInput, describeIssues, isHoneypotFilled } from "./applications";

const minimal = {
  hotel_name: "  Old Tbilisi Guesthouse ",
  contact_name: "Nino",
  role: "owner",
  phone: "+995 555 12 34 56",
  locale: "ka",
  consent: true,
};

function issuesOf(input: unknown) {
  const result = applicationInput.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : describeIssues(result.error);
}

describe("applicationInput", () => {
  it("accepts a minimal application and fills defaults", () => {
    const parsed = applicationInput.parse(minimal);
    expect(parsed).toMatchObject({
      hotel_name: "Old Tbilisi Guesthouse",
      city: "Tbilisi",
      rooms_count: null,
      telegram: null,
      email: null,
      channels: [],
      has_ical: null,
      ical_single_unit: null,
      accepts_crypto_today: null,
      utm: null,
      locale: "ka",
      consent: true,
    });
  });

  it("accepts a full application, dedupes channels and keeps tri-state answers", () => {
    const parsed = applicationInput.parse({
      ...minimal,
      city: "Tbilisi",
      rooms_count: 12,
      telegram: "@oldtbilisi",
      email: "nino@example.com",
      channels: ["booking.com", "airbnb", "booking.com"],
      channel_manager: "Exely",
      has_ical: true,
      ical_single_unit: false,
      accepts_crypto_today: "often",
      message: "Call after 6pm",
      utm: { utm_source: "telegram", utm_campaign: "pilot" },
    });
    expect(parsed.channels).toEqual(["booking.com", "airbnb"]);
    expect(parsed.has_ical).toBe(true);
    expect(parsed.ical_single_unit).toBe(false);
    expect(parsed.utm).toEqual({ utm_source: "telegram", utm_campaign: "pilot" });
  });

  it("treats blank optional text as null", () => {
    const parsed = applicationInput.parse({ ...minimal, email: "  ", message: "", telegram: null });
    expect(parsed.email).toBeNull();
    expect(parsed.message).toBeNull();
  });

  it("requires consent to be exactly true", () => {
    expect(issuesOf({ ...minimal, consent: false }).map((i) => i.path)).toContain("consent");
    expect(issuesOf({ ...minimal, consent: "true" }).map((i) => i.path)).toContain("consent");
  });

  it("requires a WhatsApp phone or a Telegram username", () => {
    expect(issuesOf({ ...minimal, phone: null }).map((i) => i.path)).toEqual(["phone"]);
    expect(applicationInput.safeParse({ ...minimal, phone: null, telegram: "oldtbilisi" }).success).toBe(true);
  });

  it("rejects missing required fields and bad values", () => {
    const paths = issuesOf({
      ...minimal,
      hotel_name: " ",
      role: "boss",
      email: "not-an-email",
      rooms_count: 0,
      channels: ["myspace"],
      accepts_crypto_today: "always",
      locale: "de",
      telegram: "a b",
    }).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "hotel_name",
        "role",
        "email",
        "rooms_count",
        "channels.0",
        "accepts_crypto_today",
        "locale",
        "telegram",
      ]),
    );
  });

  it("rejects over-long text and unknown utm keys", () => {
    expect(issuesOf({ ...minimal, message: "x".repeat(2001) }).map((i) => i.path)).toContain("message");
    expect(issuesOf({ ...minimal, utm: { gclid: "abc" } }).length).toBeGreaterThan(0);
  });
});

describe("isHoneypotFilled", () => {
  it("flags any non-empty honeypot value", () => {
    expect(isHoneypotFilled({ ...minimal, website: "https://spam.example" })).toBe(true);
    expect(isHoneypotFilled({ ...minimal, website: 1 })).toBe(true);
  });

  it("ignores an empty or missing honeypot", () => {
    expect(isHoneypotFilled({ ...minimal, website: "" })).toBe(false);
    expect(isHoneypotFilled({ ...minimal, website: "   " })).toBe(false);
    expect(isHoneypotFilled(minimal)).toBe(false);
    expect(isHoneypotFilled(null)).toBe(false);
    expect(isHoneypotFilled("website")).toBe(false);
  });
});
