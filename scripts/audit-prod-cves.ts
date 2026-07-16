/**
 * Production dependency CVE gate.
 *
 * Replaces `pnpm audit --audit-level=high --prod`, whose npm "quick audit"
 * endpoint (/-/npm/v1/security/audits) npm permanently retired — it now
 * returns HTTP 410 and fails every CI run regardless of the actual CVE state.
 *
 * This queries the still-supported **bulk advisory endpoint** instead, keeping
 * the original gate's exact semantics:
 *   - PROD dependency closure only (`pnpm list --prod --depth Infinity`)
 *   - HIGH + CRITICAL severity only (matching `--audit-level=high`)
 *   - honours the `package.json` `pnpm.auditConfig.ignoreGhsas` suppressions
 *
 * The endpoint returns advisories only for the exact versions submitted, so no
 * client-side version-range check is needed. Exit 1 (fail the PR) when any
 * un-ignored high/critical advisory affects an installed prod dependency;
 * exit 0 otherwise. Fails closed on a non-200 response so the gate can never
 * silently pass.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BULK_ENDPOINT =
  "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

export interface BulkAdvisory {
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
}

export interface Finding {
  name: string;
  ghsa: string | null;
  adv: BulkAdvisory;
}

type DepTree = Record<string, { version?: string; dependencies?: DepTree }>;

function readIgnoredGhsas(): Set<string> {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return new Set<string>(pkg?.pnpm?.auditConfig?.ignoreGhsas ?? []);
}

/** Installed PROD dependency closure as { packageName: [versions] }. */
function collectProdDependencies(): Record<string, string[]> {
  const raw = execFileSync(
    "pnpm",
    ["list", "--prod", "--depth", "Infinity", "--json"],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  const projects = JSON.parse(raw) as Array<{ dependencies?: DepTree }>;
  const collected = new Map<string, Set<string>>();

  const walk = (deps?: DepTree) => {
    if (!deps) return;
    for (const [name, node] of Object.entries(deps)) {
      if (node.version) {
        if (!collected.has(name)) collected.set(name, new Set());
        collected.get(name)!.add(node.version);
      }
      walk(node.dependencies);
    }
  };
  for (const project of projects) walk(project.dependencies);

  return Object.fromEntries(
    [...collected].map(([name, versions]) => [name, [...versions]]),
  );
}

export function ghsaFromUrl(url: string): string | null {
  const match = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(url ?? "");
  return match ? match[0] : null;
}

/**
 * Pure selection: from the bulk endpoint's response, keep only HIGH/CRITICAL
 * advisories whose GHSA is not in the ignore list. Exported for testing so the
 * gate's biting behaviour is provable without a network call.
 */
export function selectBlockingFindings(
  advisories: Record<string, BulkAdvisory[]>,
  ignoredGhsas: Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const [name, list] of Object.entries(advisories)) {
    for (const adv of list) {
      if (!BLOCKING_SEVERITIES.has(adv.severity)) continue;
      const ghsa = ghsaFromUrl(adv.url);
      if (ghsa && ignoredGhsas.has(ghsa)) continue;
      findings.push({ name, ghsa, adv });
    }
  }
  return findings;
}

async function main() {
  const ignored = readIgnoredGhsas();
  const payload = collectProdDependencies();
  const packageCount = Object.keys(payload).length;

  const res = await fetch(BULK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Fail closed — a broken/unavailable advisory endpoint must not pass silently.
    console.error(
      `[audit:prod] bulk advisory endpoint returned HTTP ${res.status}; treating as a gate failure.`,
    );
    process.exit(1);
  }

  const advisories = (await res.json()) as Record<string, BulkAdvisory[]>;
  const findings = selectBlockingFindings(advisories, ignored);

  if (findings.length === 0) {
    console.log(
      `[audit:prod] ✓ no un-ignored high/critical advisories across ${packageCount} prod packages`,
    );
    return;
  }

  console.error(
    `[audit:prod] ✗ ${findings.length} high/critical advisory(ies) in prod dependencies:`,
  );
  for (const { name, ghsa, adv } of findings) {
    console.error(
      `  ${name}  [${adv.severity}]  ${adv.title}  ${ghsa ?? adv.url}  (vulnerable: ${adv.vulnerable_versions})`,
    );
  }
  console.error(
    "\nFix: upgrade the dependency, or add a justified GHSA to package.json " +
      "pnpm.auditConfig.ignoreGhsas.",
  );
  process.exit(1);
}

// Only run when invoked directly (`tsx scripts/audit-prod-cves.ts`), not when
// imported by a test — keeps the pure exports side-effect-free under vitest.
if (/audit-prod-cves\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error("[audit:prod] failed:", err);
    process.exit(1);
  });
}
