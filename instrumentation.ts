/**
 * Next.js instrumentation hook — fires once per server runtime boot.
 *
 * Wires Sentry server / edge initialisation. The actual `Sentry.init`
 * call is in `sentry.server.config.ts` / `sentry.edge.config.ts`; this
 * file just imports the right one based on the runtime.
 *
 * Wave 4 PR-L of the 2026-05-06 production-readiness push.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { onRequestError } from "@sentry/nextjs";
