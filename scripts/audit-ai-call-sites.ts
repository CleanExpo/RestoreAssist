import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
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
  evidence: string[];
  notes: string;
}

export interface AiCallSiteAuditReport {
  scannedAt: string;
  fileCount: number;
  callSiteCount: number;
  providerCounts: Record<AiProviderFamily, number>;
  taskClassCounts: Record<AiTaskClass, number>;
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
      "BYOK",
      "getLatestAIIntegration(",
      "ProviderConnection",
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
  const target = `${file}\n${content}`.toLowerCase();
  if (includesAny(target, ["embedding", "embeddings.create", "text-embedding"])) {
    return "embeddings";
  }
  if (includesAny(target, ["voice", "transcribe", "transcription", "realtime", "audio"])) {
    return "voice_realtime";
  }
  if (includesAny(target, ["vision", "image", "photo", "ocr", "reading", "sketch"])) {
    return "ocr_image_understanding";
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
  if (includesAny(target, ["classif", "tag", "label", "support-ticket", "interview", "question"])) {
    return "fast_classification";
  }
  if (includesAny(target, ["workflow", "agent", "automation", "margot"])) {
    return "workflow_automation";
  }
  return "unknown";
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
    ]);

  if (!hasAiSurface) return null;

  const evidence = [
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
    evidence,
    notes:
      taskClass === "unknown"
        ? "AI/provider surface detected but task class could not be inferred from filename/content."
        : "Detected by static source scan; review before migrating runtime behavior.",
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

  return {
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    callSiteCount: findings.length,
    providerCounts,
    taskClassCounts,
    findings,
  };
}

function printTextReport(report: AiCallSiteAuditReport): void {
  console.log("# AI Call-Site Audit");
  console.log(`Files scanned: ${report.fileCount}`);
  console.log(`AI surfaces found: ${report.callSiteCount}`);
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
    console.log(`  guardrails: ${finding.evidence.length ? finding.evidence.join(", ") : "none detected"}`);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const report = auditAiCallSites();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }
}
