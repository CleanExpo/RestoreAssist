/**
 * GET /api/health/migrations — Prisma migration drift watchdog.
 *
 * RA-1740 / RA-1742 follow-up. The 2026-04-27 incident left both sandbox
 * and production with stuck Prisma migrations for days, blocking every
 * deploy. The build's `prisma migrate deploy` failed silently (P3009 in
 * logs, but no /health surface flagged it).
 *
 * This endpoint surfaces execution-history drift directly. Full pending-file
 * parity remains the responsibility of the deploy gate (`prisma migrate
 * status`), because a database ledger cannot reveal a migration file it has
 * never seen.
 *
 * Usage (UptimeRobot, Pi-Dev-Ops watchdog, manual probe):
 *   curl https://restoreassist.app/api/health/migrations
 *   # → 200 healthy or 503 drifted
 *
 * No auth — intentionally public so external monitors can probe without
 * credentials. Returns no PII, secrets, or migration names — only counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { createHash } from "node:crypto";

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
  database_name: string;
  schema_name: string;
  instance_sentinel: string;
}

function fingerprintLogicalDatabase(
  identity: Pick<
    MigrationRow,
    "database_name" | "schema_name" | "instance_sentinel"
  >,
) {
  if (
    typeof identity.database_name !== "string" ||
    identity.database_name.trim().length === 0 ||
    typeof identity.schema_name !== "string" ||
    identity.schema_name.trim().length === 0 ||
    typeof identity.instance_sentinel !== "string" ||
    identity.instance_sentinel.trim().length === 0
  ) {
    return null;
  }
  // Must stay byte-for-byte compatible with scripts/verify-database-identity.mjs.
  // Direct connections and transaction poolers have distinct endpoints. The
  // migration-owned sentinel keeps same-named database/schema pairs on separate
  // clusters distinct without relying on endpoint topology.
  return createHash("sha256")
    .update(
      `restoreassist-logical-db-v2\0${identity.database_name}\0${identity.schema_name}\0${identity.instance_sentinel}`,
    )
    .digest("hex");
}

export async function GET(request: NextRequest) {
  // Rate-limit: 60/min per IP (matches /api/health). External monitors
  // poll on the order of once per minute — anything more is abuse.
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    prefix: "health-migrations",
    // A health probe must not perform RateLimitHit writes and a transaction
    // before it can report migration state. Those extra database round trips
    // caused the public probe to time out while the basic DB health check was
    // still healthy.
    memoryOnly: true,
  });
  if (rateLimited) {
    rateLimited.headers.set("Cache-Control", "no-store, must-revalidate");
    return rateLimited;
  }

  let rows: MigrationRow[];
  try {
    rows = await prisma.$queryRaw<MigrationRow[]>(Prisma.sql`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count,
             current_database() AS database_name,
             current_schema() AS schema_name,
             (
               SELECT "instanceId"::text
               FROM "DatabaseInstanceSentinel"
               WHERE "singleton" = true
             ) AS instance_sentinel
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
        error: "Could not read the migration ledger",
        detail: "Migration health check failed",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, must-revalidate" },
      },
    );
  }

  const attemptsByName = new Map<string, MigrationRow[]>();
  for (const row of rows) {
    const attempts = attemptsByName.get(row.migration_name) ?? [];
    attempts.push(row);
    attemptsByName.set(row.migration_name, attempts);
  }

  const failed: string[] = [];
  const rolledBackOnly: string[] = [];
  const applied: string[] = [];
  for (const [name, attempts] of attemptsByName) {
    const hasUnresolvedAttempt = attempts.some(
      (attempt) =>
        attempt.finished_at === null && attempt.rolled_back_at === null,
    );
    const hasSuccessfulAttempt = attempts.some(
      (attempt) =>
        attempt.finished_at !== null && attempt.rolled_back_at === null,
    );
    if (hasUnresolvedAttempt) failed.push(name);
    else if (hasSuccessfulAttempt) applied.push(name);
    else rolledBackOnly.push(name);
  }

  // An empty ledger means migration state is unknown, not healthy.
  const drifted =
    attemptsByName.size === 0 || failed.length > 0 || rolledBackOnly.length > 0;
  if (drifted) {
    console.error("[health.migrations] execution-history drift", {
      failed,
      rolledBackOnly,
    });
  }

  const payload = {
    status: drifted ? "drift" : "ok",
    counts: {
      applied: applied.length,
      failed: failed.length,
      rolled_back: rolledBackOnly.length,
      total: attemptsByName.size,
    },
    databaseFingerprint:
      rows.length > 0 ? fingerprintLogicalDatabase(rows[0]) : null,
  };

  if (payload.databaseFingerprint === null) {
    payload.status = "drift";
  }

  return NextResponse.json(payload, {
    status: payload.status === "drift" ? 503 : 200,
    headers: {
      // Bypass CDN cache so monitors always see live state.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
