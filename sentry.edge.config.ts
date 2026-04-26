/**
 * Sentry edge-runtime config — middleware + edge route handlers.
 * No-op when SENTRY_DSN is unset.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: 0.1,
    debug: false,
    sendDefaultPii: false,
  });
}
