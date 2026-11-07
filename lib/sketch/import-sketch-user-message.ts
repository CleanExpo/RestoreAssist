/**
 * RA-8232 — user-facing copy for sketch image import failures.
 */

export function importSketchUserMessage(
  status: number,
  body: unknown,
  retryAfterHeader?: string | null,
): string {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const code =
    typeof record.code === "string"
      ? record.code
      : typeof record.error === "string"
        ? record.error
        : "";
  const message =
    typeof record.message === "string" ? record.message : undefined;

  if (status === 402 || code === "KEY_MISSING" || code === "SUBSCRIPTION_REQUIRED") {
    return (
      message ??
      "Sketch import needs an active subscription or Vision budget. Open Add-ons to enable floor-plan import."
    );
  }
  if (status === 429 || code === "RATE_LIMITED") {
    const retry =
      retryAfterHeader ??
      (typeof record.retryAfter === "string" ? record.retryAfter : null);
    return retry
      ? `Too many import attempts. Try again in ${retry} seconds.`
      : "Too many import attempts. Wait a few minutes and try again.";
  }
  if (code === "BUDGET_EXHAUSTED" || code === "VISION_BUDGET") {
    return (
      message ??
      "The organisation Vision budget is exhausted. Contact your administrator or try again next cycle."
    );
  }
  if (status === 413 || code === "FILE_TOO_LARGE") {
    return "That image is too large. Use a photo under 8 MB.";
  }
  if (code === "INVALID_IMAGE" || code === "UNSUPPORTED_FORMAT") {
    return "That file is not a supported image (JPEG, PNG, or WebP).";
  }
  if (status === 503 || code === "READER_UNAVAILABLE") {
    return (
      message ??
      "The sketch reader is temporarily unavailable. Upload a clearer photo or draw rooms manually."
    );
  }
  if (message) return message;
  if (status >= 500) {
    return "Import failed on the server. Try again shortly.";
  }
  return `Import failed (${status}). Try a clearer floor-plan photo.`;
}
