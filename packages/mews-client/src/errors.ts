/**
 * Errors name the Mews operation and never carry request bodies, headers or tokens.
 */

export type MewsErrorKind =
  /** Bad or unsafe configuration (missing env, production without opt-in). */
  | "config"
  /** Invalid arguments to a helper (dates, counts, unknown ids). */
  | "input"
  /** Non-2xx HTTP response from Mews (after retries, where retries apply). */
  | "http"
  /** 429 Too Many Requests still returned after the last retry. */
  | "rate_limited"
  /**
   * The request did not finish within the timeout, or the caller's `signal` (a deadline) aborted it
   * while it was in flight: a write may still have been applied.
   */
  | "timeout"
  /**
   * The caller's `signal` aborted the call before a request was sent (or while waiting to retry a
   * rejected one): nothing was applied by this call.
   */
  | "aborted"
  /** fetch itself failed (DNS, TLS, connection reset). */
  | "network"
  /** 2xx response whose body did not match the expected schema. */
  | "invalid_response";

export class MewsError extends Error {
  override readonly name = "MewsError";
  constructor(
    readonly kind: MewsErrorKind,
    /** Connector API operation, e.g. `reservations/add`; empty for config/input errors. */
    readonly operation: string,
    message: string,
    readonly status?: number,
    /** Mews `RequestId` (for support tickets), when the error body had one. */
    readonly requestId?: string,
  ) {
    super(operation ? `Mews ${operation}: ${message}` : `Mews: ${message}`);
  }
}

/** Replaces every occurrence of each secret with `***` (secrets shorter than 6 chars are ignored). */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 6) out = out.split(s).join("***");
  return out;
}
