/**
 * Next.js instrumentation hook — fires once per server runtime boot.
 *
 * RA-1349 (Vercel-native observability): the presence of this file with a
 * `register()` export enables Node runtime instrumentation, which Vercel
 * Observability needs to capture Spans. `onRequestError` forwards uncaught
 * RSC/route-handler request errors into the same structured `reportError()`
 * sink used everywhere else in the app, so they land in Vercel Function
 * logs (queryable/alertable) instead of only the server console.
 *
 * See docs/compliance/OBSERVABILITY-SETUP.md for the full stack.
 */
import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability";

export async function register() {
  // No-op today — reserved for future Node-runtime-only setup. The export's
  // presence is what turns on Vercel's Node instrumentation.
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  reportError(error, {
    route: request.path,
    stage: "onRequestError",
    routeType: context.routeType,
  });
};
