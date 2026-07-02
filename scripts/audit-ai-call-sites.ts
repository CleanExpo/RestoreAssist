import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AiTaskClass } from "../lib/ai/task-policy";

export type AiProviderFamily =
  | "anthropic"
  | "openai"
  | "gemini"
  | "restoreassist-ai"
  | "byok"
  | "rag-vector"
  | "local-or-hash"
  | "unknown";

export interface AiCallSiteFinding {
  file: string;
  providerFamilies: AiProviderFamily[];
  taskClass: AiTaskClass;
  modelHints: string[];
  tenantAware: boolean;
  usageCostObservable: boolean;
  fallbackVisible: boolean;
  maxRequestGuardrail: boolean;
  executionMode: "synchronous" | "queued" | "background" | "unknown";
  sendsSensitiveDataExternally: boolean;
  policyWrapped: boolean;
  /**
   * RA-6921 (P0) — true when a `app/**` request-route handler reads a
   * `process.env.*_API_KEY` (or a known env-fallback helper) directly instead
   * of resolving the calling workspace's own BYOK key. This means the
   * platform is spending its own provider key on a client's workload.
   */
  platformKeyFallback: boolean;
  evidence: string[];
  notes: string;
}

export interface AiCallSiteGuardrailSummary {
  unknownTaskClassCount: number;
  policyWrappedCount: number;
  sensitiveExternalProviderCount: number;
  platformKeyFallbackCount: number;
  platformKeyFallbackFiles: string[];
  ignoredFilePatterns: string[];
  pass: boolean;
}

export interface AiCallSiteAuditReport {
  scannedAt: string;
  fileCount: number;
  callSiteCount: number;
  providerCounts: Record<AiProviderFamily, number>;
  taskClassCounts: Record<AiTaskClass, number>;
  guardrailSummary: AiCallSiteGuardrailSummary;
  findings: AiCallSiteFinding[];
}

const SCAN_ROOTS = ["app", "lib", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const IGNORED_SEGMENTS = new Set(["node_modules", ".next", "dist", "coverage"]);
const IGNORED_FILE_PATTERNS = [
  "/__tests__/",
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  "scripts/audit-ai-call-sites.ts",
];

export function getAiAuditIgnoredFilePatterns(): string[] {
  return [...IGNORED_FILE_PATTERNS];
}

function normalisePath(file: string): string {
  return file.split(path.sep).join("/");
}

function walkSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_SEGMENTS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function shouldIgnoreFile(file: string): boolean {
  const normalized = normalisePath(file);
  return IGNORED_FILE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function includesAny(content: string, needles: string[]): boolean {
  return needles.some((needle) => content.includes(needle));
}

function hasTaskPolicyCall(content: string): boolean {
  return /\brequireAiTaskPolicy\(\s*["'][a-z_]+["']/.test(content);
}

function detectProviderFamilies(content: string): AiProviderFamily[] {
  const providers: AiProviderFamily[] = [];
  if (
    includesAny(content, [
      "@anthropic-ai/sdk",
      "new Anthropic(",
      "anthropic.messages.create",
      "callAnthropic(",
      "callAnthropicWithFallback(",
      "callAnthropicStream(",
      "https://api.anthropic.com/",
    ])
  ) {
    providers.push("anthropic");
  }
  if (
    includesAny(content, [
      "from \"openai\"",
      "from 'openai'",
      "new OpenAI(",
      "openai.chat.completions.create",
      "openai.embeddings.create",
      "https://api.openai.com/",
    ])
  ) {
    providers.push("openai");
  }
  if (
    includesAny(content, [
      "@google/generative-ai",
      "GoogleGenerativeAI",
      "getGenerativeModel",
      "gemini-",
      "Gemini",
    ])
  ) {
    providers.push("gemini");
  }
  if (
    includesAny(content, [
      "restoreAssistAiDispatch(",
      "callGemma(",
      "gemma",
      "RESTOREASSIST_AI",
    ])
  ) {
    providers.push("restoreassist-ai");
  }
  if (
    includesAny(content, [
      "byokDispatch(",
      "BYOK_ALLOWED_MODELS",
      "byok-client",
      "byok-vision-client",
      "getLatestAIIntegration(",
      "workspace-byok-dispatch",
    ])
  ) {
    providers.push("byok");
  }
  if (
    includesAny(content, [
      "IicrcChunk",
      "<=>",
      "retrieveRelevant",
      "retrieveIicrc",
      "standards-retrieval",
      "lib/rag",
    ])
  ) {
    providers.push("rag-vector");
  }
  if (includesAny(content, ["hash-fallback", "local-stt", "whisper.cpp", "WhisperKit"])) {
    providers.push("local-or-hash");
  }
  return unique(providers);
}

function extractModelHints(content: string): string[] {
  const hints = new Set<string>();
  const patterns = [
    /\bclaude-[a-z0-9.-]+/gi,
    /\bgpt-[a-z0-9.-]+/gi,
    /\bgemini-[a-z0-9.-]+/gi,
    /\btext-embedding-[a-z0-9.-]+/gi,
    /\bgemma-[a-z0-9.-]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      hints.add(match[0]);
    }
  }
  if (content.includes("model:")) hints.add("dynamic-model-field");
  return Array.from(hints).sort();
}

export function classifyAiTask(file: string, content: string): AiTaskClass {
  const normalizedFile = file.toLowerCase();
  const target = `${file}\n${content}`.toLowerCase();
  if (includesAny(target, ["embedding", "embeddings.create", "text-embedding"])) {
    return "embeddings";
  }
  if (normalizedFile.includes("draft-support-ticket")) {
    return "support_response_draft";
  }
  if (normalizedFile.includes("analyse-support-ticket")) {
    return "support_ticket_analysis";
  }
  if (normalizedFile.includes("analytics-narrative")) {
    return "workflow_automation";
  }
  if (includesAny(target, ["vision", "image", "photo", "ocr", "reading", "sketch"])) {
    return "ocr_image_understanding";
  }
  if (includesAny(target, ["analyse-support", "support-ticket", "support ticket", "classif", "tag", "label", "interview", "question"])) {
    return "fast_classification";
  }
  if (includesAny(target, ["voice", "transcribe", "transcription", "realtime", "audio"])) {
    return "voice_realtime";
  }
  if (
    includesAny(target, [
      "iicrcchunk",
      "retrieveRelevant".toLowerCase(),
      "retrieveiicrc",
      "standards-retrieval",
      "lib/rag",
      "false-citation",
    ])
  ) {
    return "standards_rag_lookup";
  }
  if (includesAny(target, ["report", "scope", "synopsis", "manifest", "summary", "draft"])) {
    return "report_drafting";
  }
  if (includesAny(target, ["workflow", "agent", "automation", "margot"])) {
    return "workflow_automation";
  }
  return "unknown";
}

const PLATFORM_KEY_ENV_PATTERN = /process\.env\.[A-Z0-9_]*_API_KEY\b/;

/**
 * Named AI-provider env keys only — deliberately narrower than
 * PLATFORM_KEY_ENV_PATTERN so a route reading an unrelated *_API_KEY
 * (RESEND_API_KEY, ASCORA_API_KEY, LINEAR_API_KEY, ...) isn't misclassified
 * as an AI call site just for having "API_KEY" in the name.
 */
const AI_PROVIDER_KEY_ENV_PATTERN =
  /process\.env\.(ANTHROPIC|OPENAI|GEMINI|GOOGLE_GENERATIVE_AI)_API_KEY\b/;

/**
 * Sanctioned BYOK resolution markers. A route that reads a platform env-var
 * key AND shows one of these is assumed to be using it only as a last-resort
 * fallback path that is itself gated elsewhere (e.g. behind a feature flag) —
 * a route with NEITHER marker is spending the platform's own key outright.
 */
const BYOK_MARKERS = [
  "resolveWorkspaceAiKey(",
  "byokDispatch(",
  "workspace-byok-dispatch",
  "workspaceByokDispatch(",
  "workspaceRouteAiRequest(",
  "getProviderApiKey(",
  "resolveReportProvider(",
];

/**
 * RA-6921 (P0) — detect a `app/**` route handler that reads a platform
 * `process.env.*_API_KEY` directly (or via `lib/ai-provider.ts`'s
 * `selectAnthropicApiKey` env-fallback helper) without resolving the calling
 * workspace's own BYOK key anywhere in the file.
 */
function hasPlatformKeyFallback(file: string, content: string): boolean {
  const normalized = normalisePath(file);
  if (!normalized.startsWith("app/")) return false; // lib/ platform-ops call sites are out of scope
  const readsEnvKey =
    PLATFORM_KEY_ENV_PATTERN.test(content) ||
    content.includes("selectAnthropicApiKey(");
  if (!readsEnvKey) return false;
  return !BYOK_MARKERS.some((marker) => content.includes(marker));
}

function detectExecutionMode(file: string, content: string): AiCallSiteFinding["executionMode"] {
  const target = `${file}\n${content}`.toLowerCase();
  if (includesAny(target, ["queue", "cron", "setimmediate", "background", "batch"])) {
    return "background";
  }
  if (includesAny(target, ["job", "enqueue", "worker"])) return "queued";
  if (includesAny(target, ["export async function get", "export async function post", "await "])) {
    return "synchronous";
  }
  return "unknown";
}

export function auditAiCallSite(file: string, content: string): AiCallSiteFinding | null {
  const normalized = normalisePath(file);
  const providerFamilies = detectProviderFamilies(content);
  const hasAiSurface =
    providerFamilies.length > 0 ||
    includesAny(content, [
      "routeAiRequest(",
      "generateText(",
      "generateObject(",
      "streamText(",
      "AiUsageLog",
      "aiUsageLog",
    ]) ||
    // A bare AI-provider-key read is itself an AI surface — a route reading
    // process.env.ANTHROPIC_API_KEY etc. directly is spending platform AI
    // budget even when it doesn't go through a recognised SDK/helper call
    // pattern above (e.g. a raw fetch()).
    AI_PROVIDER_KEY_ENV_PATTERN.test(content) ||
    content.includes("selectAnthropicApiKey(");

  if (!hasAiSurface) return null;

  const evidence = [
    hasTaskPolicyCall(content) ? "policy-wrapper" : "",
    content.includes("buildAiUsageMetadata(") ? "usage-metadata" : "",
    content.includes("checkWorkspaceBudget(") ? "budget-check" : "",
    content.includes("logAiUsage(") || content.includes("aiUsageLog") ? "usage-log" : "",
    /\bmax_tokens\b|\bmaxTokens\b|\bmaxOutputTokens\b|\bmaxInputTokens\b/.test(content)
      ? "max-token-or-request-cap"
      : "",
    /fallback|tryClaudeModels|fellBack|allowsFallback/i.test(content) ? "fallback" : "",
    /workspaceId|workspace\.id|organizationId|tenantId|memberId|userId/.test(content)
      ? "tenant-context"
      : "",
  ].filter(Boolean);

  const taskClass = classifyAiTask(normalized, content);
  return {
    file: normalized,
    providerFamilies: providerFamilies.length > 0 ? providerFamilies : ["unknown"],
    taskClass,
    modelHints: extractModelHints(content),
    tenantAware: /workspaceId|workspace\.id|organizationId|tenantId|memberId|userId/.test(
      content,
    ),
    usageCostObservable: content.includes("logAiUsage(") || content.includes("aiUsageLog"),
    fallbackVisible: /fallback|tryClaudeModels|fellBack|allowsFallback/i.test(content),
    maxRequestGuardrail:
      /\bmax_tokens\b|\bmaxTokens\b|\bmaxOutputTokens\b|\bmaxInputTokens\b|timeoutMs|sizeLimit|MAX_/i.test(
        content,
      ),
    executionMode: detectExecutionMode(normalized, content),
    sendsSensitiveDataExternally:
      providerFamilies.some((provider) =>
        ["anthropic", "openai", "gemini", "byok"].includes(provider),
      ) && !normalized.includes("__tests__"),
    policyWrapped: hasTaskPolicyCall(content),
    platformKeyFallback: hasPlatformKeyFallback(normalized, content),
    evidence,
    notes:
      taskClass === "unknown"
        ? "AI/provider surface detected but task class could not be inferred from filename/content."
        : "Detected by static source scan; review before migrating runtime behavior.",
  };
}

export function buildAiCallSiteGuardrailSummary(
  findings: AiCallSiteFinding[],
): AiCallSiteGuardrailSummary {
  const unknownTaskClassCount = findings.filter(
    (finding) => finding.taskClass === "unknown",
  ).length;

  const platformKeyFallbackFindings = findings.filter(
    (finding) => finding.platformKeyFallback,
  );

  return {
    unknownTaskClassCount,
    policyWrappedCount: findings.filter((finding) => finding.policyWrapped).length,
    sensitiveExternalProviderCount: findings.filter(
      (finding) => finding.sendsSensitiveDataExternally,
    ).length,
    platformKeyFallbackCount: platformKeyFallbackFindings.length,
    platformKeyFallbackFiles: platformKeyFallbackFindings
      .map((finding) => finding.file)
      .sort(),
    ignoredFilePatterns: getAiAuditIgnoredFilePatterns(),
    pass: unknownTaskClassCount === 0,
  };
}

export function auditAiCallSites(rootDir = process.cwd()): AiCallSiteAuditReport {
  const files = SCAN_ROOTS.flatMap((root) => walkSourceFiles(path.join(rootDir, root)))
    .filter((file) => !shouldIgnoreFile(path.relative(rootDir, file)));
  const findings = files
    .map((file) => auditAiCallSite(path.relative(rootDir, file), readFileSync(file, "utf8")))
    .filter((finding): finding is AiCallSiteFinding => finding !== null);

  const providerCounts = Object.fromEntries(
    ([
      "anthropic",
      "openai",
      "gemini",
      "restoreassist-ai",
      "byok",
      "rag-vector",
      "local-or-hash",
      "unknown",
    ] as AiProviderFamily[]).map((provider) => [
      provider,
      findings.filter((finding) => finding.providerFamilies.includes(provider)).length,
    ]),
  ) as Record<AiProviderFamily, number>;

  const taskClassCounts = Object.fromEntries(
    ([
      "fast_classification",
      "support_response_draft",
      "support_ticket_analysis",
      "ocr_image_understanding",
      "report_drafting",
      "standards_rag_lookup",
      "voice_realtime",
      "workflow_automation",
      "embeddings",
      "unknown",
    ] as AiTaskClass[]).map((taskClass) => [
      taskClass,
      findings.filter((finding) => finding.taskClass === taskClass).length,
    ]),
  ) as Record<AiTaskClass, number>;
  const guardrailSummary = buildAiCallSiteGuardrailSummary(findings);

  return {
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    callSiteCount: findings.length,
    providerCounts,
    taskClassCounts,
    guardrailSummary,
    findings,
  };
}

function printTextReport(report: AiCallSiteAuditReport): void {
  console.log("# AI Call-Site Audit");
  console.log(`Files scanned: ${report.fileCount}`);
  console.log(`AI surfaces found: ${report.callSiteCount}`);
  console.log(`Policy-wrapped surfaces: ${report.guardrailSummary.policyWrappedCount}`);
  console.log(
    `Sensitive external-provider surfaces: ${report.guardrailSummary.sensitiveExternalProviderCount}`,
  );
  console.log(`Unknown task classes: ${report.guardrailSummary.unknownTaskClassCount}`);
  console.log(
    `Platform-key-fallback routes: ${report.guardrailSummary.platformKeyFallbackCount}`,
  );
  console.log("");
  console.log("Provider counts:");
  for (const [provider, count] of Object.entries(report.providerCounts)) {
    console.log(`- ${provider}: ${count}`);
  }
  console.log("");
  console.log("Task class counts:");
  for (const [taskClass, count] of Object.entries(report.taskClassCounts)) {
    console.log(`- ${taskClass}: ${count}`);
  }
  console.log("");
  for (const finding of report.findings) {
    console.log(`- ${finding.file}`);
    console.log(`  providers: ${finding.providerFamilies.join(", ")}`);
    console.log(`  task: ${finding.taskClass}`);
    console.log(`  policy wrapped: ${finding.policyWrapped ? "yes" : "no"}`);
    console.log(`  guardrails: ${finding.evidence.length ? finding.evidence.join(", ") : "none detected"}`);
  }
}

const PLATFORM_KEY_FALLBACK_BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ai-platform-key-fallback-baseline.json",
);

/**
 * RA-6921 (P0) platform-key-fallback register — `pendingMigration` is a
 * ratchet baseline (routes still owed a move to workspace BYOK);
 * `platformInternalExceptions` are staff-only/webhook routes intentionally
 * left on the platform key forever. Both suppress the gate; only
 * `pendingMigration` should ever shrink toward zero.
 */
export function readPlatformKeyFallbackBaseline(): string[] {
  if (!existsSync(PLATFORM_KEY_FALLBACK_BASELINE_PATH)) return [];
  try {
    const raw = JSON.parse(
      readFileSync(PLATFORM_KEY_FALLBACK_BASELINE_PATH, "utf8"),
    );
    const pending = Array.isArray(raw.pendingMigration)
      ? raw.pendingMigration
      : [];
    const exceptions =
      raw.platformInternalExceptions &&
      typeof raw.platformInternalExceptions === "object"
        ? Object.keys(raw.platformInternalExceptions)
        : [];
    return [...pending, ...exceptions];
  } catch {
    return [];
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const report = auditAiCallSites();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }
  if (process.argv.includes("--gate")) {
    let failed = false;
    if (!report.guardrailSummary.pass) {
      console.error(
        `AI guardrail audit failed: ${report.guardrailSummary.unknownTaskClassCount} unknown task class finding(s).`,
      );
      failed = true;
    }

    const baseline = readPlatformKeyFallbackBaseline();
    const netNew = report.guardrailSummary.platformKeyFallbackFiles.filter(
      (file) => !baseline.includes(file),
    );
    if (netNew.length > 0) {
      console.error(
        `AI guardrail audit failed: ${netNew.length} NEW platform-key-fallback route(s) ` +
          `(RA-6921 P0 — must resolve BYOK via resolveWorkspaceAiKey, not process.env):\n` +
          netNew.map((file) => `  - ${file}`).join("\n"),
      );
      failed = true;
    }

    if (failed) process.exitCode = 1;
  }
}
