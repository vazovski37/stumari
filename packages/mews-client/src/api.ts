/**
 * The Mews operations Stumari needs, as typed helpers over {@link MewsTransport}:
 * property setup, free units per room type per night, stay price, reservation add/confirm/cancel.
 *
 * Stumari vocabulary ↔ Mews: room type = resource category, hotel = enterprise (+ one bookable
 * "Day" service, usually "Accommodation"), guest = customer. Dates are `YYYY-MM-DD` in the
 * enterprise timezone; see time.ts for the UTC conversion.
 */
import { MewsError } from "./errors";
import { MewsTransport, type MewsConfig, type RequestOptions } from "./client";
import {
  AgeCategoriesResponse,
  AvailabilityMetricsResponse,
  AvailabilityResponse,
  ConfigurationResponse,
  CustomerAddResponse,
  PriceResponse,
  RatesResponse,
  ReservationIdsResponse,
  ReservationsAddResponse,
  ReservationsGetAllResponse,
  ResourceCategoriesResponse,
  ServicesResponse,
  pickName,
} from "./schemas";
import { addDays, isoToUnix, localDate, nightsBetween, stayUtc, timeUnitStartUtc } from "./time";

export interface MewsRoomType {
  id: string;
  name: string;
  /** Mews resource category type, e.g. `Room`, `Bed`, `Dorm`, `Apartment`. */
  type: string;
  capacity: number | null;
  extraCapacity: number | null;
}

export interface MewsRate {
  id: string;
  name: string;
  /** `Public`, `Private` or `AvailabilityBlock`. */
  type: string;
  isPublic: boolean;
  isDefault: boolean;
}

export interface MewsAgeCategory {
  id: string;
  name: string;
  /** `Adult` or `Child`. */
  classification: string;
}

/** Enough of a property to address availability for it. */
export interface MewsServiceTarget {
  serviceId: string;
  /** IANA timezone of the enterprise (time units start at local midnight). */
  timeZone: string;
}

export interface MewsSetup extends MewsServiceTarget {
  enterpriseId: string;
  enterpriseName: string;
  /** Default accounting currency (ISO 4217), when reported. */
  currency: string | null;
  serviceName: string;
  /** Every active bookable Day service of the enterprise (pick another with `serviceId`). */
  bookableServices: { id: string; name: string }[];
  /** Service `StartOffset` / `EndOffset` (ISO 8601 durations): check-in / check-out time of day. */
  startOffset: string;
  endOffset: string;
  roomTypes: MewsRoomType[];
  rates: MewsRate[];
  ageCategories: MewsAgeCategory[];
  adultAgeCategoryId: string;
  childAgeCategoryId: string | null;
}

export interface MewsAvailability {
  /** One entry per night (Day time unit), `from` … `to - 1 day`, in the enterprise timezone. */
  nights: string[];
  roomTypes: {
    roomTypeId: string;
    /** Free units per night: `max(0, availability)`. */
    free: number[];
    /** Mews `Availabilities` as returned (negative = overbooked). */
    raw: number[];
  }[];
}

export interface MewsMoney {
  currency: string;
  /** Decimal strings exactly as Mews reported them (never floats downstream). */
  gross: string;
  net: string;
}

export interface StayParams {
  roomTypeId: string;
  rateId: string;
  /** `YYYY-MM-DD` in the enterprise timezone. */
  checkin: string;
  checkout: string;
  adults: number;
  children?: number;
}

export interface CreateReservationParams extends StayParams {
  guestLastName: string;
  guestFirstName?: string;
  /**
   * Optional guest email (demo: never a real address). It is appended to the reservation Notes, not
   * sent to `customers/add`: with `OverwriteExisting: false` Mews refuses a second customer with an
   * existing email, so a returning guest could never be booked.
   */
  guestEmail?: string;
  notes: string;
  /** Default `Confirmed`. `Optional` holds the room until {@link MewsClient.confirmReservation}. */
  state?: "Confirmed" | "Optional" | "Enquired";
}

export interface CreatedReservation {
  reservationId: string;
  /** Mews confirmation number. */
  number: string | null;
  state: string;
  customerId: string;
  startUtc: string;
  endUtc: string;
}

export interface MewsReservation {
  id: string;
  number: string | null;
  state: string;
  roomTypeId: string | null;
  rateId: string | null;
  customerId: string | null;
  scheduledStartUtc: string | null;
  scheduledEndUtc: string | null;
  cancelledUtc: string | null;
}

/**
 * Notes written on every Mews reservation Stumari creates (no payment is posted in Mews):
 * `Prepaid in USDC via Stumari, booking {id}, tx {sig}`, then the guest's name and email when given
 * (Stumari creates one Mews customer per booking without an email, so the contact lives here).
 */
export function stumariReservationNotes(p: {
  bookingId: string;
  txSig?: string | null;
  guest?: { name?: string | null; email?: string | null } | null;
}): string {
  const base = `Prepaid in USDC via Stumari, booking ${p.bookingId}${p.txSig ? `, tx ${p.txSig}` : ""}`;
  const name = p.guest?.name?.trim();
  const email = p.guest?.email?.trim();
  if (!name && !email) return base;
  return `${base}. Guest: ${[name, email ? `<${email}>` : ""].filter(Boolean).join(" ")}`;
}

/** A JSON number from Mews as a plain decimal string (no exponent). */
export function numberToDecimal(n: number): string {
  if (!Number.isFinite(n)) throw new MewsError("invalid_response", "", `non-finite amount ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const fixed = n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return fixed === "-0" ? "0" : fixed;
}

/** Exact decimal string → minor units (e.g. `"65.5"`, 2 → `6550n`); throws on excess precision. */
export function decimalToMinor(decimal: string, decimals: number): bigint {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!m) throw new MewsError("input", "", `not a decimal: ${JSON.stringify(decimal)}`);
  const frac = (m[3] ?? "").replace(/0+$/, "");
  if (frac.length > decimals) throw new MewsError("input", "", `${decimal} has more than ${decimals} decimals`);
  const v = BigInt(m[2]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return m[1] ? -v : v;
}

function assertCount(name: string, n: number, min: number): void {
  if (!Number.isInteger(n) || n < min || n > 100) throw new MewsError("input", "", `${name} must be an integer ${min}..100`);
}

export class MewsClient {
  readonly transport: MewsTransport;

  constructor(config: MewsConfig | MewsTransport) {
    this.transport = config instanceof MewsTransport ? config : new MewsTransport(config);
  }

  /**
   * `configuration/get`, `services/getAll`, `resourceCategories/getAll`, `rates/getAll`,
   * `ageCategories/getAll`. Picks `serviceId` if given, else the first active bookable service
   * with a Day time unit (preferring "Accommodation", then a name with "Stay"/"Room"/"Lodging").
   */
  async getSetup(opts: { serviceId?: string } & RequestOptions = {}): Promise<MewsSetup> {
    const t = this.transport;
    const request: RequestOptions = { signal: opts.signal, timeoutMs: opts.timeoutMs, maxRetries: opts.maxRetries };
    const config = await t.call("configuration/get", {}, ConfigurationResponse, { ...request, idempotent: true });
    const enterprise = config.Enterprise;
    const services = await t.getAll("services/getAll", {}, ServicesResponse, (p) => p.Services, request);
    const bookable = services
      .filter((s) => s.IsActive && s.Data?.Discriminator === "Bookable" && s.Data.Value?.TimeUnitPeriod === "Day")
      .sort((a, b) => (a.Ordering ?? 0) - (b.Ordering ?? 0));
    const name = (s: (typeof services)[number]) => pickName(s.Names, s.Name);
    const service = opts.serviceId
      ? services.find((s) => s.Id === opts.serviceId)
      : (bookable.find((s) => /accommodation/i.test(name(s))) ??
        bookable.find((s) => /stay|room|lodging/i.test(name(s))) ??
        bookable[0]);
    if (!service) {
      throw new MewsError(
        "input",
        "services/getAll",
        opts.serviceId ? `service ${opts.serviceId} not found` : "no active bookable Day service",
      );
    }
    const value = service.Data?.Value;
    if (service.Data?.Discriminator !== "Bookable" || value?.TimeUnitPeriod !== "Day") {
      throw new MewsError("input", "services/getAll", `service ${service.Id} is not a bookable Day service`);
    }
    if (!value.StartOffset || !value.EndOffset) {
      throw new MewsError("invalid_response", "services/getAll", `service ${service.Id} has no Start/EndOffset`);
    }

    const byService = { ServiceIds: [service.Id], ActivityStates: ["Active"] };
    const [categories, rates, ages] = await Promise.all([
      t.getAll("resourceCategories/getAll", byService, ResourceCategoriesResponse, (p) => p.ResourceCategories, request),
      t.getAll("rates/getAll", byService, RatesResponse, (p) => p.Rates, request),
      t.getAll("ageCategories/getAll", byService, AgeCategoriesResponse, (p) => p.AgeCategories, request),
    ]);

    const roomTypes: MewsRoomType[] = categories
      .filter((c) => c.IsActive && c.ServiceId === service.Id)
      .sort((a, b) => (a.Ordering ?? 0) - (b.Ordering ?? 0))
      .map((c) => ({
        id: c.Id,
        name: pickName(c.Names, pickName(c.ShortNames, c.Id)),
        type: c.Type ?? "",
        capacity: c.Capacity ?? null,
        extraCapacity: c.ExtraCapacity ?? null,
      }));
    const rateList: MewsRate[] = rates
      .filter((r) => r.IsActive && r.IsEnabled !== false && r.ServiceId === service.Id && r.Type !== "AvailabilityBlock")
      .map((r) => ({
        id: r.Id,
        name: pickName(r.Names, r.Name ?? r.ShortName ?? r.Id),
        type: r.Type ?? "",
        isPublic: r.IsPublic === true,
        isDefault: r.IsDefault === true,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.isPublic) - Number(a.isPublic));
    // Already filtered by ServiceIds server-side; some properties share enterprise-wide categories.
    const active = ages.filter((a) => a.IsActive !== false);
    const pool = active.length > 0 ? active : ages;
    const ageCategories: MewsAgeCategory[] = pool.map((a) => ({
      id: a.Id,
      name: pickName(a.Names, a.Classification ?? a.Id),
      classification: a.Classification ?? "",
    }));
    const adult = ageCategories.find((a) => a.classification === "Adult");
    if (!adult) throw new MewsError("invalid_response", "ageCategories/getAll", "no Adult age category");
    const child = ageCategories.find((a) => a.classification === "Child");
    const currencies = enterprise.Currencies ?? [];
    const currency = (currencies.find((c) => c.IsDefault) ?? currencies[0])?.Currency ?? null;

    return {
      enterpriseId: enterprise.Id,
      enterpriseName: enterprise.Name ?? "",
      timeZone: enterprise.TimeZoneIdentifier,
      currency,
      serviceId: service.Id,
      serviceName: name(service),
      bookableServices: bookable.map((s) => ({ id: s.Id, name: name(s) })),
      startOffset: value.StartOffset,
      endOffset: value.EndOffset,
      roomTypes,
      rates: rateList,
      ageCategories,
      adultAgeCategoryId: adult.id,
      childAgeCategoryId: child?.id ?? null,
    };
  }

  /**
   * Free units per room type for each night `from` … `to - 1 day` (a stay's nights), from
   * `services/getAvailability`: its `Availabilities` are Mews's absolute availability per time
   * unit with availability adjustments already applied — the number the property can still
   * sell. Negative values (overbooking) are reported as 0 in `free` and kept in `raw`.
   */
  async getAvailability(target: MewsServiceTarget, from: string, to: string, opts: RequestOptions = {}): Promise<MewsAvailability> {
    const nightCount = nightsBetween(from, to);
    if (nightCount < 1 || nightCount > 366) throw new MewsError("input", "", "`to` must be 1..366 days after `from`");
    const nights = Array.from({ length: nightCount }, (_, i) => addDays(from, i));
    const res = await this.transport.call(
      "services/getAvailability",
      {
        ServiceId: target.serviceId,
        FirstTimeUnitStartUtc: timeUnitStartUtc(from, target.timeZone),
        LastTimeUnitStartUtc: timeUnitStartUtc(nights[nights.length - 1]!, target.timeZone),
      },
      AvailabilityResponse,
      { ...opts, idempotent: true },
    );
    this.checkTimeUnits("services/getAvailability", res.TimeUnitStartsUtc, nights, target.timeZone);
    return {
      nights,
      roomTypes: res.CategoryAvailabilities.map((c) => {
        if (c.Availabilities.length !== nights.length) {
          throw new MewsError("invalid_response", "services/getAvailability", "availability length mismatch");
        }
        return { roomTypeId: c.CategoryId, free: c.Availabilities.map((n) => Math.max(0, n)), raw: c.Availabilities };
      }),
    };
  }

  /**
   * Raw occupancy metrics (`services/getAvailability/2024-01-22`) for diagnostics, e.g.
   * `UsableResources`, `Occupied`, `ConfirmedReservations`, `OptionalReservations`.
   */
  async getAvailabilityMetrics(
    target: MewsServiceTarget,
    from: string,
    to: string,
    metrics: string[] = ["UsableResources", "Occupied", "ConfirmedReservations", "OptionalReservations", "OutOfOrderBlocks", "PublicAvailabilityAdjustment"],
    opts: RequestOptions = {},
  ): Promise<{ nights: string[]; roomTypes: { roomTypeId: string; metrics: Record<string, number[]> }[] }> {
    const nightCount = nightsBetween(from, to);
    if (nightCount < 1 || nightCount > 366) throw new MewsError("input", "", "`to` must be 1..366 days after `from`");
    const nights = Array.from({ length: nightCount }, (_, i) => addDays(from, i));
    const res = await this.transport.call(
      "services/getAvailability/2024-01-22",
      {
        ServiceId: target.serviceId,
        FirstTimeUnitStartUtc: timeUnitStartUtc(from, target.timeZone),
        LastTimeUnitStartUtc: timeUnitStartUtc(nights[nights.length - 1]!, target.timeZone),
        Metrics: metrics,
      },
      AvailabilityMetricsResponse,
      { ...opts, idempotent: true },
    );
    this.checkTimeUnits("services/getAvailability/2024-01-22", res.TimeUnitStartsUtc, nights, target.timeZone);
    return {
      nights,
      roomTypes: res.ResourceCategoryAvailabilities.map((c) => ({ roomTypeId: c.ResourceCategoryId, metrics: c.Metrics })),
    };
  }

  /** Each returned time unit must start exactly at local midnight of the expected night. */
  private checkTimeUnits(operation: string, starts: string[], nights: string[], tz: string): void {
    const ok =
      starts.length === nights.length &&
      starts.every((s, i) => isoToUnix(s) === isoToUnix(timeUnitStartUtc(nights[i]!, tz)));
    if (!ok) {
      const got = starts.map((s) => localDate(isoToUnix(s), tz));
      throw new MewsError(
        "invalid_response",
        operation,
        `time units ${starts[0] ?? "?"} (${got[0] ?? "?"})… do not start at local midnight of ${nights[0]}… in ${tz}`,
      );
    }
  }

  private reservationParams(setup: MewsSetup, p: StayParams) {
    assertCount("adults", p.adults, 1);
    const children = p.children ?? 0;
    assertCount("children", children, 0);
    if (children > 0 && !setup.childAgeCategoryId) throw new MewsError("input", "", "property has no Child age category");
    if (!setup.roomTypes.some((r) => r.id === p.roomTypeId)) throw new MewsError("input", "", `unknown room type ${p.roomTypeId}`);
    if (!setup.rates.some((r) => r.id === p.rateId)) throw new MewsError("input", "", `unknown or disabled rate ${p.rateId}`);
    const { startUtc, endUtc } = stayUtc(p.checkin, p.checkout, setup.timeZone, setup);
    const personCounts = [{ AgeCategoryId: setup.adultAgeCategoryId, Count: p.adults }];
    if (children > 0) personCounts.push({ AgeCategoryId: setup.childAgeCategoryId!, Count: children });
    return {
      StartUtc: startUtc,
      EndUtc: endUtc,
      RequestedCategoryId: p.roomTypeId,
      RateId: p.rateId,
      PersonCounts: personCounts,
    };
  }

  /** Total price of a stay (`reservations/price`). Note Mews does not check capacity here. */
  async price(setup: MewsSetup, p: StayParams, opts: RequestOptions = {}): Promise<MewsMoney> {
    const res = await this.transport.call(
      "reservations/price",
      { ServiceId: setup.serviceId, Reservations: [{ Identifier: "stumari", ...this.reservationParams(setup, p) }] },
      PriceResponse,
      { ...opts, idempotent: true },
    );
    const total = res.ReservationPrices[0]!.TotalAmount;
    return { currency: total.Currency, gross: numberToDecimal(total.GrossValue), net: numberToDecimal(total.NetValue) };
  }

  /**
   * `customers/add` (a new profile each time: name only, no email) then `reservations/add`
   * (CheckOverbooking true, SendConfirmationEmail false). No payment is posted in Mews: put
   * {@link stumariReservationNotes} in `notes`; `guestEmail` is appended to the notes. Writes are not
   * retried on 5xx/timeouts; if `reservations/add` fails, the created customer profile stays.
   */
  async createReservation(setup: MewsSetup, p: CreateReservationParams, opts: RequestOptions = {}): Promise<CreatedReservation> {
    const lastName = p.guestLastName.trim();
    if (!lastName) throw new MewsError("input", "", "guestLastName is required");
    if (!p.notes.trim()) throw new MewsError("input", "", "notes are required");
    const stay = this.reservationParams(setup, p);
    const email = p.guestEmail?.trim();
    const notes = email ? `${p.notes.trim()} Guest email: ${email}` : p.notes;
    const customer = await this.transport.call(
      "customers/add",
      {
        LastName: lastName,
        ...(p.guestFirstName?.trim() ? { FirstName: p.guestFirstName.trim() } : {}),
        OverwriteExisting: false,
      },
      CustomerAddResponse,
      { ...opts, idempotent: false },
    );
    const res = await this.transport.call(
      "reservations/add",
      {
        ServiceId: setup.serviceId,
        CheckOverbooking: true,
        SendConfirmationEmail: false,
        Reservations: [
          { Identifier: "stumari", State: p.state ?? "Confirmed", CustomerId: customer.Id, Notes: notes, ...stay },
        ],
      },
      ReservationsAddResponse,
      { ...opts, idempotent: false },
    );
    const r = res.Reservations[0]!.Reservation;
    return {
      reservationId: r.Id,
      number: r.Number ?? null,
      state: r.State,
      customerId: customer.Id,
      startUtc: r.StartUtc ?? stay.StartUtc,
      endUtc: r.EndUtc ?? stay.EndUtc,
    };
  }

  /** `reservations/confirm` — only for reservations created as `Optional`. */
  async confirmReservation(reservationId: string, opts: RequestOptions = {}): Promise<void> {
    await this.transport.call(
      "reservations/confirm",
      { ReservationIds: [reservationId], SendConfirmationEmail: false },
      ReservationIdsResponse,
      { ...opts, idempotent: false },
    );
  }

  /** `reservations/cancel` with PostCancellationFee false and SendEmail false. */
  async cancelReservation(reservationId: string, notes: string, opts: RequestOptions = {}): Promise<void> {
    if (!notes.trim()) throw new MewsError("input", "", "cancellation notes are required");
    const res = await this.transport.call(
      "reservations/cancel",
      { ReservationIds: [reservationId], PostCancellationFee: false, SendEmail: false, Notes: notes },
      ReservationIdsResponse,
      { ...opts, idempotent: false },
    );
    if (!res.ReservationIds.includes(reservationId)) {
      throw new MewsError("invalid_response", "reservations/cancel", `reservation ${reservationId} not reported as cancelled`);
    }
  }

  /**
   * `reservations/getAll/2023-06-06` by id. This version does not return the reservation `Notes`
   * (docs.mews.com, Reservation ver 2023-06-06), so a reservation cannot be matched by its notes.
   */
  async getReservations(reservationIds: string[], opts: RequestOptions = {}): Promise<MewsReservation[]> {
    if (reservationIds.length === 0) return [];
    const list = await this.transport.getAll(
      "reservations/getAll/2023-06-06",
      { ReservationIds: reservationIds },
      ReservationsGetAllResponse,
      (p) => p.Reservations,
      opts,
    );
    return list.map((r) => ({
      id: r.Id,
      number: r.Number ?? null,
      state: r.State,
      roomTypeId: r.RequestedResourceCategoryId ?? null,
      rateId: r.RateId ?? null,
      customerId: r.AccountId ?? null,
      scheduledStartUtc: r.ScheduledStartUtc ?? null,
      scheduledEndUtc: r.ScheduledEndUtc ?? null,
      cancelledUtc: r.CancelledUtc ?? null,
    }));
  }
}
