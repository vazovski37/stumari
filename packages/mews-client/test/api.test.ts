import { describe, expect, it } from "vitest";
import { MewsClient, MewsError, decimalToMinor, numberToDecimal, stumariReservationNotes, type MewsSetup } from "../src";
import { baseConfig, fakeMews, type Handler } from "./fake";

const SERVICE = "svc-accommodation";
const DOUBLE = "cat-double";
const TWIN = "cat-twin";
const RATE = "rate-bar";
const ADULT = "age-adult";
const CHILD = "age-child";

const setupRoutes: Record<string, Handler> = {
  "configuration/get": () => ({
    json: {
      NowUtc: "2026-09-28T10:00:00Z",
      Enterprise: {
        Id: "ent-1",
        Name: "Demo Hotel",
        TimeZoneIdentifier: "Asia/Tbilisi",
        Currencies: [
          { Currency: "USD", IsDefault: false, IsEnabled: true },
          { Currency: "GEL", IsDefault: true, IsEnabled: true },
        ],
      },
    },
  }),
  "services/getAll": () => ({
    json: {
      Services: [
        { Id: "svc-parking", IsActive: true, Names: { "en-US": "Parking" }, Ordering: 0, Data: { Discriminator: "Bookable", Value: { StartOffset: "PT0S", EndOffset: "PT0S", TimeUnitPeriod: "Day" } } },
        { Id: "svc-breakfast", IsActive: true, Names: { "en-US": "Breakfast" }, Ordering: 1, Data: { Discriminator: "Additional", Value: {} } },
        { Id: SERVICE, IsActive: true, Names: { "en-GB": "Accommodation" }, Ordering: 2, Data: { Discriminator: "Bookable", Value: { StartOffset: "P0M0DT14H0M0S", EndOffset: "P0M0DT12H0M0S", OccupancyStartOffset: "P0M0DT14H0M0S", OccupancyEndOffset: "P0M0DT12H0M0S", TimeUnitPeriod: "Day" } } },
      ],
      Cursor: SERVICE,
    },
  }),
  "resourceCategories/getAll": () => ({
    json: {
      ResourceCategories: [
        { Id: TWIN, ServiceId: SERVICE, IsActive: true, Type: "Room", Names: { "en-US": "Twin" }, Ordering: 2, Capacity: 2, ExtraCapacity: 0 },
        { Id: DOUBLE, ServiceId: SERVICE, IsActive: true, Type: "Room", Names: { "en-US": "Double" }, Ordering: 1, Capacity: 2, ExtraCapacity: 1 },
        { Id: "cat-old", ServiceId: SERVICE, IsActive: false, Type: "Room", Names: { "en-US": "Old" }, Ordering: 0, Capacity: 2 },
      ],
      Cursor: null,
    },
  }),
  "rates/getAll": () => ({
    json: {
      Rates: [
        { Id: "rate-private", ServiceId: SERVICE, IsActive: true, IsEnabled: true, IsPublic: false, IsDefault: false, Type: "Private", Names: { "en-US": "Corporate" } },
        { Id: RATE, ServiceId: SERVICE, IsActive: true, IsEnabled: true, IsPublic: true, IsDefault: true, Type: "Public", Names: { "en-US": "Best available" } },
        { Id: "rate-off", ServiceId: SERVICE, IsActive: true, IsEnabled: false, IsPublic: true, Type: "Public", Names: { "en-US": "Disabled" } },
      ],
    },
  }),
  "ageCategories/getAll": () => ({
    json: {
      AgeCategories: [
        { Id: ADULT, ServiceId: SERVICE, IsActive: true, Classification: "Adult", Names: { "en-GB": "Adults" } },
        { Id: CHILD, ServiceId: SERVICE, IsActive: true, Classification: "Child", MinimalAge: 0, MaximalAge: 12, Names: { "en-GB": "Children" } },
      ],
    },
  }),
};

async function loadSetup(extra: Record<string, Handler> = {}) {
  const mews = fakeMews({ ...setupRoutes, ...extra });
  const client = new MewsClient(baseConfig(mews.fetch));
  const setup = await client.getSetup();
  return { client, setup, calls: mews.calls };
}

describe("getSetup", () => {
  it("picks the accommodation service and normalizes room types, rates and age categories", async () => {
    const { setup, calls } = await loadSetup();
    expect(setup).toMatchObject<Partial<MewsSetup>>({
      enterpriseId: "ent-1",
      enterpriseName: "Demo Hotel",
      timeZone: "Asia/Tbilisi",
      currency: "GEL",
      serviceId: SERVICE,
      serviceName: "Accommodation",
      startOffset: "P0M0DT14H0M0S",
      endOffset: "P0M0DT12H0M0S",
      adultAgeCategoryId: ADULT,
      childAgeCategoryId: CHILD,
    });
    expect(setup.roomTypes.map((r) => r.name)).toEqual(["Double", "Twin"]);
    expect(setup.rates.map((r) => r.id)).toEqual([RATE, "rate-private"]);
    const rc = calls.find((c) => c.operation === "resourceCategories/getAll")!;
    expect(rc.body).toMatchObject({ ServiceIds: [SERVICE], ActivityStates: ["Active"], Limitation: { Count: 1000 } });
  });

  it("honours an explicit service id and rejects non-Day services", async () => {
    const mews = fakeMews(setupRoutes);
    const client = new MewsClient(baseConfig(mews.fetch));
    expect((await client.getSetup({ serviceId: "svc-parking" })).serviceId).toBe("svc-parking");
    await expect(client.getSetup({ serviceId: "svc-breakfast" })).rejects.toThrow(/not a bookable Day service/);
    await expect(client.getSetup({ serviceId: "nope" })).rejects.toThrow(/not found/);
  });
});

describe("getAvailability", () => {
  it("requests local-midnight time units and returns free units per night", async () => {
    const { client, setup, calls } = await loadSetup({
      "services/getAvailability": () => ({
        json: {
          TimeUnitStartsUtc: ["2026-10-27T20:00:00Z", "2026-10-28T20:00:00Z", "2026-10-29T20:00:00Z"],
          CategoryAvailabilities: [
            { CategoryId: DOUBLE, Availabilities: [2, 1, 0], "Adjustments ": [0, 0, 0] },
            { CategoryId: TWIN, Availabilities: [1, -1, 1], Adjustments: [0, 0, 0] },
          ],
        },
      }),
    });
    const av = await client.getAvailability(setup, "2026-10-28", "2026-10-31");
    expect(av.nights).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(av.roomTypes).toEqual([
      { roomTypeId: DOUBLE, free: [2, 1, 0], raw: [2, 1, 0] },
      { roomTypeId: TWIN, free: [1, 0, 1], raw: [1, -1, 1] },
    ]);
    const req = calls.find((c) => c.operation === "services/getAvailability")!.body;
    expect(req).toMatchObject({
      ServiceId: SERVICE,
      FirstTimeUnitStartUtc: "2026-10-27T20:00:00Z",
      LastTimeUnitStartUtc: "2026-10-29T20:00:00Z",
    });
  });

  it("detects a timezone mismatch in the returned time units", async () => {
    const { client, setup } = await loadSetup({
      "services/getAvailability": () => ({
        json: { TimeUnitStartsUtc: ["2026-10-28T00:00:00Z"], CategoryAvailabilities: [] },
      }),
    });
    const err = await client.getAvailability(setup, "2026-10-28", "2026-10-29").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MewsError);
    expect((err as MewsError).kind).toBe("invalid_response");
  });

  it("validates the range", async () => {
    const { client, setup } = await loadSetup();
    await expect(client.getAvailability(setup, "2026-10-28", "2026-10-28")).rejects.toThrow(/1\.\.366/);
  });
});

describe("price", () => {
  it("prices a stay with person counts and returns decimal strings", async () => {
    const { client, setup, calls } = await loadSetup({
      "reservations/price": () => ({
        json: { ReservationPrices: [{ Identifier: "stumari", TotalAmount: { Currency: "GEL", NetValue: 110.17, GrossValue: 130, TaxValues: [] } }] },
      }),
    });
    const total = await client.price(setup, {
      roomTypeId: DOUBLE,
      rateId: RATE,
      checkin: "2026-10-28",
      checkout: "2026-10-30",
      adults: 2,
      children: 1,
    });
    expect(total).toEqual({ currency: "GEL", gross: "130", net: "110.17" });
    const r = (calls.find((c) => c.operation === "reservations/price")!.body.Reservations as Record<string, unknown>[])[0];
    expect(r).toEqual({
      Identifier: "stumari",
      StartUtc: "2026-10-28T10:00:00Z",
      EndUtc: "2026-10-30T08:00:00Z",
      RequestedCategoryId: DOUBLE,
      RateId: RATE,
      PersonCounts: [
        { AgeCategoryId: ADULT, Count: 2 },
        { AgeCategoryId: CHILD, Count: 1 },
      ],
    });
  });

  it("rejects unknown ids and bad counts before calling Mews", async () => {
    const { client, setup, calls } = await loadSetup();
    const n = calls.length;
    const base = { roomTypeId: DOUBLE, rateId: RATE, checkin: "2026-10-28", checkout: "2026-10-30", adults: 2 };
    await expect(client.price(setup, { ...base, roomTypeId: "x" })).rejects.toThrow(/unknown room type/);
    await expect(client.price(setup, { ...base, rateId: "rate-off" })).rejects.toThrow(/unknown or disabled rate/);
    await expect(client.price(setup, { ...base, adults: 0 })).rejects.toThrow(/adults/);
    await expect(client.price(setup, { ...base, checkout: "2026-10-28" })).rejects.toThrow(/after checkin/);
    expect(calls.length).toBe(n);
  });
});

describe("createReservation / cancelReservation", () => {
  it("adds a customer, then a Confirmed reservation without email and with overbooking checks", async () => {
    const { client, setup, calls } = await loadSetup({
      "customers/add": () => ({ json: { Id: "cust-1", ChainId: "chain", LastName: "Stumari" } }),
      "reservations/add": () => ({
        json: {
          Reservations: [
            { Identifier: "stumari", Reservation: { Id: "res-1", Number: "1234", State: "Confirmed", StartUtc: "2026-10-28T10:00:00Z", EndUtc: "2026-10-30T08:00:00Z" } },
          ],
        },
      }),
    });
    const created = await client.createReservation(setup, {
      roomTypeId: DOUBLE,
      rateId: RATE,
      checkin: "2026-10-28",
      checkout: "2026-10-30",
      adults: 2,
      guestFirstName: "Test",
      guestLastName: "Stumari",
      notes: stumariReservationNotes({ bookingId: "b-1", txSig: "sig" }),
    });
    expect(created).toEqual({
      reservationId: "res-1",
      number: "1234",
      state: "Confirmed",
      customerId: "cust-1",
      startUtc: "2026-10-28T10:00:00Z",
      endUtc: "2026-10-30T08:00:00Z",
    });
    const ops = calls.map((c) => c.operation);
    expect(ops.slice(-2)).toEqual(["customers/add", "reservations/add"]);
    expect(calls.at(-2)!.body).toMatchObject({ LastName: "Stumari", FirstName: "Test", OverwriteExisting: false });
    expect(calls.at(-2)!.body).not.toHaveProperty("Email");
    const add = calls.at(-1)!.body;
    expect(add).toMatchObject({ ServiceId: SERVICE, CheckOverbooking: true, SendConfirmationEmail: false });
    expect((add.Reservations as unknown[])[0]).toMatchObject({
      State: "Confirmed",
      CustomerId: "cust-1",
      RequestedCategoryId: DOUBLE,
      RateId: RATE,
      Notes: "Prepaid in USDC via Stumari, booking b-1, tx sig",
      StartUtc: "2026-10-28T10:00:00Z",
      EndUtc: "2026-10-30T08:00:00Z",
      PersonCounts: [{ AgeCategoryId: ADULT, Count: 2 }],
    });
  });

  it("never sends the guest email to customers/add (returning guests); it goes into the notes", async () => {
    const { client, setup, calls } = await loadSetup({
      "customers/add": (b) => (b.Email ? { status: 403, json: { Message: "Customer with this email already exists." } } : { json: { Id: "cust-2" } }),
      "reservations/add": () => ({ json: { Reservations: [{ Identifier: "stumari", Reservation: { Id: "res-2", State: "Confirmed" } }] } }),
    });
    const created = await client.createReservation(setup, {
      roomTypeId: DOUBLE,
      rateId: RATE,
      checkin: "2026-10-28",
      checkout: "2026-10-29",
      adults: 1,
      guestLastName: "Beridze",
      guestEmail: "nino@example.com",
      notes: stumariReservationNotes({ bookingId: "b-2", txSig: "sig" }),
    });
    expect(created.customerId).toBe("cust-2");
    expect(calls.at(-2)!.body).not.toHaveProperty("Email");
    expect((calls.at(-1)!.body.Reservations as { Notes: string }[])[0]!.Notes).toBe(
      "Prepaid in USDC via Stumari, booking b-2, tx sig Guest email: nino@example.com",
    );
  });

  it("stumariReservationNotes carries the guest's name and email when given", () => {
    expect(stumariReservationNotes({ bookingId: "b", txSig: "s" })).toBe("Prepaid in USDC via Stumari, booking b, tx s");
    expect(stumariReservationNotes({ bookingId: "b", txSig: "s", guest: { name: "Nino Beridze", email: "nino@example.com" } })).toBe(
      "Prepaid in USDC via Stumari, booking b, tx s. Guest: Nino Beridze <nino@example.com>",
    );
    expect(stumariReservationNotes({ bookingId: "b", guest: { name: " ", email: null } })).toBe("Prepaid in USDC via Stumari, booking b");
  });

  it("surfaces an overbooking rejection without retrying the write", async () => {
    const { client, setup, calls } = await loadSetup({
      "customers/add": () => ({ json: { Id: "cust-1" } }),
      "reservations/add": () => ({ status: 403, json: { Message: "The resource category is overbooked." } }),
    });
    await expect(
      client.createReservation(setup, {
        roomTypeId: DOUBLE,
        rateId: RATE,
        checkin: "2026-10-28",
        checkout: "2026-10-29",
        adults: 1,
        guestLastName: "Stumari",
        notes: "n",
      }),
    ).rejects.toThrow("Mews reservations/add: HTTP 403: The resource category is overbooked.");
    expect(calls.filter((c) => c.operation === "reservations/add")).toHaveLength(1);
  });

  it("cancels without fee or email", async () => {
    const { client, calls } = await loadSetup({
      "reservations/cancel": (b) => ({ json: { ReservationIds: b.ReservationIds } }),
    });
    await client.cancelReservation("res-1", "Stumari booking refunded");
    expect(calls.at(-1)!.body).toMatchObject({
      ReservationIds: ["res-1"],
      PostCancellationFee: false,
      SendEmail: false,
      Notes: "Stumari booking refunded",
    });
    await expect(client.cancelReservation("res-1", " ")).rejects.toThrow(/notes are required/);
  });

  it("reads reservations back by id", async () => {
    const { client, calls } = await loadSetup({
      "reservations/getAll/2023-06-06": () => ({
        json: {
          Reservations: [
            { Id: "res-1", ServiceId: SERVICE, Number: "1234", State: "Canceled", RequestedResourceCategoryId: DOUBLE, RateId: RATE, AccountId: "cust-1", ScheduledStartUtc: "2026-10-28T10:00:00Z", ScheduledEndUtc: "2026-10-30T08:00:00Z", CancelledUtc: "2026-09-28T10:05:00Z" },
          ],
          Cursor: "res-1",
        },
      }),
    });
    const [r] = await client.getReservations(["res-1"]);
    expect(r).toMatchObject({ id: "res-1", state: "Canceled", roomTypeId: DOUBLE, cancelledUtc: "2026-09-28T10:05:00Z" });
    expect(calls.at(-1)!.body).toMatchObject({ ReservationIds: ["res-1"], Limitation: { Count: 1000 } });
  });
});

describe("money", () => {
  it("keeps Mews amounts as exact decimal strings", () => {
    expect(numberToDecimal(130)).toBe("130");
    expect(numberToDecimal(110.17)).toBe("110.17");
    expect(numberToDecimal(1e-7)).toBe("0.0000001");
    expect(decimalToMinor("110.17", 2)).toBe(11017n);
    expect(decimalToMinor("65.5", 2)).toBe(6550n);
    expect(decimalToMinor("130", 6)).toBe(130_000_000n);
    expect(() => decimalToMinor("1.005", 2)).toThrow(/more than 2 decimals/);
  });
});
