/**
 * Sentry server-side initialisation (Node.js runtime).
 *
 * Loaded via instrumentation.ts on server boot. Only sends when
 * `SENTRY_DSN` is set so dev / preview builds without the DSN
 * configured stay quiet.
 *
 * Wave 4 PR-L of the 2026-05-06 production-readiness push.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",

    // 10% of transactions in prod (cron + API hot-paths fire often). 100% in
    // non-prod to make preview deploys observable end-to-end.
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,

    // Server-side: never auto-capture request bodies (PII risk on the
    // multi-tenant inspection / claim payloads). Use Sentry.captureException
    // explicitly with redacted context where needed.
    sendDefaultPii: false,

    // Drop expected operational signals (auth-not-present 401s on public
    // endpoints, deliberate rate-limit 429s) so they don't drown out real
    // exceptions.
    ignoreErrors: [/^Unauthorized$/, /^Rate limit exceeded$/],
  });
}
