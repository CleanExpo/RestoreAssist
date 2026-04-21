/**
 * RA-1349 — structured error reporting for Vercel Observability.
 *
 * Vercel Observability auto-indexes `console.error` from Functions, but
 * the grouping + alerting works much better when we emit a consistent
 * shape: prefix + context object. This helper enforces that shape so
 * dashboards and alert rules can filter on `error.route`, `error.user`,
 * etc. without regex.
 *
 * Usage:
 *   reportError(err, { route: "/api/invoices", userId, stage: "create" });
 */

export interface ErrorContext {
  route?: string;
  userId?: string | null;
  organizationId?: string | null;
  stage?: string;
  [key: string]: unknown;
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "UnknownError",
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    ...context,
  };
  // Prefix lets Vercel Observability filter on `[error]` and alert
  // policies group by payload.route / payload.stage.
  console.error("[error]", JSON.stringify(payload));
}

/**
 * Client-side helper — POSTs to /api/observability/client-error so
 * the exception ends up in Vercel Function logs (server-side, queryable)
 * rather than only in browser console (non-queryable).
 */
export async function reportClientError(error: unknown, context: ErrorContext = {}): Promise<void> {
  try {
    await fetch("/api/observability/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        ...context,
      }),
      keepalive: true, // Survives page unload
    });
  } catch {
    // Don't throw from error reporting — if the endpoint is down, console
    // still has the stack. RA-1109: no swallowing — the original error
    // is NOT caught here; caller handles it. We only swallow the REPORT
    // error.
  }
}
