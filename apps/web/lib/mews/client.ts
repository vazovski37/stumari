import "server-only";
/**
 * The Mews Connector API as the web app uses it (docs/architecture/mews-inventory.md).
 *
 * `@stumari/mews-client` is not a dependency of apps/web (adding it needs a `pnpm install`), so it
 * is imported by relative path, the way scripts/ imports apps/web. Next (Turbopack) and vitest
 * compile it from source; it only depends on zod, which resolves to the same copy as ours.
 */
import {
  MewsClient,
  MewsError,
  stayUtc,
  type CreatedReservation,
  type MewsAvailability,
  type MewsReservation,
  type MewsServiceTarget,
  type MewsSetup,
  type RequestOptions,
} from "../../../../packages/mews-client/src/index";
import { CustomerAddResponse, ReservationsAddResponse, ReservationsGetAllResponse } from "../../../../packages/mews-client/src/schemas";
import { ApiError } from "../api/errors";
import { serverEnv } from "../env";
import type { MewsEnv } from "../env-schema";

export { MewsError, localDate, stayUtc, stumariReservationNotes } from "../../../../packages/mews-client/src/index";
export type { MewsAvailability, MewsReservation, MewsServiceTarget, MewsSetup } from "../../../../packages/mews-client/src/index";

export interface ReservationRequest {
  roomTypeId: string;
  rateId: string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  notes: string;
}

/**
 * Per-call options: `signal` bounds the whole call (retries and `Retry-After` waits included). A
 * write cut while in flight fails with kind `timeout` (it may have been applied); one cut before it
 * was sent fails with kind `aborted` (nothing applied).
 */
export type MewsCallOptions = { signal?: AbortSignal };

/**
 * The operations Stumari needs, split so a confirm can be made idempotent: one customer per booking
 * is created (and its id stored) before `reservations/add`, so a retry after an ambiguous failure can
 * look the reservation up by that customer instead of creating a second one.
 */
export interface MewsPort {
  readonly production: boolean;
  /** Host of the Connector API (never the tokens). */
  readonly host: string;
  /** Without `serviceId`, the property's main bookable service (preferring "Accommodation"). */
  getSetup(serviceId?: string, opts?: MewsCallOptions): Promise<MewsSetup>;
  getAvailability(target: MewsServiceTarget, from: string, to: string, opts?: MewsCallOptions): Promise<MewsAvailability>;
  /**
   * A new guest profile, name only. No email is ever sent: with `OverwriteExisting: false` Mews
   * refuses a second customer with the same email, so a returning guest could never be booked. The
   * contact goes into the reservation Notes instead.
   */
  addCustomer(guest: { lastName: string; firstName?: string }, opts?: MewsCallOptions): Promise<string>;
  addReservation(setup: MewsSetup, customerId: string, r: ReservationRequest, opts?: MewsCallOptions): Promise<CreatedReservation>;
  /** `reservations/getAll/2023-06-06` by customer. This version does not return Notes. */
  reservationsOfCustomer(customerId: string, opts?: MewsCallOptions): Promise<MewsReservation[]>;
  cancelReservation(reservationId: string, notes: string, opts?: MewsCallOptions): Promise<void>;
  /** Drops cached setups. */
  clearCache?(): void;
}

/** Transport limits of a connection. */
export interface MewsLimits {
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Retries after the first attempt (429 for every call; 408/5xx/timeouts for reads only). */
  maxRetries: number;
}

/** Request paths and the confirm flow: fail within ~50 s rather than the package's 30 s × 5. */
export const DEFAULT_MEWS_LIMITS: MewsLimits = { timeoutMs: 15_000, maxRetries: 2 };
/** "Test Mews connection": answer well inside the route's 60 s (a 502, never a platform 504). */
export const MEWS_TEST_LIMITS: MewsLimits = { timeoutMs: 8_000, maxRetries: 0 };

const SETUP_TTL_MS = 10 * 60_000;
/** A shared setup load (five calls) gives up after this long, whoever is waiting for it. */
const SETUP_LOAD_BUDGET_MS = 30_000;

/** Rejects when `signal` aborts first (the underlying promise keeps running for other waiters). */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined, operation: string): Promise<T> {
  if (!signal) return promise;
  const cancelled = () => new MewsError("aborted", operation, "cancelled by the caller's deadline");
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

const request = (opts: MewsCallOptions): RequestOptions => (opts.signal ? { signal: opts.signal } : {});

class ConnectorPort implements MewsPort {
  private readonly client: MewsClient;
  private readonly setups = new Map<string, { at: number; setup: Promise<MewsSetup> }>();

  constructor(
    readonly env: MewsEnv,
    readonly limits: MewsLimits = DEFAULT_MEWS_LIMITS,
  ) {
    this.client = new MewsClient({
      platformUrl: env.platformUrl,
      clientToken: env.clientToken,
      accessToken: env.accessToken,
      client: env.client,
      timeoutMs: limits.timeoutMs,
      maxRetries: limits.maxRetries,
    });
  }

  get production() {
    return this.env.production;
  }

  get host() {
    return new URL(this.env.platformUrl).host;
  }

  /**
   * Five calls per load, so cached per service for 10 minutes (a failed load is not cached). The load
   * is shared, so it has its own budget; each caller stops waiting when its own signal aborts.
   */
  getSetup(serviceId?: string, opts: MewsCallOptions = {}): Promise<MewsSetup> {
    const key = serviceId ?? "";
    const hit = this.setups.get(key);
    if (hit && Date.now() - hit.at < SETUP_TTL_MS) return withSignal(hit.setup, opts.signal, "configuration/get");
    const setup = this.client.getSetup({ ...(serviceId ? { serviceId } : {}), signal: AbortSignal.timeout(SETUP_LOAD_BUDGET_MS) });
    this.setups.set(key, { at: Date.now(), setup });
    setup.catch(() => this.setups.delete(key));
    return withSignal(setup, opts.signal, "configuration/get");
  }

  /** Forgets cached setups (admin "Test Mews connection" always reads fresh). */
  clearCache(): void {
    this.setups.clear();
  }

  getAvailability(target: MewsServiceTarget, from: string, to: string, opts: MewsCallOptions = {}) {
    return this.client.getAvailability(target, from, to, request(opts));
  }

  async addCustomer(guest: { lastName: string; firstName?: string }, opts: MewsCallOptions = {}): Promise<string> {
    const res = await this.client.transport.call(
      "customers/add",
      {
        LastName: guest.lastName,
        ...(guest.firstName ? { FirstName: guest.firstName } : {}),
        OverwriteExisting: false,
      },
      CustomerAddResponse,
      request(opts),
    );
    return res.Id;
  }

  async addReservation(setup: MewsSetup, customerId: string, r: ReservationRequest, opts: MewsCallOptions = {}): Promise<CreatedReservation> {
    if (!setup.roomTypes.some((t) => t.id === r.roomTypeId)) throw new MewsError("input", "", `unknown room type ${r.roomTypeId}`);
    if (!setup.rates.some((t) => t.id === r.rateId)) throw new MewsError("input", "", `unknown or disabled rate ${r.rateId}`);
    if (r.children > 0 && !setup.childAgeCategoryId) throw new MewsError("input", "", "the property has no Child age category");
    const { startUtc, endUtc } = stayUtc(r.checkin, r.checkout, setup.timeZone, setup);
    const personCounts = [{ AgeCategoryId: setup.adultAgeCategoryId, Count: r.adults }];
    if (r.children > 0) personCounts.push({ AgeCategoryId: setup.childAgeCategoryId!, Count: r.children });
    const res = await this.client.transport.call(
      "reservations/add",
      {
        ServiceId: setup.serviceId,
        CheckOverbooking: true,
        SendConfirmationEmail: false,
        Reservations: [
          {
            Identifier: "stumari",
            State: "Confirmed",
            StartUtc: startUtc,
            EndUtc: endUtc,
            CustomerId: customerId,
            RequestedCategoryId: r.roomTypeId,
            RateId: r.rateId,
            PersonCounts: personCounts,
            Notes: r.notes,
          },
        ],
      },
      ReservationsAddResponse,
      request(opts),
    );
    const created = res.Reservations[0]!.Reservation;
    return {
      reservationId: created.Id,
      number: created.Number ?? null,
      state: created.State,
      customerId,
      startUtc: created.StartUtc ?? startUtc,
      endUtc: created.EndUtc ?? endUtc,
    };
  }

  async reservationsOfCustomer(customerId: string, opts: MewsCallOptions = {}): Promise<MewsReservation[]> {
    const list = await this.client.transport.getAll(
      "reservations/getAll/2023-06-06",
      { AccountIds: [customerId] },
      ReservationsGetAllResponse,
      (p) => p.Reservations,
      request(opts),
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

  cancelReservation(reservationId: string, notes: string, opts: MewsCallOptions = {}) {
    return this.client.cancelReservation(reservationId, notes, request(opts));
  }
}

const globalForMews = globalThis as typeof globalThis & { stumariMews?: ConnectorPort };

/** The configured Mews connection, or null when the tokens are unset or a Mews setting is invalid. */
export function mewsPort(): MewsPort | null {
  const env = serverEnv().mews;
  if (!env) return null;
  const cached = globalForMews.stumariMews;
  if (cached && cached.env === env) return cached;
  return (globalForMews.stumariMews = new ConnectorPort(env));
}

/** Why Mews is off, for a 503 or a log line (value-free: never echoes a setting). */
export function mewsNotConfiguredReason(): string {
  const problems = serverEnv().mewsProblems;
  return problems.length > 0
    ? `Mews is disabled by an invalid setting: ${problems.join("; ")}`
    : "Mews is not configured (MEWS_CLIENT_TOKEN / MEWS_ACCESS_TOKEN)";
}

/** Like {@link mewsPort}, but 503 MEWS_NOT_CONFIGURED when unset or invalid. */
export function requireMewsPort(): MewsPort {
  const port = mewsPort();
  if (!port) throw new ApiError(503, "MEWS_NOT_CONFIGURED", mewsNotConfiguredReason());
  return port;
}

/**
 * A fresh connection for "Test Mews connection": short per-call timeout and no retries (a 429 or a
 * slow Mews answers 502 MEWS_ERROR, never a platform 504), and no cached setup. 503 when unset.
 */
export function requireMewsTestPort(): MewsPort {
  const env = serverEnv().mews;
  if (!env) throw new ApiError(503, "MEWS_NOT_CONFIGURED", mewsNotConfiguredReason());
  return new ConnectorPort(env, MEWS_TEST_LIMITS);
}
