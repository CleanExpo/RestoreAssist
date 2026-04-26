/**
 * Next.js instrumentation hook — entry point for server-side observability.
 *
 * RA P0-3 — wires Sentry's server + edge configs and forwards
 * onRequestError so framework-level exceptions surface in our
 * error-tracking pipeline. Without this, unhandled errors at 3am
 * disappear into Vercel's log void.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
