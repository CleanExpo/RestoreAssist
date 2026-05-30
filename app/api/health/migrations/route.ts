/**
 * GET /api/health/migrations — Prisma migration drift watchdog.
 *
 * RA-1740 / RA-1742 follow-up. The 2026-04-27 incident left both sandbox
 * and production with stuck Prisma migrations for days, blocking every
 * deploy. The build's `prisma migrate deploy` failed silently (P3009 in
 * logs, but no /health surface flagged it).
 *
 * This endpoint surfaces drift directly:
 *   - Returns 200 + `{ status: "ok", applied: N, pending: 0, failed: 0 }` when
 *     every migration in `_prisma_migrations` is `finished_at IS NOT NULL`
 *     and `rolled_back_at IS NULL`.
 *   - Returns 503 + `{ status: "drift", failed: [...names], pending: N }`
 *     when any migration is stuck or the table is missing.
 *
 * Usage (UptimeRobot, Pi-Dev-Ops watchdog, manual probe):
 *   curl https://restoreassist.app/api/health/migrations
 *   # → 200 healthy or 503 drifted
 *
 * No auth — intentionally public so external monitors can probe without
 * credentials. Returns no PII or secrets — only migration names and counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
}

export async function GET(request: NextRequest) {
  // Rate-limit: 60/min per IP (matches /api/health). External monitors
  // poll on the order of once per minute — anything more is abuse.
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    prefix: "health-migrations",
  });
  if (rateLimited) return rateLimited;

  let rows: MigrationRow[];
  try {
    rows = await prisma.$queryRaw<MigrationRow[]>(Prisma.sql`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations"
    `);
  } catch (err) {
    // Most common cause: the `_prisma_migrations` table doesn't exist yet
    // (fresh DB before any migration ever ran). Surface as drift so the
    // operator notices, rather than silently passing.
    console.error("[health.migrations] drift check failed", err);
    return NextResponse.json(
      {
        status: "drift",
        error: "Could not read _prisma_migrations table",
        detail: "Migration health check failed",
      },
      { status: 503 },
    );
  }

  const failed = rows.filter(
    (r) => r.finished_at === null && r.rolled_back_at === null,
  );
  const rolledBack = rows.filter((r) => r.rolled_back_at !== null);
  const applied = rows.filter(
    (r) => r.finished_at !== null && r.rolled_back_at === null,
  );

  const drifted = failed.length > 0 || rolledBack.length > 0;

  const payload = {
    status: drifted ? "drift" : "ok",
    counts: {
      applied: applied.length,
      failed: failed.length,
      rolled_back: rolledBack.length,
      total: rows.length,
    },
    // Only include names when there's drift — keeps the healthy-path
    // response a fixed-size constant for monitor parsers.
    ...(drifted
      ? {
          failed_migrations: failed.map((r) => r.migration_name),
          rolled_back_migrations: rolledBack.map((r) => r.migration_name),
        }
      : {}),
  };

  return NextResponse.json(payload, {
    status: drifted ? 503 : 200,
    headers: {
      // Bypass CDN cache so monitors always see live state.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
