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
 * Platform-fallback helper markers. A route that calls one of these
 * `lib/ai-provider.ts` helpers delegates its key resolution to a helper that
 * itself falls back to `process.env.ANTHROPIC_API_KEY` — so the platform-spend
 * leak is invisible in the route's own text. Treat such a call the same as a
 * bare env read: a platform-key fallback unless the route ALSO resolves BYOK.
 */
const PLATFORM_KEY_HELPER_MARKERS = [
  "selectAnthropicApiKey(",
  "getAnthropicApiKey(",
];

/**
 * RA-6921 (P0) / RA-6932 / RA-6965 — detect a `app/**` route handler that
 * reaches the platform Anthropic key without resolving the calling workspace's
 * own BYOK key. The leak can surface three ways, all treated identically:
 *   1. the route reads `process.env.*_API_KEY` in its own text;
 *   2. the route calls the `selectAnthropicApiKey` / `getAnthropicApiKey`
 *      env-fallback helpers in its own text; or
 *   3. RA-6965 — the route delegates key resolution to a lib helper that (transitively)
 *      falls back to the platform key, so nothing in the route's OWN text gives
 *      it away (`libDelegated`, computed from the import graph in
 *      `auditAiCallSites`).
 * Any of these WITHOUT a BYOK resolution marker is a platform-key leak.
 */
function hasPlatformKeyFallback(
  file: string,
  content: string,
  libDelegated = false,
): boolean {
  const normalized = normalisePath(file);
  if (!normalized.startsWith("app/")) return false; // lib/ platform-ops call sites are out of scope
  const readsEnvKey =
    PLATFORM_KEY_ENV_PATTERN.test(content) ||
    PLATFORM_KEY_HELPER_MARKERS.some((marker) => content.includes(marker)) ||
    libDelegated;
  if (!readsEnvKey) return false;
  return !BYOK_MARKERS.some((marker) => content.includes(marker));
}

/**
 * Env-fallback resolver helper NAMES (derived from PLATFORM_KEY_HELPER_MARKERS)
 * — the lib/ai-provider.ts functions whose body resolves the platform
 * ANTHROPIC_API_KEY as a last-resort fallback. A module that DEFINES one of
 * these is the resolver source; a module that imports and CALLS one (directly,
 * or an export of a module that does) is a "platform-key delegate" whose
 * platform spend is invisible in the calling route's own text.
 */
const PLATFORM_KEY_HELPER_NAMES = PLATFORM_KEY_HELPER_MARKERS.map((marker) =>
  marker.replace(/\($/, ""),
);

const MODULE_RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

interface ImportedBinding {
  specifier: string;
  exportedName: string;
  localName: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the VALUE bindings a source file imports — named static imports
 * (`import { a, b as c } from "x"`) and destructured dynamic imports
 * (`const { a } = await import("x")`). Type-only imports are skipped (a type
 * cannot resolve or spend a key at runtime). Default and namespace imports are
 * intentionally NOT tracked (documented limit) — the platform-key helpers and
 * gateways are all consumed as named exports.
 */
function extractValueImports(content: string): ImportedBinding[] {
  const bindings: ImportedBinding[] = [];

  const namedImport =
    /import\s+(type\s+)?(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(namedImport)) {
    if (match[1]) continue; // `import type { … }` — type-only, no runtime binding
    const specifier = match[3];
    for (const raw of match[2].split(",")) {
      const piece = raw.trim();
      if (!piece || piece.startsWith("type ")) continue; // inline `type` modifier
      const [exported, local] = piece.split(/\s+as\s+/);
      const exportedName = exported.trim();
      if (!exportedName) continue;
      bindings.push({
        specifier,
        exportedName,
        localName: (local ?? exported).trim(),
      });
    }
  }

  const dynamicImport =
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(dynamicImport)) {
    const specifier = match[2];
    for (const raw of match[1].split(",")) {
      const piece = raw.trim();
      if (!piece) continue;
      const [exported, local] = piece.split(/\s*:\s*/); // destructure rename uses `:`
      const exportedName = exported.trim();
      if (!exportedName) continue;
      bindings.push({
        specifier,
        exportedName,
        localName: (local ?? exported).trim(),
      });
    }
  }

  return bindings;
}

/** Every value + type export name declared by a module. */
function extractExportedNames(content: string): Set<string> {
  const names = new Set<string>();
  const declPatterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:type|interface|enum)\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const pattern of declPatterns) {
    for (const match of content.matchAll(pattern)) names.add(match[1]);
  }
  const exportList = /export\s*(?:type\s+)?\{([^}]*)\}/g;
  for (const match of content.matchAll(exportList)) {
    for (const raw of match[1].split(",")) {
      const piece = raw.trim();
      if (!piece) continue;
      const parts = piece.split(/\s+as\s+/);
      const name = (parts[1] ?? parts[0]).replace(/^type\s+/, "").trim();
      if (name && name !== "default") names.add(name);
    }
  }
  return names;
}

/** Resolve an import specifier to an absolute source file, or null for a bare package. */
function resolveModuleSpecifier(
  fromFileAbs: string,
  specifier: string,
  rootDir: string,
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = path.join(rootDir, specifier.slice(2)); // tsconfig paths: `@/*` -> `./*`
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.resolve(path.dirname(fromFileAbs), specifier);
  } else {
    return null;
  }
  const candidates = [
    base,
    ...MODULE_RESOLVE_EXTENSIONS.map((ext) => base + ext),
    ...MODULE_RESOLVE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Return the raw argument text of every call to `localName(` in `content`,
 * balancing parentheses so nested calls/objects are captured whole. Best-effort
 * and deterministic (string/comment literals are not specially parsed).
 */
function findCallArgs(content: string, localName: string): string[] {
  const args: string[] = [];
  const callToken = new RegExp(`\\b${escapeRegExp(localName)}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = callToken.exec(content)) !== null) {
    let index = match.index + match[0].length;
    const start = index;
    let depth = 1;
    while (index < content.length && depth > 0) {
      const ch = content[index];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      index++;
    }
    args.push(content.slice(start, index - 1));
  }
  return args;
}

/**
 * True when `content` contains a call that (transitively) resolves the platform
 * Anthropic key — the signal that a file delegates its key resolution to a
 * helper that falls back to the platform key, invisible in the file's own text.
 *
 * Two call shapes count:
 *   - an UNCONDITIONAL env-fallback resolver (getAnthropicApiKey /
 *     selectAnthropicApiKey): every call resolves the platform key; and
 *   - a CONDITIONAL delegate export (an export of a module already in
 *     `taintedExports`, e.g. anthropic-gateway's callAnthropic) called WITHOUT
 *     an explicit `apiKey` argument — a call that threads a key
 *     (`callAnthropic({ apiKey })`, `retrieveRelevantStandards(q, key)`) is
 *     BYOK-safe and deliberately does NOT count.
 */
function delegatesToPlatformKey(
  fileAbs: string,
  content: string,
  taintedExports: Map<string, Set<string>>,
  rootDir: string,
): boolean {
  for (const binding of extractValueImports(content)) {
    const calls = findCallArgs(content, binding.localName);
    if (calls.length === 0) continue;
    if (PLATFORM_KEY_HELPER_NAMES.includes(binding.exportedName)) return true;
    const target = resolveModuleSpecifier(fileAbs, binding.specifier, rootDir);
    if (!target) continue;
    const tainted = taintedExports.get(target);
    if (!tainted || !tainted.has(binding.exportedName)) continue;
    // A call that omits an explicit apiKey falls back to the platform key.
    if (calls.some((argText) => !/apikey/i.test(argText))) return true;
  }
  return false;
}

/**
 * RA-6965 — build the platform-key DELEGATE graph via a transitive closure over
 * the lib import graph, returning each delegate module's tainted export names.
 *
 * Seed: modules that DEFINE an env-fallback resolver helper (getAnthropicApiKey
 * / selectAnthropicApiKey). For a resolver SOURCE module only the resolver
 * names are tainted, so sibling BYOK helpers exported from the same file (e.g.
 * lib/ai-provider.ts's getIntegrationsForUser) are never treated as a leak
 * vector. Every OTHER module that imports and CALLS a tainted export becomes a
 * delegate whose ENTIRE export surface is tainted, because it resolves the
 * platform key internally on its callers' behalf — this is what carries the
 * taint down the anthropic-gateway -> group-readings service chain.
 *
 * The closure is anchored on the curated resolver helpers (the same
 * PLATFORM_KEY_HELPER_MARKERS the in-file check uses) rather than on raw
 * `process.env.*_API_KEY` reads, so platform-ops modules that read the env key
 * directly for internal-only work (cron/admin/harness classifiers) stay out of
 * scope — exactly as the existing in-file detector leaves them.
 *
 * Documented limits: single named-export granularity (default/namespace
 * re-exports are not followed); a newly introduced env-fallback resolver must
 * be added to PLATFORM_KEY_HELPER_MARKERS to anchor the closure.
 */
function buildPlatformKeyDelegateExports(
  fileContents: Map<string, string>,
  rootDir: string,
): Map<string, Set<string>> {
  const taintedExports = new Map<string, Set<string>>();
  const definerModules = new Set<string>();

  for (const [abs, content] of fileContents) {
    const exported = extractExportedNames(content);
    const defined = PLATFORM_KEY_HELPER_NAMES.filter((name) => exported.has(name));
    if (defined.length > 0) {
      taintedExports.set(abs, new Set(defined));
      definerModules.add(abs);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [abs, content] of fileContents) {
      if (definerModules.has(abs)) continue; // resolver source stays resolver-only
      if (taintedExports.has(abs)) continue; // already a fully-tainted delegate
      if (!delegatesToPlatformKey(abs, content, taintedExports, rootDir)) continue;
      taintedExports.set(abs, extractExportedNames(content));
      changed = true;
    }
  }

  return taintedExports;
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

export function auditAiCallSite(
  file: string,
  content: string,
  libDelegated = false,
): AiCallSiteFinding | null {
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
    content.includes("selectAnthropicApiKey(") ||
    // A route that resolves its key via lib/ai-provider.ts's getAnthropicApiKey
    // helper is likewise an AI surface — the helper falls back to the platform
    // ANTHROPIC_API_KEY, so the leak is invisible in the route's own text.
    content.includes("getAnthropicApiKey(") ||
    // RA-6965 — a route that delegates key resolution to a lib helper which
    // (transitively) falls back to the platform key is an AI surface even when
    // NOTHING in its own text names a provider/key. Without this, removing the
    // documentation comment from such a route would make the leak invisible
    // again (the route would never reach the platform-key-fallback check).
    libDelegated;

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
    platformKeyFallback: hasPlatformKeyFallback(normalized, content, libDelegated),
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

  // Read every scanned file once, then resolve the platform-key delegate graph
  // across them so a route's lib-delegated leak can be seen (RA-6965).
  const fileContents = new Map<string, string>();
  for (const file of files) fileContents.set(file, readFileSync(file, "utf8"));
  const delegateExports = buildPlatformKeyDelegateExports(fileContents, rootDir);

  const findings = files
    .map((file) => {
      const relative = path.relative(rootDir, file);
      const content = fileContents.get(file) ?? "";
      const libDelegated =
        normalisePath(relative).startsWith("app/") &&
        delegatesToPlatformKey(file, content, delegateExports, rootDir);
      return auditAiCallSite(relative, content, libDelegated);
    })
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
