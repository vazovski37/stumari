import { describe, expect, it } from "vitest";
import { applicationInput, describeIssues, isHoneypotFilled } from "./applications";
import { applicationMessage } from "./telegram";

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

describe("applicationInput intent", () => {
  const demo = {
    contact_name: "Nino",
    hotel_name: "Old Tbilisi Guesthouse",
    telegram: "@oldtbilisi",
    locale: "ka",
    intent: "demo",
    consent: true,
  };

  it("defaults to the pilot form", () => {
    expect(applicationInput.parse(minimal).intent).toBe("pilot");
  });

  it("accepts the short demo form without a role, city or channel questions", () => {
    const parsed = applicationInput.parse({ ...demo, rooms_count: 8, utm: { utm_source: "facebook", utm_content: "usdc" } });
    expect(parsed).toMatchObject({
      intent: "demo",
      role: null,
      city: "Tbilisi",
      rooms_count: 8,
      channels: [],
      has_ical: null,
      utm: { utm_source: "facebook", utm_content: "usdc" },
    });
  });

  it("still requires a name, hotel, a way to reach them and consent on the demo form", () => {
    expect(issuesOf({ ...demo, telegram: null }).map((i) => i.path)).toEqual(["phone"]);
    expect(issuesOf({ ...demo, consent: false }).map((i) => i.path)).toContain("consent");
    expect(issuesOf({ ...demo, contact_name: undefined, hotel_name: undefined }).map((i) => i.path)).toEqual(expect.arrayContaining(["contact_name", "hotel_name"]));
  });

  it("requires a role on the pilot form", () => {
    expect(issuesOf({ ...minimal, role: undefined }).map((i) => i.path)).toEqual(["role"]);
    expect(issuesOf({ ...minimal, role: null }).map((i) => i.path)).toEqual(["role"]);
  });

  it("rejects unknown intents", () => {
    expect(issuesOf({ ...demo, intent: "newsletter" }).map((i) => i.path)).toContain("intent");
  });
});

describe("applicationMessage", () => {
  it("labels demo requests and shows the ad source", () => {
    const text = applicationMessage(
      "id-1",
      applicationInput.parse({
        contact_name: "Nino",
        hotel_name: "Old Tbilisi Guesthouse",
        phone: "+995 555 12 34 56",
        locale: "ka",
        intent: "demo",
        utm: { utm_source: "facebook", utm_campaign: "pilot" },
        consent: true,
      }),
    );
    expect(text.split("\n")[0]).toBe("New demo request (15-min call): Old Tbilisi Guesthouse");
    expect(text).toContain("Contact: Nino\n");
    expect(text).toContain("Source: utm_source=facebook, utm_campaign=pilot");
    expect(text).not.toContain("null");
  });

  it("keeps the pilot application headline and role", () => {
    const text = applicationMessage("id-2", applicationInput.parse(minimal));
    expect(text.split("\n")[0]).toBe("New pilot application: Old Tbilisi Guesthouse (Tbilisi)");
    expect(text).toContain("Contact: Nino (owner)");
    expect(text).not.toContain("Source:");
  });
});
