/**
 * Sentry client-side initialisation (browser bundle).
 *
 * Loaded by Next.js when the SDK detects this file. The SDK only sends
 * events when `NEXT_PUBLIC_SENTRY_DSN` is set, so dev / preview builds
 * without the DSN configured stay quiet.
 *
 * Wave 4 PR-L of the 2026-05-06 production-readiness push.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

    // 10% of transactions in prod, 100% in non-prod for visibility while we
    // tune signal-to-noise. Increase prod sample rate after the first month
    // of stable signal.
    tracesSampleRate:
      process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0.1 : 1.0,

    // Replay only on errors in prod to bound bandwidth + storage cost; full
    // recording in preview to make pre-merge regression debugging easy.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate:
      process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0 : 0.1,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Drop noise we already see from the browser console / network panel.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
    ],
  });
}
