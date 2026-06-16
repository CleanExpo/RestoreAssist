/**
 * Sentry edge-runtime initialisation (middleware + edge route handlers).
 *
 * Loaded via instrumentation.ts when Next.js boots an edge runtime
 * worker. The edge runtime is a stripped-down V8 isolate without the
 * Node.js APIs Sentry's full server SDK needs, so we use the lighter
 * @sentry/nextjs edge entry — fewer integrations, but errors and
 * performance traces still ship.
 *
 * Wave 4 PR-L of the 2026-05-06 production-readiness push.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubTransaction, scrubErrorEvent } from "./lib/sentry-scrub";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",

    // Lower sample rate on edge — middleware fires on every request and
    // would dominate the trace budget at 10% prod / 100% preview.
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.05 : 0.5,

    sendDefaultPii: false,

    // B4: strip secret query params (?key=, ?apiKey=, ?token=) from span +
    // request URLs so a BYOK key can never be recorded by HTTP tracing.
    beforeSendTransaction: scrubTransaction,
    beforeSend: scrubErrorEvent,
  });
}
