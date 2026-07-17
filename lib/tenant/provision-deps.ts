/**
 * Real (DB-touching) dependencies for the tenant-DB provisioning state machine
 * (`lib/tenant/provision.ts`, RA-6873 worker half).
 *
 * `provisionTenantDb` is a pure, injected-dependency orchestration — it is unit
 * tested with fakes. This module wires the production side effects it needs:
 *   - test:      prove the tenant DB is reachable with the given string.
 *   - migrate:   apply the baseline migration — TENANT connection ONLY (guarded).
 *   - store:     no-op here (see below).
 *   - markReady: flip the workspace to tenant-DB-ready and clear the phase marker.
 *
 * The connection string is persisted (encrypted) at onboarding time
 * (app/api/onboarding/database), which is how it reaches this worker, so the
 * state machine's `store` phase has nothing left to do.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { validateConnectionString } from "@/lib/tenant/onboarding-helpers";
import type { ProvisionDeps } from "@/lib/tenant/provision";

/**
 * The physical-database identity of a connection string: host + port + database
 * name, credentials and query params discarded. Used to compare a candidate
 * tenant string against the platform DB regardless of differing credentials.
 */
function targetIdentity(connectionString: string): string | null {
  try {
    const u = new URL(connectionString.trim());
    const database = u.pathname.replace(/^\//, "");
    return `${u.hostname.toLowerCase()}:${u.port}/${database}`;
  } catch {
    return null;
  }
}

/**
 * Structural guard: refuse to run the tenant baseline migration against anything
 * that resolves to the platform database (DATABASE_URL / DIRECT_URL). The
 * migration is destructive DDL; pointing it at the shared DB would be
 * catastrophic. This makes "migrate the wrong database" impossible by
 * construction, not merely by convention — the migrate dependency calls it
 * before it touches anything.
 */
export function assertTenantConnectionString(connectionString: string): void {
  const target = targetIdentity(connectionString);
  if (!target) {
    throw new Error(
      "Refusing to migrate: the tenant connection string is not a parseable URL.",
    );
  }
  const platformStrings = [
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);

  for (const platform of platformStrings) {
    if (targetIdentity(platform) === target) {
      throw new Error(
        "Refusing to run the tenant baseline migration against the platform database (DATABASE_URL/DIRECT_URL); the connection target must be the workspace's own database.",
      );
    }
    if (platform.trim() === connectionString.trim()) {
      throw new Error(
        "Refusing to run the tenant baseline migration against the platform database.",
      );
    }
  }
}

/** Prove the tenant DB is reachable. Any failure is reported as unreachable. */
export async function testConnectivity(connectionString: string): Promise<boolean> {
  // Prisma 7 requires a driver adapter — use a short-lived pg Pool per probe.
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

/**
 * Apply the baseline schema migration to the workspace's own database via
 * `prisma migrate deploy`, with DATABASE_URL/DIRECT_URL overridden to the tenant
 * connection for this child process only. The target is asserted to be a tenant
 * DB first (never the platform DB). On failure a generic error is thrown so the
 * connection string can never leak into an error message or log.
 */
export async function migrateTenantBaseline(connectionString: string): Promise<void> {
  assertTenantConnectionString(connectionString);
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        DIRECT_URL: connectionString,
      },
      stdio: "pipe",
    });
  } catch {
    // Deliberately opaque: a raw prisma error can echo the target host. The
    // phase marker records that the failure was in `migrate`; that is enough to
    // resume without ever surfacing the connection string.
    throw new Error("Tenant baseline migration failed.");
  }
}

/**
 * Production dependency set for `provisionTenantDb`. `markReady` is the single
 * authoritative "flip to ready" write and clears the resumable phase marker.
 */
export function buildProvisionDeps(): ProvisionDeps {
  return {
    validate: validateConnectionString,
    test: testConnectivity,
    migrate: migrateTenantBaseline,
    // The encrypted connection string is already persisted at onboarding (that is
    // how it reached the worker), so there is nothing to store here.
    store: async () => {},
    markReady: async (workspaceId: string) => {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          tenantDbStatus: "ready",
          tenantDbProvisionPhase: null,
        } as never,
      });
    },
  };
}
