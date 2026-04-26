/**
 * RA-1349 + RA P0-3 — structured error reporting for Vercel Observability
 * AND Sentry. Vercel Observability auto-indexes `console.error`; Sentry
 * adds aggregation, alerting, source-map symbolication, release-aware
 * regression tracking, and 3am page-out routing.
 *
 * Both sinks fire from the same `reportError` call so existing call sites
 * upgrade automatically the moment SENTRY_DSN lands in env. No code
 * churn — that's deliberate; we ship pilots with both behaviours behind
 * one helper.
 *
 * Usage:
 *   reportError(err, { route: "/api/invoices", userId, stage: "create" });
 */

import * as Sentry from "@sentry/nextjs";

export interface ErrorContext {
  route?: string;
  userId?: string | null;
  organizationId?: string | null;
  stage?: string;
  [key: string]: unknown;
}

function dsnConfigured(): boolean {
  return (
    Boolean(process.env.SENTRY_DSN?.trim()) ||
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim())
  );
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

  // RA P0-3 — also forward to Sentry when configured. Defensive try/catch
  // so a misconfigured Sentry never breaks the caller.
  if (dsnConfigured()) {
    try {
      Sentry.withScope((scope) => {
        if (context.route) scope.setTag("route", context.route);
        if (context.stage) scope.setTag("stage", context.stage);
        if (context.organizationId) scope.setTag("organizationId", context.organizationId);
        if (context.userId) scope.setUser({ id: context.userId });
        // Strip the keys we already lifted to tags/user; the rest go in extras.
        const { route: _r, stage: _s, userId: _u, organizationId: _o, ...rest } =
          context;
        if (Object.keys(rest).length > 0) scope.setContext("extra", rest);

        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage(payload.message);
        }
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Add a breadcrumb. Useful before risky operations so Sentry has a trail
 * even if the next thrown error doesn't include the context inline.
 * No-op when no DSN is set.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!dsnConfigured()) return;
  try {
    Sentry.addBreadcrumb({ category, message, data, level: "info" });
  } catch {
    // ignore
  }
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
