import type { ApiErrorBody } from "@brightloop/shared";

const CSRF_COOKIE = "bl_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field errors keyed by dotted path; "_" holds form-level errors. */
  readonly fields: Record<string, string[]>;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? {};
    this.details = body.details;
  }
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const found = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
}

/** Fetches a fresh CSRF token; the API also sets it as the bl_csrf cookie. */
async function refreshCsrf(): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, params?: QueryParams): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: QueryParams;
  signal?: AbortSignal;
}

/**
 * JSON request to the API. Sends the session cookie, echoes the CSRF token on
 * mutating requests (retrying once with a fresh token if it was stale) and throws
 * ApiError for any non-2xx response.
 */
export async function api<T>(path: string, { method = "GET", body, params, signal }: RequestOptions = {}): Promise<T> {
  const mutating = !SAFE_METHODS.has(method);

  const send = async (csrf?: string) => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (csrf) headers[CSRF_HEADER] = csrf;
    return fetch(withQuery(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  };

  let res = await send(mutating ? (readCookie(CSRF_COOKIE) ?? (await refreshCsrf())) : undefined);
  if (mutating && res.status === 403) {
    const err = await parseError(res.clone());
    if (err.code === "csrf_invalid") res = await send(await refreshCsrf());
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) return new ApiError(res.status, body.error);
  } catch {
    // Not JSON: fall through to a generic error.
  }
  return new ApiError(res.status, { code: "http_error", message: `Request failed (${res.status})` });
}

/** Human message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
