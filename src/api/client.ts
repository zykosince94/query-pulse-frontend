import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type User = Schemas["UserOut"];

/**
 * The one HTTP client for the backend. Paths, params, bodies and responses are all typed from
 * the backend's openapi.json, so a backend change the frontend hasn't absorbed is a type error.
 *
 * Requests stay on the page's own origin (`/api/...`); Vite (dev) or Caddy (prod) forwards them
 * to the backend, so the session cookie is sent with no CORS setup.
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? "",
  credentials: "same-origin",
  // Look up fetch per request rather than capturing it once at import, so anything that
  // wraps fetch later (Mock Service Worker in tests, monitoring tools) is respected.
  fetch: (request) => globalThis.fetch(request),
});

/** An HTTP error from the backend, with the status and FastAPI's `detail` message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Turn FastAPI's error body (`{detail: string}` or a list of validation errors) into text. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error && typeof error === "object" && "detail" in error) {
    const { detail } = error as { detail: unknown };
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item: { msg?: string }) => item.msg ?? "")
        .filter(Boolean)
        .join("; ");
    }
  }
  return fallback;
}

/** Return `data` from an openapi-fetch result, or throw an ApiError for a non-2xx response. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok || data === undefined) {
    throw new ApiError(response.status, errorMessage(error, `Request failed (${response.status})`));
  }
  return data;
}
