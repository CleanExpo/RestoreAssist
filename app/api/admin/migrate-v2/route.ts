/**
 * POST /api/admin/migrate-v2
 * Retired one-time endpoint that previously created V2 tables on the managed
 * Postgres database.
 *
 * RA-1539 — defence-in-depth auth layering:
 *   1. `ADMIN_MIGRATE_V2_ENABLED=true` env flag (infra toggle)
 *   2. `verifyCronAuth` — CRON_SECRET bearer (infra secret)
 *   3. `getServerSession` + verifyAdminFromDb (human ADMIN session) [ADDED]
 *
 * The previous version required only (1) + (2). A leaked CRON_SECRET
 * plus the flag flipped on could trigger DDL from any external caller.
 * Layer 3 remains for auditability, but the endpoint now returns 410 after
 * all gates pass. Runtime DDL violates the migrations-only production rule.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { verifyCronAuth } from "@/lib/cron/auth";
import { apiError } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  // RA-1283: defence-in-depth. CRON_SECRET gates access but this endpoint
  // re-runs DDL on prod — a mis-triggered curl could thrash the DB. Require
  // an explicit env flag to be set for each invocation; the owner can set
  // it before running the migration and remove it immediately after. This
  // means even a leaked CRON_SECRET can't trigger schema ops without a
  // second factor. DDL is already idempotent (`CREATE … IF NOT EXISTS`)
  // but the flag additionally logs an audit line with who gated it.
  if (process.env.ADMIN_MIGRATE_V2_ENABLED !== "true") {
    console.warn(
      "[admin/migrate-v2] Rejected: ADMIN_MIGRATE_V2_ENABLED not set. Set to 'true' in env, run, then unset.",
    );
    return apiError(request, {
      code: "FORBIDDEN",
      message:
        "Endpoint disabled. Set ADMIN_MIGRATE_V2_ENABLED=true in env to enable, run migration, then unset.",
      status: 403,
    });
  }

  const cronErr = verifyCronAuth(request);
  if (cronErr) return cronErr;

  // RA-1539 — third gate: human ADMIN session. verifyAdminFromDb re-reads
  // role from the DB (not the JWT claim) so a demoted admin's stale
  // session cannot trigger DDL.
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) {
    console.warn(
      "[admin/migrate-v2] Rejected: no admin session (env flag + CRON_SECRET passed, but no human admin).",
    );
    return auth.response;
  }
  console.info(
    "[admin/migrate-v2] All three gates passed:",
    JSON.stringify({ adminUserId: auth.user!.id }),
  );

  return NextResponse.json(
    {
      error:
        "Runtime DDL endpoint retired. Use Prisma migrations and pnpm prisma:generate instead.",
      code: "MIGRATIONS_ONLY",
    },
    { status: 410 },
  );
}
