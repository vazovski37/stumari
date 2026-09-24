/** Browser-side JSON client for our own API (no RPC in the browser, ADR-0009). */

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError(0, "NETWORK", "Could not reach Stumari. Check your connection and try again.", {});
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = (json.error ?? {}) as { code?: string; message?: string };
    throw new ClientApiError(res.status, error.code ?? "HTTP_ERROR", error.message ?? `Request failed (HTTP ${res.status})`, json);
  }
  return json as T;
}

export const apiGet = <T>(path: string) => call<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown) => call<T>("POST", path, body);

export const errorMessage = (e: unknown) =>
  e instanceof ClientApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
