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
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  isAllowlistedTenantDatabaseHost,
  validateConnectionString,
} from "@/lib/tenant/onboarding-helpers";
import type { ProvisionDeps } from "@/lib/tenant/provision";

// Keep the executable path literal instead of resolving/importing the Prisma
// package from application code. Turbopack otherwise follows Prisma's CLI
// dependency graph and tries to compile its development .tar.gz/.wasm assets.
const PRISMA_CLI_ENTRYPOINT = path.resolve(
  process.cwd(),
  "node_modules/prisma/build/index.js",
);
const TENANT_PRISMA_CONFIG = path.resolve(
  process.cwd(),
  "prisma/tenant/prisma.config.ts",
);
const CONTROL_PLANE_SENTINEL = "DatabaseInstanceSentinel";
const TENANT_SCHEMA_TABLES = new Set(["Inspection", "UserRef"]);

// Keep v4/v6 lists separate. Node's BlockList maps IPv4 checks into IPv6, so
// mixing an IPv4-mapped IPv6 subnet into one list would deny every IPv4 host.
const DENIED_IPV4_NETWORKS = new BlockList();
DENIED_IPV4_NETWORKS.addSubnet("0.0.0.0", 8, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("10.0.0.0", 8, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("100.64.0.0", 10, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("127.0.0.0", 8, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("169.254.0.0", 16, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("172.16.0.0", 12, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("192.0.0.0", 24, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("192.168.0.0", 16, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("198.18.0.0", 15, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("224.0.0.0", 4, "ipv4");
DENIED_IPV4_NETWORKS.addSubnet("240.0.0.0", 4, "ipv4");
const DENIED_IPV6_NETWORKS = new BlockList();
DENIED_IPV6_NETWORKS.addSubnet("::", 128, "ipv6");
DENIED_IPV6_NETWORKS.addSubnet("::1", 128, "ipv6");
DENIED_IPV6_NETWORKS.addSubnet("::ffff:0:0", 96, "ipv6");
DENIED_IPV6_NETWORKS.addSubnet("fc00::", 7, "ipv6");
DENIED_IPV6_NETWORKS.addSubnet("fe80::", 10, "ipv6");
DENIED_IPV6_NETWORKS.addSubnet("ff00::", 8, "ipv6");

class TenantProvisioningSafetyError extends Error {}

function parsedConnectionString(connectionString: string): URL | null {
  try {
    return new URL(connectionString.trim());
  } catch {
    return null;
  }
}

function normalisedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

/**
 * The physical-database identity of a connection string: host + port + database
 * name, credentials and query params discarded. Used to compare a candidate
 * tenant string against the platform DB regardless of differing credentials.
 */
function targetIdentity(connectionString: string): string | null {
  const u = parsedConnectionString(connectionString);
  if (!u) return null;
  const database = u.pathname.replace(/^\//, "");
  const port = u.port || "5432";
  return `${normalisedHost(u)}:${port}/${database}`;
}

function isDeniedAddress(address: string, family: number): boolean {
  const normalised = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (family !== 4 && family !== 6) return true;
  if (isIP(normalised) !== family) return true;
  return family === 4
    ? DENIED_IPV4_NETWORKS.check(normalised, "ipv4")
    : DENIED_IPV6_NETWORKS.check(normalised, "ipv6");
}

/** Resolve the managed hostname and reject every non-public result. */
async function assertPublicTenantHost(url: URL): Promise<void> {
  const host = normalisedHost(url);
  const literalFamily = isIP(host);
  if (literalFamily !== 0) {
    if (isDeniedAddress(host, literalFamily)) {
      throw new TenantProvisioningSafetyError(
        "Refusing to provision a tenant database on a private, loopback, or link-local address.",
      );
    }
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new TenantProvisioningSafetyError(
      "Refusing to provision: the tenant database host could not be resolved safely.",
    );
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new TenantProvisioningSafetyError(
      "Refusing to provision: the tenant database host has no usable addresses.",
    );
  }
  if (addresses.some(({ address, family }) => isDeniedAddress(address, family))) {
    throw new TenantProvisioningSafetyError(
      "Refusing to provision a tenant database whose host resolves to a private, loopback, or link-local address.",
    );
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
export async function assertTenantConnectionString(connectionString: string): Promise<void> {
  const validation = validateConnectionString(connectionString);
  if (!validation.ok) {
    throw new TenantProvisioningSafetyError(
      validation.error ?? "Refusing to provision an invalid tenant database target.",
    );
  }
  const target = targetIdentity(connectionString);
  const targetUrl = parsedConnectionString(connectionString);
  if (!target || !targetUrl) {
    throw new Error(
      "Refusing to migrate: the tenant connection string is not a parseable URL.",
    );
  }
  if (!isAllowlistedTenantDatabaseHost(targetUrl.hostname)) {
    throw new TenantProvisioningSafetyError(
      "That database host is not approved for tenant provisioning.",
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
  await assertPublicTenantHost(targetUrl);
}

interface SchemaTableRow {
  table_schema: string;
  table_name: string;
}

/**
 * Check the exact schema Prisma will target. Before DDL it must be empty or an
 * already-complete tenant schema; afterwards all baseline tables must exist.
 * Any control-plane sentinel or unrelated user table fails closed.
 */
export async function verifyTenantSchemaTables(
  connectionString: string,
  stage: "pre" | "post",
): Promise<void> {
  const parsed = parsedConnectionString(connectionString);
  if (!parsed) {
    throw new TenantProvisioningSafetyError("Tenant schema verification was refused.");
  }
  const schema = parsed.searchParams.get("schema")?.trim() || "public";
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const result = await pool.query<SchemaTableRow>(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_name = $2
           OR (table_schema = $1 AND table_type = 'BASE TABLE')`,
      [schema, CONTROL_PLANE_SENTINEL],
    );
    if (result.rows.some((row) => row.table_name === CONTROL_PLANE_SENTINEL)) {
      throw new TenantProvisioningSafetyError(
        "Refusing to provision: the target contains the control-plane database sentinel.",
      );
    }

    const userTables = new Set(
      result.rows
        .filter((row) => row.table_schema === schema && row.table_name !== "_prisma_migrations")
        .map((row) => row.table_name),
    );
    const unknown = [...userTables].filter((table) => !TENANT_SCHEMA_TABLES.has(table));
    if (unknown.length > 0) {
      throw new TenantProvisioningSafetyError(
        "Refusing to provision: the target schema contains non-tenant tables.",
      );
    }

    const missing = [...TENANT_SCHEMA_TABLES].filter((table) => !userTables.has(table));
    if (stage === "pre" && userTables.size > 0 && missing.length > 0) {
      throw new TenantProvisioningSafetyError(
        "Refusing to provision: the target contains a partial tenant schema.",
      );
    }
    if (stage === "post" && missing.length > 0) {
      throw new TenantProvisioningSafetyError(
        "Tenant baseline migration did not create the required schema tables.",
      );
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

/** Prove the tenant DB is reachable. Any failure is reported as unreachable. */
export async function testConnectivity(connectionString: string): Promise<boolean> {
  try {
    await assertTenantConnectionString(connectionString);
  } catch {
    return false;
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Apply the baseline schema migration to the workspace's own database via the
 * repository-pinned Prisma CLI and its tenant-only config/migration directory.
 * The child receives TENANT_DATABASE_URL; control-plane URL variables are
 * removed. On failure a generic error is thrown so the connection string can
 * never leak into an error message or log.
 */
export async function migrateTenantBaseline(connectionString: string): Promise<void> {
  await assertTenantConnectionString(connectionString);
  try {
    await verifyTenantSchemaTables(connectionString, "pre");
  } catch (error) {
    if (error instanceof TenantProvisioningSafetyError) throw error;
    throw new Error("Tenant baseline migration preflight failed.");
  }
  try {
    const { DATABASE_URL: _databaseUrl, DIRECT_URL: _directUrl, ...safeEnv } = process.env;
    execFileSync(
      process.execPath,
      [
        PRISMA_CLI_ENTRYPOINT,
        "migrate",
        "deploy",
        "--config",
        TENANT_PRISMA_CONFIG,
      ],
      {
        env: {
          ...safeEnv,
          TENANT_DATABASE_URL: connectionString,
        },
        stdio: "pipe",
        timeout: 30_000,
        killSignal: "SIGTERM",
      },
    );
    await verifyTenantSchemaTables(connectionString, "post");
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
export function buildProvisionDeps(expectedConnectionEnc: string): ProvisionDeps {
  return {
    validate: validateConnectionString,
    test: testConnectivity,
    migrate: migrateTenantBaseline,
    // The encrypted connection string is already persisted at onboarding (that is
    // how it reached the worker), so there is nothing to store here.
    store: async () => {},
    markReady: async (workspaceId: string) => {
      const result = await prisma.workspace.updateMany({
        where: {
          id: workspaceId,
          tenantDbConnectionEnc: expectedConnectionEnc,
          tenantDbStatus: { in: ["provisioning", "error"] },
        },
        data: {
          tenantDbStatus: "ready",
          tenantDbProvisionPhase: null,
        } as never,
      });
      if (result.count !== 1) {
        throw new TenantProvisioningSafetyError(
          "Discarded a stale tenant database provisioning result.",
        );
      }
    },
  };
}
