/**
 * Supabase security-advisor CI gate (RA-6724).
 *
 * Fails (exit 1) if the live Supabase security advisors for the target project
 * report any ERROR-level finding, or any public table with RLS disabled
 * (`rls_disabled_in_public`). This is distinct from scripts/audit-rls.ts (#1343),
 * which is a DB-free static coverage gate — this one calls the live Management
 * API, so it runs in a scheduled workflow with prod credentials rather than on
 * fork PRs.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  (required) — Management API token
 *   SUPABASE_PROJECT_REF   (optional) — defaults to the prod ref
 *
 * Run: `pnpm audit:advisors` or `npx tsx scripts/ci/supabase-advisor-gate.ts`
 */

import { pathToFileURL } from "url";

const PROD_PROJECT_REF = "udooysjajglluvuxkijp"; // restoreassist-prod-2026

export type AdvisorLevel = "ERROR" | "WARN" | "INFO";

export interface AdvisorLint {
  name: string;
  level: AdvisorLevel;
  title?: string;
  detail?: string;
  categories?: string[];
  remediation?: string;
}

export interface AdvisorEvaluation {
  passed: boolean;
  failing: AdvisorLint[];
  counts: Record<string, number>;
}

/**
 * Pure evaluation of an advisor lint set — no network, unit-testable.
 * A lint fails the gate if it is ERROR-level, or names an RLS-disabled public
 * table (`rls_disabled_in_public`), regardless of how Supabase grades it.
 */
export function evaluateAdvisors(lints: AdvisorLint[]): AdvisorEvaluation {
  const counts: Record<string, number> = {};
  for (const lint of lints) {
    counts[lint.level] = (counts[lint.level] ?? 0) + 1;
  }

  const failing = lints.filter(
    (lint) => lint.level === "ERROR" || lint.name === "rls_disabled_in_public",
  );

  return { passed: failing.length === 0, failing, counts };
}

async function fetchSecurityAdvisors(
  ref: string,
  token: string,
): Promise<AdvisorLint[]> {
  const url = `https://api.supabase.com/v1/projects/${ref}/advisors/security`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Supabase advisors API returned ${response.status} ${response.statusText}${
        body ? `: ${body.slice(0, 300)}` : ""
      }`,
    );
  }

  const json = (await response.json()) as { lints?: AdvisorLint[] };
  return json.lints ?? [];
}

function printReport(ref: string, evaluation: AdvisorEvaluation): void {
  const { counts, failing } = evaluation;
  console.log(`# Supabase Security Advisor Gate`);
  console.log(`Project: ${ref}`);
  console.log(
    `Advisors: ERROR=${counts.ERROR ?? 0} WARN=${counts.WARN ?? 0} INFO=${counts.INFO ?? 0}`,
  );

  if (failing.length === 0) {
    console.log(`PASS — no ERROR advisors and no RLS-disabled public tables.`);
    return;
  }

  console.log(`FAIL — ${failing.length} blocking finding(s):`);
  for (const lint of failing) {
    console.log(
      `- [${lint.level}] ${lint.name}${lint.title ? ` — ${lint.title}` : ""}`,
    );
  }
}

async function main(): Promise<void> {
  const ref = process.env.SUPABASE_PROJECT_REF || PROD_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;

  if (!token) {
    console.error(
      "SUPABASE_ACCESS_TOKEN is not set — cannot reach the advisors API. Failing closed.",
    );
    process.exitCode = 1;
    return;
  }

  const lints = await fetchSecurityAdvisors(ref, token);
  const evaluation = evaluateAdvisors(lints);
  printReport(ref, evaluation);

  if (!evaluation.passed) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
