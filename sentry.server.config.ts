/**
 * Sentry server-side config — RA P0-3 observability ship-blocker.
 *
 * Loaded by Next.js via instrumentation.ts on every server runtime.
 * No-op when SENTRY_DSN is unset (local dev / preview without DSN).
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    // 10% sample rate for traces; bump up post-launch if budget allows.
    tracesSampleRate: 0.1,
    // Tighten in prod; show full errors in non-prod.
    debug: process.env.NODE_ENV !== "production",
    // Don't leak PII unless explicitly attached via Sentry.setUser().
    sendDefaultPii: false,
  });
}
