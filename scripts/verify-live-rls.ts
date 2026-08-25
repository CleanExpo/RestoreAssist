#!/usr/bin/env node

import { Pool } from "pg";

import {
  AUDIT_TABLES,
  INVESTIGATE_FIRST,
  PUBLIC_REF,
  RLS_EXEMPT,
  SERVICE_ONLY,
  schemaModels,
} from "./audit-rls-coverage.js";

export interface LiveRlsRow {
  table_name: string;
  rls_enabled: boolean;
  policies: LiveRlsPolicy[];
}

export interface LiveRlsPolicy {
  name: string;
  command: string;
  permissive: string;
  roles: string[];
  using_expression: string | null;
  check_expression: string | null;
}

// These are access-model rules, not an inventory of tables: each is
// intentionally SELECT-only. All other tenant tables require the four CRUD
// policy arms so a dropped arm cannot hide behind "some policy exists".
const READ_ONLY_TENANT = new Set([
  "Organization",
  "OrganizationPricingConfig",
  "AuthorityFormSignature",
]);

function normaliseExpression(expression: string | null): string {
  return (expression ?? "")
    .toLowerCase()
    .replace(/[\s"]/g, "")
    .replace(/::text/g, "");
}

function isTenantScopedExpression(expression: string | null): boolean {
  if (/\b(?:true|false)\b/i.test(expression ?? "") || /\b1\s*=\s*1\b/.test(expression ?? "")) {
    // Tenant predicates have no legitimate boolean-literal arm. Rejecting all
    // of them also catches wrappers such as COALESCE(scoped_check, true).
    return false;
  }
  const disjuncts = (expression ?? "").split(/\s+OR\s+/i);
  if (disjuncts.length > 1) {
    // Every OR arm must independently bind to tenant identity. A single safe
    // comparison cannot launder `OR userId IS NOT NULL` into a scoped policy.
    return disjuncts.every((disjunct) => isTenantScopedExpression(disjunct));
  }
  const normalised = normaliseExpression(expression);
  if (
    /(?:auth\.uid\(\)|\))is(?:not)?null/.test(normalised) &&
    /auth\.uid\(\)|is_workspace_(?:owner|member)\(/.test(normalised)
  ) {
    // `(userId = auth.uid()) IS NOT NULL` is true whenever the comparison
    // produces either TRUE or FALSE. It therefore looks scoped to a regex while
    // granting every non-null row. The same wrapper is unsafe around workspace
    // helper results. Reject truth-value null tests before recognising anchors.
    return false;
  }
  const withoutParentheses = normalised.replace(/[()]/g, "");
  if (
    !normalised ||
    /^(true|1=1)$/.test(withoutParentheses) ||
    /(?:ortrue|trueor|or1=1|1=1or)/.test(withoutParentheses)
  ) return false;
  const ownershipColumn = String.raw`(?:[a-z0-9_]+\.)?(?:userid|ownerid|id)`;
  const uidIsCompared =
    new RegExp(`${ownershipColumn}=\\(*auth\\.uid\\(\\)`).test(normalised) ||
    new RegExp(`auth\\.uid\\(\\)\\)*=${ownershipColumn}`).test(normalised);
  const workspaceHelper = /is_workspace_(owner|member)\(/.test(normalised);
  return uidIsCompared || workspaceHelper;
}

function policyFindings(table: string, policies: LiveRlsPolicy[], readOnly: boolean): string[] {
  const findings: string[] = [];
  const requiredCommands = readOnly
    ? ["SELECT"]
    : ["SELECT", "INSERT", "UPDATE", "DELETE"];

  for (const policy of policies) {
    if (
      !policy ||
      typeof policy.name !== "string" ||
      typeof policy.command !== "string" ||
      typeof policy.permissive !== "string"
    ) {
      findings.push(`${table}: live policy inventory contains a malformed policy`);
      continue;
    }
    const command = policy.command.toUpperCase();
    if (!policy.name || policy.permissive.toUpperCase() !== "PERMISSIVE") {
      findings.push(`${table}: policy inventory has an unnamed or non-permissive policy`);
      continue;
    }
    if (!requiredCommands.includes(command)) {
      findings.push(`${table}: unexpected ${command || "UNKNOWN"} policy ${policy.name}`);
      continue;
    }
    if (
      !Array.isArray(policy.roles) ||
      policy.roles.length !== 1 ||
      policy.roles[0] !== "authenticated"
    ) {
      findings.push(`${table}: policy ${policy.name} is not restricted to role authenticated`);
    }
    if (["SELECT", "UPDATE", "DELETE"].includes(command) && !isTenantScopedExpression(policy.using_expression)) {
      findings.push(`${table}: ${command} policy ${policy.name} has no recognised tenant-scoped USING predicate`);
    }
    if (["INSERT", "UPDATE"].includes(command) && !isTenantScopedExpression(policy.check_expression)) {
      findings.push(`${table}: ${command} policy ${policy.name} has no recognised tenant-scoped WITH CHECK predicate`);
    }
  }

  for (const command of requiredCommands) {
    if (!policies.some(
      (policy) => typeof policy?.command === "string" && policy.command.toUpperCase() === command,
    )) {
      findings.push(`${table}: required ${command} policy arm is missing`);
    }
  }
  return findings;
}

export function verifyRlsRows(
  models: Map<string, string>,
  rows: LiveRlsRow[],
): string[] {
  const observed = new Map(rows.map((row) => [row.table_name, row]));
  const findings: string[] = [];
  const schemaTables = new Set(models.values());
  // AUDIT_TABLES is the explicit legacy/infrastructure allowlist for public
  // tables that production is known to carry outside the current Prisma model
  // inventory (for example _prisma_migrations and investigate-first tables).
  // Discovery remains authoritative: a live table absent from both populations
  // is an unreviewed surface and fails closed.
  const allowedLiveTables = new Set([...schemaTables, ...AUDIT_TABLES]);
  const discoveredCounts = new Map<string, number>();
  for (const row of rows) {
    const table = typeof row?.table_name === "string" ? row.table_name : "";
    discoveredCounts.set(table, (discoveredCounts.get(table) ?? 0) + 1);
    if (!table || !allowedLiveTables.has(table)) {
      findings.push(`${table || "<malformed>"}: unexpected live public table is absent from the explicit RLS inventory`);
    }
  }
  for (const [table, count] of discoveredCounts) {
    if (count !== 1) findings.push(`${table || "<malformed>"}: live table inventory contains ${count} duplicate rows`);
  }

  for (const [model, table] of models) {
    if (RLS_EXEMPT.has(model)) continue;
    const row = observed.get(table);
    if (!row) {
      findings.push(`${table}: live table is missing`);
      continue;
    }
    if (row.rls_enabled !== true) {
      findings.push(`${table}: row-level security is disabled`);
      continue;
    }
    const deliberatelyDefaultDeny =
      SERVICE_ONLY.has(model) ||
      SERVICE_ONLY.has(table) ||
      INVESTIGATE_FIRST.has(model) ||
      INVESTIGATE_FIRST.has(table);
    if (!Array.isArray(row.policies)) {
      findings.push(`${table}: live policy inventory is malformed`);
    } else if (deliberatelyDefaultDeny && row.policies.length !== 0) {
      findings.push(`${table}: default-deny table unexpectedly has a live policy`);
    } else if (PUBLIC_REF.has(model) || PUBLIC_REF.has(table)) {
      if (row.policies.length === 0) {
        findings.push(`${table}: public-reference policy is missing`);
      }
      for (const policy of row.policies) {
        if (
          !policy ||
          typeof policy.name !== "string" ||
          typeof policy.command !== "string"
        ) {
          findings.push(`${table}: public-reference policy inventory is malformed`);
          continue;
        }
        const allowedRoles =
          Array.isArray(policy.roles) &&
          policy.roles.length > 0 &&
          policy.roles.every((role) => role === "anon" || role === "authenticated");
        if (
          policy.command.toUpperCase() !== "SELECT" ||
          !allowedRoles ||
          normaliseExpression(policy.using_expression).replace(/[()]/g, "") !== "true" ||
          policy.check_expression !== null
        ) {
          findings.push(`${table}: public-reference policy ${policy.name || "<unnamed>"} violates the read-only contract`);
        }
      }
    } else if (!deliberatelyDefaultDeny) {
      findings.push(
        ...policyFindings(
          table,
          row.policies,
          READ_ONLY_TENANT.has(model) || READ_ONLY_TENANT.has(table),
        ),
      );
    }
  }

  for (const table of new Set([...SERVICE_ONLY, ...INVESTIGATE_FIRST])) {
    if (schemaTables.has(table)) continue;
    const row = observed.get(table);
    if (!row) continue;
    if (row.rls_enabled !== true) {
      findings.push(`${table}: row-level security is disabled`);
    } else if (!Array.isArray(row.policies)) {
      findings.push(`${table}: live policy inventory is malformed`);
    } else if (row.policies.length !== 0) {
      findings.push(`${table}: default-deny table unexpectedly has a live policy`);
    }
  }

  return findings;
}

async function main(): Promise<number> {
  const connectionString = process.env.DIRECT_URL ?? process.env.PRODUCTION_DIRECT_URL;
  if (!connectionString) {
    console.error("[live-rls] ERROR: DIRECT_URL or PRODUCTION_DIRECT_URL is required");
    return 2;
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 20_000,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  let rows: LiveRlsRow[];
  try {
    const result = await pool.query<LiveRlsRow>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'name', p.polname,
                   'command', CASE p.polcmd
                     WHEN 'r' THEN 'SELECT'
                     WHEN 'a' THEN 'INSERT'
                     WHEN 'w' THEN 'UPDATE'
                     WHEN 'd' THEN 'DELETE'
                     WHEN '*' THEN 'ALL'
                     ELSE 'UNKNOWN'
                   END,
                   'permissive', CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                   'roles', ARRAY(
                     SELECT rolname
                       FROM pg_catalog.pg_roles
                      WHERE oid = ANY(p.polroles)
                      ORDER BY rolname
                   ),
                   'using_expression', pg_get_expr(p.polqual, p.polrelid),
                   'check_expression', pg_get_expr(p.polwithcheck, p.polrelid)
                 ) ORDER BY p.polname
               ) FILTER (WHERE p.oid IS NOT NULL),
               '[]'::jsonb
             ) AS policies
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       GROUP BY c.oid, c.relname, c.relrowsecurity
    `);
    rows = result.rows;
  } catch (error) {
    console.error(`[live-rls] ERROR: could not query live RLS posture: ${String(error)}`);
    return 2;
  } finally {
    await pool.end();
  }

  const models = schemaModels();
  if (models.size === 0 || rows.length === 0) {
    console.error("[live-rls] ERROR: expected or live table population is empty");
    return 2;
  }
  const findings = verifyRlsRows(models, rows);
  if (findings.length > 0) {
    console.error(`[live-rls] FAIL: ${findings.length} live RLS parity finding(s)`);
    for (const finding of findings) console.error(`  - ${finding}`);
    return 1;
  }
  console.log(
    `[live-rls] PASS: ${models.size - RLS_EXEMPT.size} non-exempt Prisma tables have live RLS and required policies`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
