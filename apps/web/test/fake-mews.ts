import { addDays, nightsBetween } from "@stumari/core";
import { MewsError, stayUtc } from "../../../packages/mews-client/src/index";
import type { MewsCallOptions, MewsPort, MewsSetup, ReservationRequest } from "@/lib/mews/client";

export const MEWS_SERVICE = "0503c3bd-11ae-497a-a97d-b19600a43124";
export const MEWS_RATE = "ac0e8ce6-5078-4a55-be60-b19600a4314d";
export const MEWS_DOUBLE = "44e44a84-deb9-43dc-97de-b19600ce0b3d";
export const MEWS_ADULT = "a0b8fd74-253a-4b3a-972e-b19600a4312e";

export interface FakeReservation {
  id: string;
  customerId: string;
  roomTypeId: string;
  state: string;
  cancelledUtc: string | null;
  startUtc: string;
  endUtc: string;
  request: ReservationRequest;
}

type Op = "setup" | "availability" | "customers" | "add" | "lookups" | "cancel";

/** An in-memory Mews property (Asia/Tbilisi, one service, one rate) for tests; no network. */
export class FakeMews implements MewsPort {
  production = false;
  host = "api.mews-demo.com";
  timeZone = "Asia/Tbilisi";
  /** Free units per Mews room type, the same every night. */
  free = new Map<string, number>([[MEWS_DOUBLE, 3]]);
  customers: { id: string; lastName: string; firstName?: string; email?: string }[] = [];
  reservations: FakeReservation[] = [];
  calls = { setup: 0, availability: 0, customers: 0, add: 0, lookups: 0, cancel: 0 };
  /**
   * Next `reservations/add`: `403` = refused as overbooking, `403-restriction` = refused by a rate
   * restriction (free units unchanged), `timeout-applied` = applied but no answer.
   */
  failAdd: null | "403" | "403-restriction" | "timeout-applied" = null;
  /** Next N `reservations/cancel` calls fail with a network error. */
  failCancel = 0;
  /** Operations that never answer: they wait for the caller's signal, then fail as a timeout. */
  hang = new Set<Op>();
  /** Signals the calls were given, per operation (to check every call is bounded). */
  signals: Partial<Record<Op, (AbortSignal | undefined)[]>> = {};
  /** Hooks run at the start of an operation (e.g. to change state while a call is in flight). */
  before: Partial<Record<Op, () => void | Promise<void>>> = {};

  private async enter(op: Op, opts?: MewsCallOptions) {
    this.calls[op]++;
    (this.signals[op] ??= []).push(opts?.signal);
    await this.before[op]?.();
    if (!this.hang.has(op)) return;
    const signal = opts?.signal;
    await new Promise<void>((_resolve, reject) => {
      const fail = () => reject(new MewsError("timeout", op, "cancelled by the caller's deadline while in flight"));
      if (signal?.aborted) fail();
      signal?.addEventListener("abort", fail, { once: true });
    });
  }

  private setupOf(serviceId?: string): MewsSetup {
    return {
      enterpriseId: "ent",
      enterpriseName: "Fake Hotel",
      timeZone: this.timeZone,
      currency: "GEL",
      serviceId: serviceId ?? MEWS_SERVICE,
      serviceName: "Accommodation",
      bookableServices: [{ id: MEWS_SERVICE, name: "Accommodation" }],
      startOffset: "P0M0DT14H0M0S",
      endOffset: "P0M0DT12H0M0S",
      roomTypes: [{ id: MEWS_DOUBLE, name: "Double Room", type: "Room", capacity: 2, extraCapacity: 0 }],
      rates: [{ id: MEWS_RATE, name: "Fully Flexible", type: "Public", isPublic: true, isDefault: true }],
      ageCategories: [{ id: MEWS_ADULT, name: "Adults", classification: "Adult" }],
      adultAgeCategoryId: MEWS_ADULT,
      childAgeCategoryId: null,
    };
  }

  async getSetup(serviceId?: string, opts?: MewsCallOptions): Promise<MewsSetup> {
    await this.enter("setup", opts);
    return this.setupOf(serviceId);
  }

  async getAvailability(_target: { serviceId: string; timeZone: string }, from: string, to: string, opts?: MewsCallOptions) {
    await this.enter("availability", opts);
    const n = nightsBetween(from, to);
    const nights = Array.from({ length: n }, (_, i) => addDays(from, i));
    return {
      nights,
      roomTypes: [...this.free].map(([roomTypeId, free]) => ({ roomTypeId, free: nights.map(() => Math.max(0, free)), raw: nights.map(() => free) })),
    };
  }

  /** Like Mews with `OverwriteExisting: false`: a second customer with an existing email is refused. */
  async addCustomer(guest: { lastName: string; firstName?: string; email?: string }, opts?: MewsCallOptions): Promise<string> {
    await this.enter("customers", opts);
    if (guest.email && this.customers.some((c) => c.email === guest.email)) {
      throw new MewsError("http", "customers/add", "HTTP 403: A customer with this email already exists.", 403);
    }
    const id = `cust-${this.customers.length + 1}`;
    this.customers.push({ id, ...guest });
    return id;
  }

  async addReservation(setup: MewsSetup, customerId: string, r: ReservationRequest, opts?: MewsCallOptions) {
    await this.enter("add", opts);
    const fail = this.failAdd;
    this.failAdd = null;
    if (fail === "403") throw new MewsError("http", "reservations/add", "HTTP 403: The reservation would cause overbooking.", 403);
    if (fail === "403-restriction") {
      throw new MewsError("http", "reservations/add", "HTTP 403: The stay violates a restriction (minimum length of stay).", 403);
    }
    const id = `res-${this.reservations.length + 1}`;
    const { startUtc, endUtc } = stayUtc(r.checkin, r.checkout, setup.timeZone, setup);
    this.reservations.push({ id, customerId, roomTypeId: r.roomTypeId, state: "Confirmed", cancelledUtc: null, startUtc, endUtc, request: r });
    this.free.set(r.roomTypeId, (this.free.get(r.roomTypeId) ?? 0) - 1);
    if (fail === "timeout-applied") throw new MewsError("timeout", "reservations/add", "no response within 15000 ms");
    return { reservationId: id, number: "1001", state: "Confirmed", customerId, startUtc, endUtc };
  }

  async reservationsOfCustomer(customerId: string, opts?: MewsCallOptions) {
    await this.enter("lookups", opts);
    return this.reservations
      .filter((r) => r.customerId === customerId)
      .map((r) => ({
        id: r.id,
        number: "1001",
        state: r.state,
        roomTypeId: r.roomTypeId,
        rateId: MEWS_RATE,
        customerId: r.customerId,
        scheduledStartUtc: r.startUtc,
        scheduledEndUtc: r.endUtc,
        cancelledUtc: r.cancelledUtc,
      }));
  }

  async cancelReservation(reservationId: string, notes: string, opts?: MewsCallOptions) {
    await this.enter("cancel", opts);
    if (!notes.trim()) throw new MewsError("input", "", "notes required");
    if (this.failCancel > 0) {
      this.failCancel--;
      throw new MewsError("network", "reservations/cancel", "request failed (ECONNRESET)");
    }
    const r = this.reservations.find((x) => x.id === reservationId);
    if (!r || r.state === "Canceled") throw new MewsError("http", "reservations/cancel", "HTTP 403: not cancellable", 403);
    r.state = "Canceled";
    r.cancelledUtc = "2026-09-28T00:00:00Z";
    this.free.set(r.roomTypeId, (this.free.get(r.roomTypeId) ?? 0) + 1);
  }

  get active() {
    return this.reservations.filter((r) => r.state !== "Canceled");
  }
}
