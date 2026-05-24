import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

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
];

const PUBLIC_TOKEN_ROUTE_PREFIXES = [
  "app/api/portal/",
  "app/api/invites/",
  "app/api/authority-forms/sign/",
  "app/api/test/",
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
    content.includes("verifyAdminFromDb(")
  );
}

function findManyWithoutTake(content: string): boolean {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].includes(".findMany(")) continue;
    const window = lines.slice(index, index + 25).join("\n");
    if (!/\btake\s*:/.test(window)) return true;
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

export function auditApiRoute(file: string, content: string): ApiRouteFinding[] {
  const normalized = normalisePath(file);
  const findings: ApiRouteFinding[] = [];
  const isExempt = isPrefixMatch(normalized, EXEMPT_ROUTE_PREFIXES);
  const isPublicTokenRoute = isPrefixMatch(
    normalized,
    PUBLIC_TOKEN_ROUTE_PREFIXES,
  );

  if (!isExempt && !isPublicTokenRoute && !hasAuth(content)) {
    addFinding(
      findings,
      normalized,
      "api-auth-required",
      "error",
      "Route is not in an auth/cron/webhook exemption and does not call getServerSession/getToken/verifyAdminFromDb.",
    );
  }

  if (normalized.startsWith("app/api/admin/") && !content.includes("verifyAdminFromDb(")) {
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

  if (/NextResponse\.json\(\s*\{[^}]*error\s*:\s*[^}]*\.message/s.test(content)) {
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
      "Public/token route is unauthenticated by design candidate; verify token scope, expiry, revocation, audit event, and rate limit.",
      true,
    );
  }

  return findings;
}

export function auditApiRoutes(rootDir = process.cwd()): ApiRouteAuditReport {
  const routeRoot = path.join(rootDir, "app", "api");
  const routeFiles = walkRouteFiles(routeRoot);
  const findings = routeFiles.flatMap((file) =>
    auditApiRoute(
      path.relative(rootDir, file),
      readFileSync(file, "utf8"),
    ),
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

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes("--json");
  const strict = process.argv.includes("--strict");
  const report = auditApiRoutes();

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }

  if (strict && report.errorCount > 0) {
    process.exitCode = 1;
  }
}
