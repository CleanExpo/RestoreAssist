/**
 * RA-1555 — unified client-side error parser.
 *
 * Pairs with `lib/api-errors.ts` on the server. Pulls the envelope
 * `{ error: { code, message, eventId, fields? } }` and returns a shape
 * forms can consume directly:
 *
 *   const parsed = await parseApiError(response);
 *   setGlobalError(parsed.message);
 *   if (parsed.fields) setFieldErrors(parsed.fields);
 *
 * For non-envelope responses (legacy routes, network errors, 429 from
 * middleware) returns a sensible fallback.
 */

import { formatRateLimitMessage, parseRetryAfter } from "@/lib/fetch-with-retry";

export interface ParsedApiError {
  code: string;
  message: string;
  status: number;
  eventId?: string;
  /** Per-field validation messages — render next to the matching input. */
  fields?: Record<string, string>;
  /** 429 only — seconds until retry is allowed. */
  retryAfterSeconds?: number;
}

export async function parseApiError(response: Response): Promise<ParsedApiError> {
  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    return {
      code: "RATE_LIMITED",
      message: formatRateLimitMessage(retryAfter),
      status: 429,
      retryAfterSeconds: retryAfter ?? undefined,
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON — fall through with the status-only fallback.
  }

  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (err && typeof err === "object") {
      const envelope = err as {
        code?: unknown;
        message?: unknown;
        eventId?: unknown;
        fields?: unknown;
      };
      return {
        code: typeof envelope.code === "string" ? envelope.code : "UNKNOWN",
        message:
          typeof envelope.message === "string"
            ? envelope.message
            : "Something went wrong.",
        status: response.status,
        eventId: typeof envelope.eventId === "string" ? envelope.eventId : undefined,
        fields:
          envelope.fields && typeof envelope.fields === "object"
            ? (envelope.fields as Record<string, string>)
            : undefined,
      };
    }
    // Legacy shape: `{ error: "string" }`.
    if (typeof err === "string") {
      return { code: "UNKNOWN", message: err, status: response.status };
    }
  }

  return {
    code: "UNKNOWN",
    message: `Request failed (HTTP ${response.status})`,
    status: response.status,
  };
}

/**
 * Format a ParsedApiError for a generic toast/banner. Includes the
 * eventId when present so users can quote it in a support ticket.
 */
export function formatApiError(err: ParsedApiError): string {
  if (err.eventId) return `${err.message} (Error ID: ${err.eventId})`;
  return err.message;
}
