/**
 * Turn a failed `POST /api/setup/activate` response body into one sentence the
 * operator can act on.
 *
 * Two envelope shapes reach here, which is exactly why this must not be done
 * ad hoc at each call site:
 *
 *   - The RA-1548 envelope, `{ error: { code, message } }`, for the auth,
 *     not-found and conflict branches. Passing `body.error` straight to React
 *     as a child throws ("Objects are not valid as a React child").
 *   - The pre-flight rejection, which is deliberately raw so it can carry a
 *     top-level `failedChecks` array naming the capabilities that blocked
 *     activation. That list is the useful part, so it wins when present.
 */
export function activationErrorMessage(status: number, body: unknown): string {
  const b = body as { error?: unknown; failedChecks?: unknown } | null;

  const failed = Array.isArray(b?.failedChecks) ? b.failedChecks : [];
  const labels = failed
    .map((c) => (c as { label?: unknown } | null)?.label)
    .filter((l): l is string => typeof l === "string" && l.trim().length > 0);
  if (labels.length > 0) {
    return `Setup can't finish yet — ${labels.join(", ")} need attention.`;
  }

  const err = b?.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return `Could not finish setup (${status}). Please try again.`;
}
