/**
 * Minimal Mews Connector API client: `POST {PlatformAddress}/api/connector/v1/<operation>` with
 * `ClientToken`, `AccessToken` and `Client` in every JSON body (docs.mews.com/connector-api,
 * "Requests"). Responses are zod-validated; 429 honours `Retry-After`, else exponential backoff.
 *
 * Retry policy: a 429 is retried for every operation (the request was rejected, not executed).
 * 408, 5xx, timeouts and network failures are retried only for read operations — a write
 * (`customers/add`, `reservations/add`, `reservations/cancel`) may have been applied, so it is
 * surfaced to the caller instead of risking a duplicate reservation.
 */
import type { z } from "zod";
import { MewsError, redact } from "./errors";
import { ErrorBody } from "./schemas";

export const DEMO_PLATFORM_URL = "https://api.mews-demo.com";
export const PRODUCTION_PLATFORM_URL = "https://api.mews.com";
export const DEFAULT_CLIENT_NAME = "Stumari 0.1.0";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface MewsConfig {
  /** `https://api.mews-demo.com` (demo) or `https://api.mews.com` (production). */
  platformUrl: string;
  clientToken: string;
  accessToken: string;
  /** Name and version of the client application, e.g. `Stumari 0.1.0`. */
  client?: string;
  /** Per-attempt timeout, default 30 s. */
  timeoutMs?: number;
  /** Retries after the first attempt, default 4. */
  maxRetries?: number;
  /** First backoff delay when no `Retry-After` is given, default 1 s (then ×2, capped at 30 s, ±20 % jitter). */
  baseDelayMs?: number;
  /** Largest honoured `Retry-After`, default 60 s. */
  maxRetryAfterMs?: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** For tests: deterministic jitter. */
  random?: () => number;
}

/** Per-call limits, for callers that must answer within a deadline. */
export interface RequestOptions {
  /**
   * Aborts the call: before a request is sent (or while waiting to retry) it fails with kind
   * `aborted` (nothing applied); while a request is in flight it fails with kind `timeout` (a write
   * may have been applied). Pass `AbortSignal.timeout(ms)` for a total time budget.
   */
  signal?: AbortSignal;
  /** Per-attempt timeout for this call (default: the client's `timeoutMs`). */
  timeoutMs?: number;
  /** Retries after the first attempt for this call (default: the client's `maxRetries`). */
  maxRetries?: number;
}

export interface CallOptions extends RequestOptions {
  /** Safe to retry after a 408/5xx/timeout/network error (default: false). */
  idempotent?: boolean;
}

/**
 * MEWS_ALLOW_PRODUCTION: `1` or `true` (any case, trimmed) allow a production host; anything else
 * does not. The web app accepts the same values (apps/web/lib/env-schema.ts).
 */
export function allowProductionFlag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** True when `platformUrl` is anything other than the public demo environment. */
export function isProductionUrl(platformUrl: string): boolean {
  let host: string;
  try {
    host = new URL(platformUrl).host.toLowerCase();
  } catch {
    return true;
  }
  return host !== "api.mews-demo.com";
}

/**
 * Reads MEWS_PLATFORM_URL (default: demo), MEWS_CLIENT_TOKEN, MEWS_ACCESS_TOKEN and MEWS_CLIENT
 * (default `Stumari 0.1.0`). Anything but the demo host counts as production and is refused
 * unless MEWS_ALLOW_PRODUCTION is `1` or `true`.
 */
export function configFromEnv(env: Readonly<Record<string, string | undefined>>): MewsConfig {
  const platformUrl = (env.MEWS_PLATFORM_URL?.trim() || DEMO_PLATFORM_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(platformUrl);
  } catch {
    throw new MewsError("config", "", "MEWS_PLATFORM_URL is not a URL");
  }
  if (url.protocol !== "https:") throw new MewsError("config", "", "MEWS_PLATFORM_URL must use https");
  if (isProductionUrl(platformUrl) && !allowProductionFlag(env.MEWS_ALLOW_PRODUCTION)) {
    throw new MewsError(
      "config",
      "",
      `refusing to use ${url.host}: only the demo environment (api.mews-demo.com) is allowed unless MEWS_ALLOW_PRODUCTION=1 (or true)`,
    );
  }
  const clientToken = env.MEWS_CLIENT_TOKEN?.trim();
  const accessToken = env.MEWS_ACCESS_TOKEN?.trim();
  if (!clientToken || !accessToken) {
    throw new MewsError("config", "", "MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN must be set");
  }
  return { platformUrl, clientToken, accessToken, client: env.MEWS_CLIENT?.trim() || DEFAULT_CLIENT_NAME };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `Retry-After` as milliseconds: delta-seconds or an HTTP date; undefined when absent/unparseable. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

export class MewsTransport {
  readonly platformUrl: string;
  private readonly secrets: string[];
  private readonly clientName: string;
  private readonly fetchFn: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxRetryAfterMs: number;
  private readonly clientToken: string;
  private readonly accessToken: string;

  constructor(config: MewsConfig) {
    this.platformUrl = config.platformUrl.replace(/\/+$/, "");
    this.clientToken = config.clientToken;
    this.accessToken = config.accessToken;
    this.secrets = [config.clientToken, config.accessToken];
    this.clientName = config.client ?? DEFAULT_CLIENT_NAME;
    this.fetchFn = config.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = config.sleep ?? defaultSleep;
    this.random = config.random ?? Math.random;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 4;
    this.baseDelayMs = config.baseDelayMs ?? 1_000;
    this.maxRetryAfterMs = config.maxRetryAfterMs ?? 60_000;
  }

  get isProduction(): boolean {
    return isProductionUrl(this.platformUrl);
  }

  private backoff(attempt: number): number {
    const base = Math.min(this.baseDelayMs * 2 ** attempt, 30_000);
    return Math.round(base * (0.8 + 0.4 * this.random()));
  }

  /** Calls `operation` (e.g. `reservations/add`) and validates the JSON response with `schema`. */
  async call<S extends z.ZodType>(
    operation: string,
    params: Record<string, unknown>,
    schema: S,
    options: CallOptions = {},
  ): Promise<z.infer<S>> {
    const url = `${this.platformUrl}/api/connector/v1/${operation}`;
    const body = JSON.stringify({
      ClientToken: this.clientToken,
      AccessToken: this.accessToken,
      Client: this.clientName,
      ...params,
    });

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const outer = options.signal;
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= maxRetries;
      if (outer?.aborted) throw new MewsError("aborted", operation, "cancelled by the caller's deadline before sending");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      let text: string;
      try {
        res = await this.fetchFn(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body,
          signal: outer ? AbortSignal.any([controller.signal, outer]) : controller.signal,
        });
        text = await res.text();
      } catch (err) {
        const timedOut = controller.signal.aborted;
        const cut = outer?.aborted === true && !timedOut;
        if (options.idempotent && !last && !cut) {
          await this.pause(this.backoff(attempt), operation, outer);
          continue;
        }
        const detail = timedOut
          ? `no response within ${timeoutMs} ms`
          : cut
            ? "cancelled by the caller's deadline while in flight"
            : `request failed (${err instanceof Error ? redact(err.message, this.secrets) : "unknown error"})`;
        throw new MewsError(timedOut || cut ? "timeout" : "network", operation, detail);
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        let json: unknown;
        try {
          json = text === "" ? {} : JSON.parse(text);
        } catch {
          throw new MewsError("invalid_response", operation, `response is not JSON (HTTP ${res.status})`, res.status);
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
          throw new MewsError("invalid_response", operation, `unexpected response shape: ${issues}`, res.status);
        }
        return parsed.data;
      }

      const retryable =
        res.status === 429 || (options.idempotent === true && (res.status === 408 || res.status >= 500));
      if (retryable && !last) {
        const retryAfter = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after"), Date.now()) : undefined;
        await this.pause(retryAfter !== undefined ? Math.min(retryAfter, this.maxRetryAfterMs) : this.backoff(attempt), operation, outer);
        continue;
      }

      let message = `HTTP ${res.status}`;
      let requestId: string | undefined;
      try {
        const err = ErrorBody.safeParse(JSON.parse(text));
        if (err.success) {
          if (err.data.Message) message += `: ${redact(err.data.Message, this.secrets).slice(0, 500)}`;
          requestId = err.data.RequestId ?? undefined;
        }
      } catch {
        /* non-JSON error body: status only */
      }
      requestId ??= res.headers.get("request-id") ?? undefined;
      throw new MewsError(res.status === 429 ? "rate_limited" : "http", operation, message, res.status, requestId);
    }
  }

  /** Waits before a retry; the caller's signal cuts the wait short (kind `aborted`: nothing was applied). */
  private async pause(ms: number, operation: string, signal: AbortSignal | undefined): Promise<void> {
    if (!signal) return this.sleep(ms);
    if (signal.aborted) throw new MewsError("aborted", operation, "cancelled by the caller's deadline before retrying");
    let onAbort!: () => void;
    const aborted = new Promise<"aborted">((resolve) => {
      onAbort = () => resolve("aborted");
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const won = await Promise.race([this.sleep(ms).then(() => "slept" as const), aborted]);
      if (won === "aborted") throw new MewsError("aborted", operation, "cancelled by the caller's deadline before retrying");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Cursor pagination (docs "Pagination"): requests `Limitation.Count` = 1000 until a page comes
   * back shorter than that or without a cursor. `pick` extracts the page's items. Always idempotent.
   */
  async getAll<S extends z.ZodType<{ Cursor?: string | null | undefined }>, T>(
    operation: string,
    params: Record<string, unknown>,
    schema: S,
    pick: (page: z.infer<S>) => T[],
    options: RequestOptions & { maxPages?: number } = {},
  ): Promise<T[]> {
    const { maxPages = 20, ...request } = options;
    const count = 1000;
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.call(
        operation,
        { ...params, Limitation: cursor ? { Count: count, Cursor: cursor } : { Count: count } },
        schema,
        { ...request, idempotent: true },
      );
      const items = pick(res);
      out.push(...items);
      if (items.length < count || !res.Cursor) return out;
      cursor = res.Cursor;
    }
    throw new MewsError("invalid_response", operation, `more than ${maxPages} pages`);
  }
}
