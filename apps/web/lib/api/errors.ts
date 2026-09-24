import { EscrowTxError } from "@stumari/escrow-client";
import { z } from "zod";
import { apiError } from "../request";

/** An expected failure with its HTTP status and API error code (api.md error shape). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: { headers?: HeadersInit; body?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);

/** Program errors during simulation are the caller's problem (409); anything else is ours (502). */
export function escrowFailure(e: EscrowTxError): ApiError {
  const name = e.failure.name;
  switch (e.stage) {
    case "simulate":
      return new ApiError(409, "SIMULATION_FAILED", `The transaction would fail: ${name}`, { body: { reason: name } });
    case "send":
      return new ApiError(409, "TX_FAILED", `The network rejected the transaction: ${name}`, { body: { reason: name } });
    case "confirm":
      return new ApiError(409, "TX_FAILED", `The transaction failed on-chain: ${name}`, { body: { reason: name } });
    case "expired":
      return new ApiError(410, "TX_EXPIRED", "The transaction expired before it landed; request a new one");
    case "timeout":
      return new ApiError(504, "CONFIRMATION_TIMEOUT", "The transaction was sent but not confirmed in time; refresh shortly");
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiError(error.status, error.code, error.message, { headers: error.extra?.headers, body: error.extra?.body });
  }
  if (error instanceof z.ZodError) {
    return apiError(400, "VALIDATION_FAILED", "Some fields are missing or invalid", {
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (error instanceof EscrowTxError) return toErrorResponse(escrowFailure(error));
  console.error("unhandled API error", error);
  return apiError(500, "INTERNAL", "Something went wrong; please try again");
}

/** Wraps a route handler so thrown `ApiError`s, zod and escrow errors become JSON error responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

const MAX_BODY_BYTES = 16 * 1024;

/** Reads a JSON body (≤ 16 KiB) and validates it; failures are `ApiError`s / `ZodError`s. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiError(413, "BODY_TOO_LARGE", "Request body is too large");
  let body: unknown;
  try {
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be JSON");
  }
  return schema.parse(body);
}

export const rateLimited = (retryAfterSecs: number, what: string) =>
  new ApiError(429, "RATE_LIMITED", `Too many ${what}; try again later`, {
    headers: { "retry-after": String(retryAfterSecs) },
  });
