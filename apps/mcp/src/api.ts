import type { z } from "zod";
import * as s from "./schemas";
import { clip } from "./text";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A failed API call, reduced to fields that are safe to show the model. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `/api/tx/send` polls for confirmation for up to 30 s (api.md). */
const TIMEOUT_MS = 45_000;

export interface QuoteRequest {
  hotel_slug: string;
  room_type_id: string;
  checkin_date: string;
  checkout_date: string;
  adults: number;
  children: number;
  buyer_type: "agent";
  /** Omitted when there is no wallet (the API field is optional). */
  buyer_wallet?: string;
}

/** Typed client for the public REST API. Every response is schema-checked before use. */
export class StumariApi {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  config(): Promise<s.PublicConfig> {
    return this.call("GET", "/api/config/public", s.publicConfig);
  }

  hotels(city?: string): Promise<s.HotelList> {
    const q = city ? `?${new URLSearchParams({ city })}` : "";
    return this.call("GET", `/api/hotels${q}`, s.hotelList);
  }

  availability(slug: string, q: { checkin: string; checkout: string; adults: number; children: number }) {
    const params = new URLSearchParams({
      checkin: q.checkin,
      checkout: q.checkout,
      adults: String(q.adults),
      children: String(q.children),
    });
    return this.call("GET", `/api/hotels/${encodeURIComponent(slug)}/availability?${params}`, s.availability);
  }

  createQuote(body: QuoteRequest): Promise<s.Envelope> {
    return this.call("POST", "/api/quotes", s.envelope, body);
  }

  getQuote(quoteId: string) {
    return this.call("GET", `/api/quotes/${encodeURIComponent(quoteId)}`, s.quoteRecord);
  }

  pay(quoteId: string, body: { option_index: number; payer: string }) {
    return this.call("POST", `/api/quotes/${encodeURIComponent(quoteId)}/pay`, s.payResponse, body);
  }

  booking(bookingId: string): Promise<s.BookingView> {
    return this.call("GET", `/api/bookings/${encodeURIComponent(bookingId)}`, s.bookingView);
  }

  bookingTx(bookingId: string, body: { action: "cancel"; wallet: string }) {
    return this.call("POST", `/api/bookings/${encodeURIComponent(bookingId)}/tx`, s.bookingTxResponse, body);
  }

  sendTx(tx: string) {
    return this.call("POST", "/api/tx/send", s.sendResponse, { tx });
  }

  private async call<T extends z.ZodType>(
    method: "GET" | "POST",
    path: string,
    schema: T,
    body?: unknown,
  ): Promise<z.infer<T>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "is unreachable";
      throw new ApiError("API_UNREACHABLE", `The Stumari API at ${this.baseUrl} ${reason}.`, null);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const err = s.apiError.safeParse(json);
      if (err.success) throw new ApiError(err.data.error.code, clip(err.data.error.message, 200), res.status);
      throw new ApiError("HTTP_ERROR", `The Stumari API answered HTTP ${res.status}.`, res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError("UNEXPECTED_RESPONSE", `The Stumari API returned an unexpected response for ${method} ${path.split("?")[0]}.`, res.status);
    }
    return parsed.data;
  }
}
