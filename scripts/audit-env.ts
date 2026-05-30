import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

export type EnvFindingSeverity = "error" | "warning";

export interface EnvFinding {
  file: string;
  rule:
    | "forbidden-env-assignment"
    | "forbidden-env-documentation"
    | "missing-required-env-example"
    | "public-service-role-env";
  severity: EnvFindingSeverity;
  reason: string;
}

interface AuditEnvOptions {
  root?: string;
  files?: Record<string, string>;
}

interface AuditEnvResult {
  scannedAt: string;
  findingCount: number;
  errorCount: number;
  warningCount: number;
  findings: EnvFinding[];
}

const DEFAULT_SCAN_PATHS = [
  ".env.example",
  ".env.test.local.example",
  "vercel.json",
  "scripts/build.sh",
  "package.json",
  ".github/workflows",
  "app",
  "lib",
  "scripts",
] as const;

const REQUIRED_ENV_EXAMPLES = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_WEBHOOK_SECRET",
] as const;

const FORBIDDEN_ENV_NAMES = ["NODE_TLS_REJECT_UNAUTHORIZED"] as const;

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".env",
  ".example",
  ".js",
  ".json",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base.startsWith(".env")) return true;
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath));
}

function walkFiles(root: string, relativePath: string): string[] {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return isTextFile(absolute) ? [relativePath] : [];
  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(absolute)) {
    if (
      entry === ".git" ||
      entry === ".next" ||
      entry === "node_modules" ||
      entry === "mobile"
    ) {
      continue;
    }
    files.push(...walkFiles(root, path.join(relativePath, entry)));
  }
  return files;
}

function shouldAuditFile(file: string): boolean {
  return (
    file !== "scripts/audit-env.ts" &&
    !file.startsWith(`scripts${path.sep}__tests__${path.sep}`)
  );
}

function readScanFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const seen = new Set<string>();
  for (const scanPath of DEFAULT_SCAN_PATHS) {
    for (const file of walkFiles(root, scanPath)) {
      if (seen.has(file)) continue;
      seen.add(file);
      if (!shouldAuditFile(file)) continue;
      files[file] = fs.readFileSync(path.join(root, file), "utf8");
    }
  }
  return files;
}

function stripCommentLines(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed !== "" &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*")
      );
    })
    .join("\n");
}

function containsForbiddenAssignment(content: string, envName: string): boolean {
  const activeContent = stripCommentLines(content);
  const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b${escaped}\\s*[:=]\\s*["']?0\\b`),
    new RegExp(`process\\.env\\.${escaped}\\s*=\\s*["']?0["']?`),
    new RegExp(`process\\.env\\[["']${escaped}["']\\]\\s*=\\s*["']?0["']?`),
  ];
  return patterns.some((pattern) => pattern.test(activeContent));
}

function containsEnvName(content: string, envName: string): boolean {
  return new RegExp(`\\b${envName}\\b`).test(content);
}

function auditRequiredExamples(files: Record<string, string>): EnvFinding[] {
  const envExample = files[".env.example"] ?? "";
  return REQUIRED_ENV_EXAMPLES.filter(
    (envName) => !new RegExp(`^\\s*#?\\s*${envName}\\s*=`, "m").test(envExample),
  ).map((envName) => ({
    file: ".env.example",
    rule: "missing-required-env-example",
    severity: "error",
    reason: `.env.example does not document required env var ${envName}.`,
  }));
}

function auditPublicServiceRole(files: Record<string, string>): EnvFinding[] {
  const findings: EnvFinding[] = [];
  for (const [file, content] of Object.entries(files)) {
    const activeContent = stripCommentLines(content);
    if (/\bNEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*\b/.test(activeContent)) {
      findings.push({
        file,
        rule: "public-service-role-env",
        severity: "error",
        reason:
          "Service-role credentials must never use NEXT_PUBLIC_ names or be exposed to browser bundles.",
      });
    }
  }
  return findings;
}

function auditForbiddenEnv(files: Record<string, string>): EnvFinding[] {
  const findings: EnvFinding[] = [];
  for (const [file, content] of Object.entries(files)) {
    for (const envName of FORBIDDEN_ENV_NAMES) {
      if (containsForbiddenAssignment(content, envName)) {
        findings.push({
          file,
          rule: "forbidden-env-assignment",
          severity: "error",
          reason: `${envName}=0 disables Node TLS certificate verification and must not be set in repo config, scripts, workflows, or runtime code.`,
        });
      } else if (containsEnvName(content, envName)) {
        findings.push({
          file,
          rule: "forbidden-env-documentation",
          severity: "warning",
          reason: `${envName} is referenced in comments or documentation; verify it remains absent from production and preview envs.`,
        });
      }
    }
  }
  return findings;
}

export function auditEnv(options: AuditEnvOptions = {}): AuditEnvResult {
  const root = options.root ?? process.cwd();
  const files = options.files ?? readScanFiles(root);
  const findings = [
    ...auditForbiddenEnv(files),
    ...auditRequiredExamples(files),
    ...auditPublicServiceRole(files),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));

  const errorCount = findings.filter((finding) => finding.severity === "error")
    .length;
  const warningCount = findings.length - errorCount;

  return {
    scannedAt: new Date().toISOString(),
    findingCount: findings.length,
    errorCount,
    warningCount,
    findings,
  };
}

function printHuman(result: AuditEnvResult): void {
  console.log(
    `Env audit: ${result.errorCount} errors, ${result.warningCount} warnings`,
  );
  for (const finding of result.findings) {
    console.log(
      `- [${finding.severity}] ${finding.rule} ${finding.file}: ${finding.reason}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = auditEnv();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  if (result.errorCount > 0) process.exitCode = 1;
}
