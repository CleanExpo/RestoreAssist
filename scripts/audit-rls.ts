/**
 * Goal #18 (gaps miner SEC-001) — Standalone runnable RLS audit gate.
 *
 * Wraps the static coverage auditor (scripts/audit-rls-coverage.ts) as a
 * deterministic pass/fail CLI:
 *
 *   pnpm audit:rls            # human report; exit 1 on any regression
 *   pnpm audit:rls --json     # machine-readable result
 *
 * It asserts two layers, neither of which needs a database:
 *   1. COVERAGE — every audited table has RLS ENABLE'd (default-deny baseline)
 *      and every tenant-scoped table receives at least one scoping policy, with
 *      no policy leaking onto a service-only table. This mirrors the netting in
 *      audit-rls-coverage.test.ts so the CLI and the vitest gate never diverge.
 *   2. HARDENING REGRESSION — the 2026-06-16 cluster (BYOK audit #2/#10/#11/#25
 *      + the legacy-commerce always-true fix) stays in the repo. If a future
 *      edit reverts one of those migrations or re-opens an always-true hole,
 *      this fails CI here rather than silently re-exposing prod.
 *
 * The executable vitest gate is scripts/__tests__/audit-rls.test.ts; the
 * runtime row-isolation proof is the live-Postgres harness in scripts/rls-harness/.
 */
import { dirname, resolve } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import {
  RA4956_MIGRATION,
  RA4970_MIGRATION,
  RA4956_FOLLOWUP_MIGRATION,
  readMigration,
  parseEmittedPolicies,
  parseRlsEnabledTables,
  parseServiceOnlyDowngrade,
  tenantScopedTables,
  AUDIT_TABLES,
  SERVICE_ONLY,
} from "./audit-rls-coverage";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = (f: string) => resolve(REPO, "docs/ops/supabase-migrations-archive", f);

/** The 6 legacy Unite-Group CRM tables whose always-true policies were dropped. */
const COMMERCE_TABLES = [
  "customers",
  "orders",
  "order_items",
  "products",
  "quotes",
  "quote_items",
] as const;

interface Guard {
  file: string;
  label: string;
  checks: Array<{ name: string; ok: (sql: string) => boolean }>;
}

/**
 * Static invariants of the 2026-06-16 hardening migrations. Each check reads
 * the committed SQL and asserts the security-relevant statement is still there,
 * so a revert or accidental deletion is caught before it reaches prod.
 */
const HARDENING_GUARDS: Guard[] = [
  {
    file: "20260616000000_drop_always_true_rls_legacy_commerce_tables.sql",
    label: "legacy-commerce always-true RLS dropped",
    checks: [
      ...COMMERCE_TABLES.flatMap((t) => [
        {
          name: `drops authenticated_read_${t}`,
          ok: (s: string) =>
            s.includes(`DROP POLICY IF EXISTS "authenticated_read_${t}"`),
        },
        {
          name: `drops authenticated_write_${t}`,
          ok: (s: string) =>
            s.includes(`DROP POLICY IF EXISTS "authenticated_write_${t}"`),
        },
      ]),
      {
        name: "re-introduces no policy (tables stay default-deny)",
        ok: (s: string) => !/CREATE\s+POLICY/i.test(s),
      },
    ],
  },
  {
    file: "20260616010000_harden_rls_cluster.sql",
    label: "RLS hardening cluster (#10 / #11 / #25)",
    checks: [
      {
        name: "#10 PushToken UPDATE scoped to owner (not always-true)",
        ok: (s: string) =>
          /CREATE POLICY "PushToken_update_own"[\s\S]*?USING \(\(select auth\.uid\(\)\)::text = "userId"\)/.test(
            s,
          ),
      },
      {
        name: "#11 immutable empty search_path pinned on flagged functions",
        ok: (s: string) =>
          /SET search_path = ''''/.test(s) && s.includes("handle_new_user"),
      },
      {
        name: "#25 evidence-bucket public-listing policy dropped",
        ok: (s: string) =>
          s.includes(
            `DROP POLICY IF EXISTS "Public can read optimised" ON storage.objects`,
          ),
      },
    ],
  },
  {
    file: "20260616020000_revoke_definer_rpc_exposure.sql",
    label: "SECURITY DEFINER RPC exposure revoked (#2)",
    checks: [
      {
        name: "revokes EXECUTE from PUBLIC (the real grantor)",
        ok: (s: string) =>
          /REVOKE EXECUTE ON FUNCTION[\s\S]*?FROM PUBLIC/.test(s),
      },
      {
        name: "covers handle_new_user + verify_client_invite",
        ok: (s: string) =>
          s.includes("handle_new_user") && s.includes("verify_client_invite"),
      },
      {
        name: "retains the service_role grant for server-side use",
        ok: (s: string) =>
          /GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role/.test(s),
      },
    ],
  },
];

export interface AuditResult {
  ok: boolean;
  failures: string[];
  report: string[];
}

export function runRlsAudit(): AuditResult {
  const failures: string[] = [];
  const report: string[] = [];

  // ── 1. Coverage (mirrors audit-rls-coverage.test.ts netting) ──
  const rlsEnabled = parseRlsEnabledTables(readMigration(RA4970_MIGRATION));
  const downgraded = parseServiceOnlyDowngrade(
    readMigration(RA4956_FOLLOWUP_MIGRATION),
  );
  const emitted = new Map(
    [...parseEmittedPolicies(readMigration(RA4956_MIGRATION))].filter(
      ([t]) => !downgraded.has(t),
    ),
  );

  const notEnabled = AUDIT_TABLES.filter((t) => !rlsEnabled.has(t));
  if (notEnabled.length) {
    failures.push(
      `RLS not enabled on ${notEnabled.length} audited table(s): ${notEnabled.join(", ")}`,
    );
  }

  const tenant = tenantScopedTables();
  const tenantSet = new Set(tenant);
  const missing = tenant.filter((t) => !emitted.has(t));
  if (missing.length) {
    failures.push(
      `tenant-scoped table(s) with NO policy: ${missing.join(", ")}`,
    );
  }

  const stray = [...emitted.keys()].filter((t) => !tenantSet.has(t));
  if (stray.length) {
    failures.push(
      `policy emitted for a non-tenant-scoped table: ${stray.join(", ")}`,
    );
  }

  const leaked = [...SERVICE_ONLY].filter((t) => emitted.has(t));
  if (leaked.length) {
    failures.push(
      `service-only table(s) leaked an authenticated policy: ${leaked.join(", ")}`,
    );
  }

  report.push(
    `Coverage: ${AUDIT_TABLES.length} audited · ${rlsEnabled.size} RLS-enabled · ` +
      `${tenant.length} tenant-scoped · ${emitted.size} policies emitted`,
  );

  // ── 2. Hardening regression guards (2026-06-16 cluster) ──
  for (const g of HARDENING_GUARDS) {
    const path = MIG(g.file);
    if (!existsSync(path)) {
      failures.push(`hardening migration MISSING: ${g.file}`);
      continue;
    }
    const sql = readMigration(path);
    const failed = g.checks.filter((c) => !c.ok(sql));
    for (const c of failed) {
      failures.push(`[${g.label}] ${c.name} — FAILED (${g.file})`);
    }
    report.push(
      `Guard ${g.file}: ${g.checks.length - failed.length}/${g.checks.length} invariant(s) intact`,
    );
  }

  return { ok: failures.length === 0, failures, report };
}

// ── CLI runner (cross-platform entry-point check) ──
const invokedDirectly =
  !!process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = runRlsAudit();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const line of result.report) console.log(`  ${line}`);
    if (result.ok) {
      console.log(
        "\n✓ RLS audit passed — coverage + hardening invariants intact.",
      );
    } else {
      console.error(
        `\n✗ RLS audit FAILED (${result.failures.length} issue(s)):`,
      );
      for (const f of result.failures) console.error(`  - ${f}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}
