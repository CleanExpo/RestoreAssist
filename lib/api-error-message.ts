/**
 * Extract a user-displayable error message from any API response body.
 *
 * Handles both shapes during the RA-1548 apiError envelope rollout:
 *   - Legacy:  { error: "User-friendly message" }
 *   - New:     { error: { code, message, eventId } }
 *
 * Returns null when no usable error message is present, so callers can
 * supply a fallback via `?? "Something went wrong"`.
 *
 * IMPORTANT: passing the raw `data.error` object straight into React state
 * (then rendering `{error}` in JSX) crashes with "Objects are not valid as
 * a React child". Always normalise through this helper.
 */
export function apiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as Record<string, unknown>).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return null;
}
