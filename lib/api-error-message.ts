/**
 * Extract a user-displayable string from anything callers might pass to toast
 * or stash in React state after an API failure.
 *
 * Handles:
 *   - Legacy envelope:  { error: "User-friendly message" }
 *   - New envelope:     { error: { code, message, eventId } }
 *   - Bare API error:   { code, message, eventId }  (already unwrapped)
 *   - Plain string / Error
 *
 * Returns null when nothing usable is present so callers can `??` a fallback.
 *
 * IMPORTANT: passing the raw `data.error` object into toast/JSX crashes with
 * "Objects are not valid as a React child". Always normalise through this.
 */
export function apiErrorMessage(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (data instanceof Error) {
    const trimmed = data.message.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;

  // Bare envelope body: { code, message, eventId } — what toast.error(data.error)
  // receives after the apiError rollout.
  if (typeof record.message === "string") {
    const trimmed = record.message.trim();
    if (trimmed.length > 0) return trimmed;
  }

  const err = record.error;
  if (typeof err === "string") {
    const trimmed = err.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string") {
      const trimmed = msg.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

/**
 * Coerce any toast payload into a safe React string child.
 * Never returns an object — the root Toaster relies on that.
 */
export function toastDisplayMessage(
  message: unknown,
  fallback = "Something went wrong",
): string {
  return apiErrorMessage(message) ?? fallback;
}
