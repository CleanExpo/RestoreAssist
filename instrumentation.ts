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
  // The export's presence is what turns on Vercel's Node instrumentation.
  //
  // RA-7942: a long-running production server refuses to boot when a
  // migration in this revision is not applied to its database. Read-only; see
  // lib/startup/migration-boot-guard.ts for what it does and where it runs.
  // The literal NEXT_RUNTIME comparison lets the compiler drop this block
  // from the edge bundle, which cannot load node:fs or the database client.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRevisionMigrationsApplied, shouldEnforceBootGuard } =
      await import("@/lib/startup/migration-boot-guard");
    const enforce = shouldEnforceBootGuard({
      NEXT_RUNTIME: process.env.NEXT_RUNTIME,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      NEXT_PHASE: process.env.NEXT_PHASE,
    });
    if (!enforce) return;
    const { prisma } = await import("@/lib/prisma");
    await assertRevisionMigrationsApplied({
      readLedger: () =>
        prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`,
    });
  }
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
