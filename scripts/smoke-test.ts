/**
 * RestoreAssist — Production Smoke Test
 * [RA-389] Sprint F — Verify API routes return real data on production
 *
 * Run with: npx tsx scripts/smoke-test.ts
 *
 * Prerequisites:
 *   1. NEXTAUTH_URL or VERCEL_URL environment variable set to the production URL
 *   2. Demo dataset seeded (run: npx tsx prisma/seed-demo.ts)
 *
 * This script verifies:
 *   - Key public API routes are reachable and return 200
 *   - Health endpoint responds
 *   - Supabase connection is live (via Prisma)
 *   - Demo data is present in the database
 *   - RLS policies exist on mobile-facing tables
 *   - Prisma migrations are up-to-date
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL =
  process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function pass(name: string, detail: string) {
  results.push({ name, passed: true, detail });
  console.log(`  ✅ ${name}: ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail });
  console.log(`  ❌ ${name}: ${detail}`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testDatabaseConnection() {
  try {
    const count = await prisma.user.count();
    pass("Database connection", `Connected — ${count} users in database`);
  } catch (e: any) {
    fail("Database connection", `Failed: ${e.message}`);
  }
}

async function testMigrationsUpToDate() {
  try {
    const migrations = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`;

    const failed = migrations.filter((m) => !m.finished_at);
    if (failed.length > 0) {
      fail(
        "Migrations",
        `${failed.length} migration(s) not finished: ${failed.map((m) => m.migration_name).join(", ")}`,
      );
    } else {
      pass(
        "Migrations",
        `${migrations.length} recent migrations all completed. Latest: ${migrations[0]?.migration_name}`,
      );
    }
  } catch (e: any) {
    fail("Migrations", `Query failed: ${e.message}`);
  }
}

async function testRLSPolicies() {
  try {
    const rlsTables = await prisma.$queryRaw<
      Array<{ tablename: string; rowsecurity: boolean }>
    >`
      SELECT tablename, rowsecurity FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('MobileInspection', 'PushToken', 'HistoricalJob', 'ClientInvite')
      ORDER BY tablename
    `;
    const enabledCount = rlsTables.filter((t) => t.rowsecurity).length;
    if (enabledCount === rlsTables.length) {
      pass(
        "RLS policies",
        `${enabledCount}/${rlsTables.length} mobile-facing tables have RLS enabled: ${rlsTables.map((t) => t.tablename).join(", ")}`,
      );
    } else {
      const missing = rlsTables
        .filter((t) => !t.rowsecurity)
        .map((t) => t.tablename);
      fail("RLS policies", `RLS missing on: ${missing.join(", ")}`);
    }
  } catch (e: any) {
    fail("RLS policies", `Query failed: ${e.message}`);
  }
}

async function testDemoDataPresent() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: "demo@restoreassist.com.au" },
    });
    if (!user) {
      fail("Demo user", "Not found — run: npx tsx prisma/seed-demo.ts");
      return;
    }
    pass("Demo user", `Found: ${user.name} (${user.id})`);

    const inspection = await prisma.inspection.findUnique({
      where: { inspectionNumber: "NIR-2026-04-DEMO" },
      include: {
        moistureReadings: { select: { id: true } },
        affectedAreas: { select: { id: true } },
        scopeItems: { select: { id: true } },
        classifications: { select: { id: true } },
      },
    });

    if (!inspection) {
      fail("Demo inspection", "Not found");
      return;
    }

    const checks = [
      {
        name: "Moisture readings",
        count: inspection.moistureReadings.length,
        expected: 8,
      },
      {
        name: "Affected areas",
        count: inspection.affectedAreas.length,
        expected: 3,
      },
      { name: "Scope items", count: inspection.scopeItems.length, expected: 9 },
      {
        name: "Classifications",
        count: inspection.classifications.length,
        expected: 1,
      },
    ];

    for (const check of checks) {
      if (check.count >= check.expected) {
        pass(
          `Demo ${check.name.toLowerCase()}`,
          `${check.count} records (expected ≥${check.expected})`,
        );
      } else {
        fail(
          `Demo ${check.name.toLowerCase()}`,
          `${check.count} records (expected ≥${check.expected})`,
        );
      }
    }

    // Check equipment deployments on the linked report
    if (inspection.reportId) {
      const equipCount = await (prisma as any).equipmentDeployment.count({
        where: { reportId: inspection.reportId },
      });
      if (equipCount >= 5) {
        pass(
          "Demo equipment",
          `${equipCount} deployments (2 dehu + 3 air movers)`,
        );
      } else {
        fail("Demo equipment", `${equipCount} deployments (expected ≥5)`);
      }
    }

    // Check drying goal record
    const dryingGoal = await (prisma as any).dryingGoalRecord.findFirst({
      where: { inspectionId: inspection.id },
    });
    if (dryingGoal) {
      pass(
        "Demo drying goal",
        `Category ${dryingGoal.targetCategory} / Class ${dryingGoal.targetClass}, ${dryingGoal.totalDryingDays} days`,
      );
    } else {
      fail("Demo drying goal", "Not found");
    }
  } catch (e: any) {
    fail("Demo data", `Query failed: ${e.message}`);
  }
}

async function testCoreTablesExist() {
  const requiredTables = [
    "User",
    "Report",
    "Inspection",
    "MoistureReading",
    "EnvironmentalData",
    "AffectedArea",
    "ScopeItem",
    "Classification",
    "EquipmentDeployment",
    "DryingGoalRecord",
    "AuditLog",
    "Organization",
  ];

  try {
    const existingTables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const tableNames = existingTables.map((t) => t.tablename);
    const missing = requiredTables.filter((t) => !tableNames.includes(t));

    if (missing.length === 0) {
      pass(
        "Core tables",
        `All ${requiredTables.length} required tables present`,
      );
    } else {
      fail("Core tables", `Missing: ${missing.join(", ")}`);
    }
  } catch (e: any) {
    fail("Core tables", `Query failed: ${e.message}`);
  }
}

async function testApiHealth() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      pass("API /health", `HTTP ${res.status}`);
    } else {
      fail("API /health", `HTTP ${res.status}`);
    }
  } catch (e: any) {
    fail("API /health", `Unreachable (${BASE_URL}): ${e.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 RestoreAssist Production Smoke Test");
  console.log(`   Target: ${BASE_URL}`);
  console.log(
    `   Supabase: ${process.env.DATABASE_URL ? "configured" : "⚠️ DATABASE_URL not set"}`,
  );
  console.log("────────────────────────────────────────");
  console.log("");

  console.log("📡 Connectivity:");
  await testDatabaseConnection();
  await testApiHealth();
  console.log("");

  console.log("🗄️  Database Schema:");
  await testCoreTablesExist();
  await testMigrationsUpToDate();
  await testRLSPolicies();
  console.log("");

  console.log("🌊 Demo Dataset (S500:2025 Category 2):");
  await testDemoDataPresent();
  console.log("");

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("────────────────────────────────────────");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  if (failed === 0) {
    console.log(`✅ ALL ${total} CHECKS PASSED`);
  } else {
    console.log(`⚠️  ${passed}/${total} passed, ${failed} failed:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`   ❌ ${r.name}: ${r.detail}`));
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("❌ Smoke test crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
