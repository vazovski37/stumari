/**
 * A tiny HTTP client for the web API with its own cookie jar, so every simulated browser (guest,
 * admin) keeps its own `stumari_cid` hold owner and `stumari_session`.
 */
import assert from "node:assert/strict";

export interface ApiErrorBody {
  error: { code: string; message: string };
  [key: string]: unknown;
}

export class Http {
  private readonly cookies = new Map<string, string>();

  constructor(
    readonly baseUrl: string,
    readonly name: string,
  ) {}

  async call<T>(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: unknown): Promise<{ status: number; json: T; text: string }> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair!.indexOf("=");
      if (eq > 0) this.cookies.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim());
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // text/calendar and other non-JSON bodies: callers use `text`.
    }
    return { status: res.status, json: json as T, text };
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** A 2xx response, or a failed assertion naming the call and the API error. */
  async ok<T>(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: unknown): Promise<T> {
    const { status, json, text } = await this.call<T>(method, path, body);
    assert.ok(status >= 200 && status < 300, `[${this.name}] ${method} ${path} -> HTTP ${status}: ${text.slice(0, 500)}`);
    return json;
  }

  /** An error response with exactly this status and code. */
  async fails(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body: unknown, status: number, code: string): Promise<ApiErrorBody> {
    const res = await this.call<ApiErrorBody>(method, path, body);
    assert.equal(res.status, status, `[${this.name}] ${method} ${path}: expected HTTP ${status} ${code}, got ${res.status}: ${res.text.slice(0, 300)}`);
    assert.equal(res.json.error.code, code);
    return res.json;
  }
}
