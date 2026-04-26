/**
 * Sentry browser-side config. No-op when NEXT_PUBLIC_SENTRY_DSN is unset.
 *
 * Uses the public env so the DSN ships in client bundles. Sentry DSNs are
 * designed to be public (write-only token); the secret-side controls go
 * through the Sentry org settings.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: 0.1,
    // Capture 1% of normal sessions and 100% of error sessions for replay.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    sendDefaultPii: false,
  });
}
