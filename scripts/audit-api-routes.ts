import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

export type AuditSeverity = "error" | "warning";

export interface ApiRouteFinding {
  file: string;
  rule: string;
  severity: AuditSeverity;
  reason: string;
  exception: boolean;
}

export interface ApiRouteAuditReport {
  scannedAt: string;
  routeCount: number;
  findingCount: number;
  errorCount: number;
  warningCount: number;
  findings: ApiRouteFinding[];
}

const EXEMPT_ROUTE_PREFIXES = [
  "app/api/auth/",
  "app/api/cron/",
  "app/api/webhooks/",
  // Headless internal service routes — bearer-token authenticated (a dedicated
  // secret, compared with timingSafeEqual, failing closed), session-less by
  // design exactly like /api/cron. No end-user session ever reaches them.
  "app/api/internal/",
];

const PUBLIC_TOKEN_ROUTE_PREFIXES = [
  // Homeowner capture flow — capability-token-scoped (verifyCaptureToken),
  // unauthenticated-by-design like the portal routes (rate-limit + BotID + CSRF).
  "app/api/capture/",
  "app/api/contractors/",
  "app/api/health/",
  "app/api/inspections/checklists/",
  "app/api/integrations/oauth/",
  "app/api/portal/",
  "app/api/invites/",
  "app/api/oauth/google-drive/callback/",
  "app/api/oauth/microsoft-onedrive/callback/",
  "app/api/observability/client-error/",
  "app/api/properties/scrape/health/",
  "app/api/authority-forms/sign/",
];

function normalisePath(file: string): string {
  return file.split(path.sep).join("/");
}

function walkRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkRouteFiles(fullPath));
      continue;
    }
    if (entry === "route.ts") files.push(fullPath);
  }
  return files.sort();
}

function isPrefixMatch(file: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => file.startsWith(prefix));
}

function addFinding(
  findings: ApiRouteFinding[],
  file: string,
  rule: string,
  severity: AuditSeverity,
  reason: string,
  exception = false,
): void {
  findings.push({ file, rule, severity, reason, exception });
}

function hasAuth(content: string): boolean {
  return (
    content.includes("getServerSession(") ||
    content.includes("getToken(") ||
    content.includes("verifyAdminFromDb(") ||
    // requireOwner() is the codebase's named ownership gate; it resolves to
    // getServerSession internally. Recognising it here is behaviour-based
    // (any route that actually calls the gate passes) rather than path-exempt.
    content.includes("requireOwner(")
  );
}

function hasTestHelperEnvGuard(content: string): boolean {
  // Inline guard (historical form) OR the centralized two-key predicate
  // testHelpersBlocked() from app/api/test/_helpers.ts, which performs the same
  // ALLOW_TEST_HELPERS check plus the VERCEL_ENV production hard-block. Both are
  // behaviour-based (the route calls the gate), matching requireOwner() above.
  return (
    /process\.env\.ALLOW_TEST_HELPERS\s*!==\s*["']true["']/.test(content) ||
    /\btestHelpersBlocked\s*\(/.test(content)
  );
}

// An unbounded findMany may be intentional (e.g. a small, fixed-cardinality
// lookup). Authors opt out per-call by annotating the call — inline, or within
// the ~3 lines immediately preceding it — with a `// ra-query-ok` comment.
function isQueryExempt(
  content: string,
  callStart: number,
  call: string,
): boolean {
  if (/ra-query-ok/.test(call)) return true;
  const precedingLines = content
    .slice(Math.max(0, callStart - 240), callStart)
    .split("\n")
    .slice(-3)
    .join("\n");
  return /ra-query-ok/.test(precedingLines);
}

function findManyWithoutTake(content: string): boolean {
  const marker = ".findMany(";
  let start = content.indexOf(marker);

  while (start !== -1) {
    const openParen = content.indexOf("(", start);
    let depth = 0;
    let end = openParen;

    for (let index = openParen; index < content.length; index++) {
      const char = content[index];
      if (char === "(") depth++;
      if (char === ")") depth--;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }

    const call = content.slice(start, end);
    if (!/\btake\s*:/.test(call) && !isQueryExempt(content, start, call)) {
      return true;
    }
    start = content.indexOf(marker, end);
  }

  return false;
}

function hasUnsafeRawSql(content: string): boolean {
  return (
    content.includes("$queryRawUnsafe") ||
    content.includes("$executeRawUnsafe") ||
    /\$queryRaw\s*`/.test(content) ||
    /\$executeRaw\s*`/.test(content)
  );
}

function hasRawSqlWithoutTaggedTemplate(content: string): boolean {
  return (
    /\$queryRaw\s*\(/.test(content) &&
    !content.includes("Prisma.sql") &&
    !content.includes("prisma.$queryRaw<")
  );
}

function extractNextResponseJsonCalls(content: string): string[] {
  const calls: string[] = [];
  const marker = "NextResponse.json(";
  let start = content.indexOf(marker);

  while (start !== -1) {
    let depth = 0;
    let end = start;

    for (
      let index = start + marker.length - 1;
      index < content.length;
      index++
    ) {
      const char = content[index];
      if (char === "(") depth++;
      if (char === ")") depth--;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }

    calls.push(content.slice(start, end));
    start = content.indexOf(marker, end);
  }

  return calls;
}

function hasGeneric500BodyLeak(content: string): boolean {
  return extractNextResponseJsonCalls(content).some((call) => {
    if (
      !/\bstatus\s*:\s*500\b/.test(call) &&
      !/\bstatus\s*:\s*result\.status\b/.test(call)
    ) {
      return false;
    }

    const leaksMessage =
      /\b(error|message|details)\s*:\s*[\w$?.]+\.message\b/s.test(call) ||
      /\b(error|message|details)\s*:\s*[\w$?.]+ instanceof Error\s*\?[\s\S]*?\.message/s.test(
        call,
      );

    if (!leaksMessage) return false;

    return !/(?:status|result\.status)\s*(?:===|>=)\s*500\s*\?\s*"Internal server error"\s*:\s*[\w$?.]+\.message/s.test(
      call,
    );
  });
}

export function auditApiRoute(
  file: string,
  content: string,
): ApiRouteFinding[] {
  const normalized = normalisePath(file);
  const findings: ApiRouteFinding[] = [];
  const isExempt = isPrefixMatch(normalized, EXEMPT_ROUTE_PREFIXES);
  const isGuardedTestHelper =
    normalized.startsWith("app/api/test/") && hasTestHelperEnvGuard(content);
  const isPublicTokenRoute = isPrefixMatch(
    normalized,
    PUBLIC_TOKEN_ROUTE_PREFIXES,
  );

  if (
    !isExempt &&
    !isPublicTokenRoute &&
    !isGuardedTestHelper &&
    !hasAuth(content)
  ) {
    addFinding(
      findings,
      normalized,
      "api-auth-required",
      "error",
      "Route is not in an auth/cron/webhook exemption and does not call getServerSession/getToken/verifyAdminFromDb.",
    );
  }

  if (
    normalized.startsWith("app/api/admin/") &&
    !content.includes("verifyAdminFromDb(")
  ) {
    addFinding(
      findings,
      normalized,
      "admin-db-role-revalidation",
      "error",
      "Admin route does not call verifyAdminFromDb; JWT role claims can be stale after demotion.",
    );
  }

  if (findManyWithoutTake(content)) {
    addFinding(
      findings,
      normalized,
      "prisma-findmany-take",
      "warning",
      "At least one Prisma findMany call does not include an explicit take within the local query block.",
    );
  }

  if (hasUnsafeRawSql(content)) {
    addFinding(
      findings,
      normalized,
      "raw-sql-unsafe",
      "error",
      "Route uses raw SQL without the Prisma.sql tagged-template safety pattern or uses an unsafe raw method.",
    );
  }

  if (hasRawSqlWithoutTaggedTemplate(content)) {
    addFinding(
      findings,
      normalized,
      "raw-sql-untagged",
      "warning",
      "Route uses prisma.$queryRaw(...) without an obvious Prisma.sql tagged template.",
    );
  }

  if (hasGeneric500BodyLeak(content)) {
    addFinding(
      findings,
      normalized,
      "generic-500-body",
      "error",
      "Route appears to return error.message in a JSON error body.",
    );
  }

  if (isPublicTokenRoute && !hasAuth(content)) {
    addFinding(
      findings,
      normalized,
      "public-token-route-review",
      "warning",
      "Public/token/monitoring route is unauthenticated by design candidate; verify scope, expiry where applicable, audit event, and rate limit.",
      true,
    );
  }

  return findings;
}

export function auditApiRoutes(rootDir = process.cwd()): ApiRouteAuditReport {
  const routeRoot = path.join(rootDir, "app", "api");
  const routeFiles = walkRouteFiles(routeRoot);
  const findings = routeFiles.flatMap((file) =>
    auditApiRoute(path.relative(rootDir, file), readFileSync(file, "utf8")),
  );

  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;

  return {
    scannedAt: new Date().toISOString(),
    routeCount: routeFiles.length,
    findingCount: findings.length,
    errorCount,
    warningCount: findings.length - errorCount,
    findings,
  };
}

function printTextReport(report: ApiRouteAuditReport): void {
  console.log(`# API Route Audit`);
  console.log(`Routes scanned: ${report.routeCount}`);
  console.log(`Findings: ${report.findingCount}`);
  console.log(`Errors: ${report.errorCount}`);
  console.log(`Warnings: ${report.warningCount}`);
  console.log("");

  for (const finding of report.findings) {
    const exception = finding.exception ? " exception-candidate" : "";
    console.log(
      `- [${finding.severity}]${exception} ${finding.file} :: ${finding.rule}`,
    );
    console.log(`  ${finding.reason}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const json = process.argv.includes("--json");
  const report = auditApiRoutes();

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }

  // Errors are always fatal so the gate actually bites in CI (RA-6937);
  // warnings stay non-fatal. `--strict` is retained as a no-op for
  // backwards compatibility with existing invocations.
  if (report.errorCount > 0) {
    process.exitCode = 1;
  }
}
