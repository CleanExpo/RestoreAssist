import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AiTaskClass } from "../lib/ai/task-policy";

export type AiProviderFamily =
  | "anthropic"
  | "openai"
  | "gemini"
  | "elevenlabs"
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
  // Pure provider-enum mapping — names providers to map UI key-type ↔ AiProvider
  // enum values; reads no process.env key and makes no provider call, so it is
  // not an AI call site. Flagged only by provider-name string matching (RA-7079).
  "lib/workspace/ai-key-type.ts",
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
  // ElevenLabs is fetch/HTTP-based (no SDK client class), so key it off the
  // HTTP surface (api.elevenlabs.io host / xi-api-key header), the platform
  // env key name, and the in-repo client module. Deliberately does NOT match
  // the Synthex-proxied voice/heygen routes, which spend Synthex's credential,
  // not a platform ELEVENLABS_API_KEY.
  if (
    includesAny(content, [
      "api.elevenlabs.io",
      "xi-api-key",
      "ELEVENLABS_API_KEY",
      "lib/elevenlabs/client",
    ])
  ) {
    providers.push("elevenlabs");
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
  "resolveWorkspaceElevenLabsKey(",
  "byokDispatch(",
  "workspace-byok-dispatch",
  "workspaceByokDispatch(",
  "workspaceRouteAiRequest(",
  "getProviderApiKey(",
  "getProviderCredentials(",
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
  /**
   * True for a named re-export (`export { a } from "x"`). A re-export threads a
   * (possibly tainted) symbol straight back out of the module without ever
   * calling it locally, so it must be matched by export-name resolution rather
   * than by the call-site scan used for ordinary imports.
   */
  isReExport?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Keywords after which a `/` always opens a REGEX literal (an expression is
 * required, division is impossible). Used by the regex-vs-division heuristic in
 * stripStringsAndComments. Including a keyword is always safe — none of these
 * can be followed by a division operator in valid code.
 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "new",
  "delete",
  "void",
  "do",
  "else",
  "in",
  "of",
  "yield",
  "await",
  "case",
  "throw",
]);

/**
 * Regex-vs-division heuristic keyed on the preceding non-space token already
 * emitted to `out`. A `/` opens a regex literal only in an expression position:
 * at the start of input, right after an operator/opener (`(`, `[`, `{`, `,`,
 * `;`, `:`, `=`, `&`, `|`, `?`, `+`, `-`, `*`, `%`, `^`, `~`), or after a
 * REGEX_PRECEDING_KEYWORDS keyword (`return /.../`). After a value token
 * (identifier, `)`, `]`, `}`, digit, or `<`/`>` which cover JSX tags and
 * generics) it is treated as division and left as-is. Deliberately conservative
 * about `<`/`>`: excluding them avoids misreading a JSX close tag (`</div>`) or
 * a generic (`Array<T>`) as a regex, at the documented cost of not stripping a
 * regex that directly follows `=>`/a comparison (harmless unless that regex
 * carries an unbalanced brace — none in repo lib/ today).
 *
 * A trailing `!` is CONTEXT-DEPENDENT (RA-6991): a prefix logical-NOT is an
 * operator (`if (!/foo/.test(x))` — regex position), but a postfix TS non-null
 * assertion is a value (`sum! / count` — division position). The two are told
 * apart by the token immediately before the `!`; treating every `!` as an
 * operator misreads `sum! / count` as a regex-open, letting the false regex
 * swallow braces to the line's end and skew the depth-0 module-scope scan.
 */
function precedingTokenExpectsRegex(out: string): boolean {
  let j = out.length - 1;
  while (j >= 0 && (out[j] === " " || out[j] === "\t" || out[j] === "\n" || out[j] === "\r")) {
    j--;
  }
  if (j < 0) return true; // start of input — expression position
  const lastChar = out[j];
  if (lastChar === "!") {
    // Disambiguate postfix non-null assertion (value → division) from prefix
    // logical-NOT (operator/keyword → regex) by the token before the `!`.
    let m = j - 1;
    while (m >= 0 && (out[m] === " " || out[m] === "\t" || out[m] === "\n" || out[m] === "\r")) {
      m--;
    }
    if (m < 0) return true; // leading `!/…` → logical-NOT → regex position
    const beforeBang = out[m];
    if (/[A-Za-z0-9_$]/.test(beforeBang)) {
      // A keyword before `!` (`return !/re/.test(x)`) makes it a prefix
      // logical-NOT → regex; a plain value (`sum! / count`) makes it a postfix
      // non-null assertion → division.
      let k = m;
      while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k--;
      return REGEX_PRECEDING_KEYWORDS.has(out.slice(k + 1, m + 1));
    }
    // `)`, `]`, `}` before `!` → value → non-null → division; any other
    // operator/opener → prefix logical-NOT → regex.
    return !/[)\]}]/.test(beforeBang);
  }
  if ("([{,;:=&|?+-*%^~".includes(lastChar)) return true;
  if (!/[A-Za-z0-9_$]/.test(lastChar)) return false; // e.g. ), ], }, ., <, > → value/division
  let k = j;
  while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k--;
  return REGEX_PRECEDING_KEYWORDS.has(out.slice(k + 1, j + 1));
}

/**
 * Remove string literals (single/double/template), comments, and REGEX literals
 * from a source fragment, best-effort, so a downstream token test can't be
 * fooled by the same token appearing inside a string, comment, or regex (e.g. an
 * `apiKey` word buried in a system-prompt literal). Balancing/brace scans over
 * the result are also safe from stray braces or parentheses inside strings OR
 * inside a regex character class (e.g. an unbalanced `/[{]/` that would
 * otherwise skew the depth-0 module-scope scan). Regex literals are told apart
 * from the division operator by precedingTokenExpectsRegex.
 */
function stripStringsAndComments(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : "";
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "/" && precedingTokenExpectsRegex(out)) {
      // Consume a regex literal whole. A `/` inside a `[...]` character class
      // does NOT terminate the regex, so track class state; backslash escapes
      // the next char. Bail on a raw newline (unterminated literal) so a stray
      // division can't swallow the rest of the file.
      i++; // past the opening `/`
      let inClass = false;
      while (i < n) {
        const c = text[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "\n") break;
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          i++;
          break;
        }
        i++;
      }
      while (i < n && /[a-z]/i.test(text[i])) i++; // trailing regex flags
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Extract the VALUE bindings a source file imports or re-exports — named static
 * imports (`import { a, b as c } from "x"`), destructured dynamic imports
 * (`const { a } = await import("x")`), and named re-exports
 * (`export { a } from "x"`). Type-only imports/re-exports are skipped (a type
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

  const reExport =
    /export\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(reExport)) {
    if (match[1]) continue; // `export type { … } from` — type-only, no runtime binding
    const specifier = match[3];
    for (const raw of match[2].split(",")) {
      const piece = raw.trim();
      if (!piece || piece.startsWith("type ")) continue; // inline `type` modifier
      const [exported, local] = piece.split(/\s+as\s+/);
      const exportedName = exported.trim();
      if (!exportedName || exportedName === "default") continue;
      bindings.push({
        specifier,
        exportedName,
        localName: (local ?? exported).trim(),
        isReExport: true,
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
    // A named re-export threads a symbol straight back out without calling it —
    // re-exporting a tainted export makes this module (a barrel) a delegate too.
    if (binding.isReExport) {
      if (PLATFORM_KEY_HELPER_NAMES.includes(binding.exportedName)) return true;
      const target = resolveModuleSpecifier(fileAbs, binding.specifier, rootDir);
      if (!target) continue;
      const tainted = taintedExports.get(target);
      if (tainted && tainted.has(binding.exportedName)) return true;
      continue;
    }
    const calls = findCallArgs(content, binding.localName);
    if (calls.length === 0) continue;
    if (PLATFORM_KEY_HELPER_NAMES.includes(binding.exportedName)) return true;
    const target = resolveModuleSpecifier(fileAbs, binding.specifier, rootDir);
    if (!target) continue;
    const tainted = taintedExports.get(target);
    if (!tainted || !tainted.has(binding.exportedName)) continue;
    // A call that omits an explicit apiKey falls back to the platform key.
    // String literals and comments are stripped first so an `apiKey` word
    // inside a prompt string or comment can't masquerade as a real key arg.
    if (calls.some((argText) => !/apikey/i.test(stripStringsAndComments(argText)))) {
      return true;
    }
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

/**
 * Platform-ops paths deliberately kept OUT of the env-key seed (RA-6979 leak
 * class 1). A cron job / admin-gated tool / eval harness that reads the
 * platform key inline for internal-only work is legitimate platform spend, not
 * a per-client leak — seeding it would false-positive its callers. Mirrors the
 * platform-internal exceptions the app-scoped detector already tolerates.
 */
function isPlatformOpsPath(normalisedRelPath: string): boolean {
  return (
    normalisedRelPath.includes("/cron/") ||
    normalisedRelPath.includes("/admin/") ||
    normalisedRelPath.includes("harness")
  );
}

/**
 * Best-effort extraction of the brace-delimited body of a function/arrow whose
 * parameter list opens at `parenOpenIdx` (the `(` char). Balances the parameter
 * parens, then balances the body braces. `content` MUST be pre-stripped of
 * strings/comments so stray braces inside literals don't unbalance the scan.
 * Returns null for an expression-bodied arrow (no block body).
 */
function extractBraceBodyAfterParen(content: string, parenOpenIdx: number): string | null {
  let i = parenOpenIdx;
  let depth = 0;
  for (; i < content.length; i++) {
    const ch = content[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  while (i < content.length && content[i] !== "{") {
    if (content[i] === ";") return null; // no block body (e.g. expression arrow)
    i++;
  }
  if (content[i] !== "{") return null;
  const start = i;
  let bodyDepth = 0;
  for (; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") bodyDepth++;
    else if (ch === "}") {
      bodyDepth--;
      if (bodyDepth === 0) {
        i++;
        break;
      }
    }
  }
  return content.slice(start, i);
}

/**
 * Map each exported function / arrow-const to its (string/comment-stripped)
 * body. Used to inspect what an individual export actually does, so a module
 * that exports both a key-spending function and inert helpers is seeded at
 * single-export granularity rather than tainting its whole surface.
 */
function extractExportedFunctionBodies(strippedContent: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const headers = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\s*)?\(/g,
  ];
  for (const header of headers) {
    let match: RegExpExecArray | null;
    while ((match = header.exec(strippedContent)) !== null) {
      const parenOpenIdx = match.index + match[0].length - 1; // the `(` the header ends on
      const body = extractBraceBodyAfterParen(strippedContent, parenOpenIdx);
      if (body) bodies.set(match[1], body);
    }
  }
  return bodies;
}

const PROVIDER_CLIENT_NEW_PATTERN =
  /\bnew\s+(?:Anthropic|OpenAI|GoogleGenerativeAI)\s*\(/;

/**
 * RA-6920 / RA-6998 — ElevenLabs platform-key reader. ElevenLabs has no SDK
 * client class (it is raw fetch to api.elevenlabs.io with an xi-api-key
 * header), so the SDK-singleton / new-client heuristics above never see it.
 * A lib module that reads the platform `process.env.ELEVENLABS_API_KEY` AND
 * makes an ElevenLabs API call spends the platform key on its callers' behalf.
 * Its key is a module-scope const shared by every export, so — like the
 * module-scope SDK singleton — the WHOLE export surface is seeded as a spender.
 * Checked on RAW (un-stripped) content because the xi-api-key header and the
 * api.elevenlabs.io URL both live inside string literals. A BYOK marker
 * (resolveWorkspaceElevenLabsKey / getProviderCredentials) suppresses the seed.
 */
const ELEVENLABS_KEY_ENV_PATTERN = /process\.env\.ELEVENLABS_API_KEY\b/;
const ELEVENLABS_CALL_PATTERN = /api\.elevenlabs\.io|xi-api-key/;

function hasElevenLabsPlatformKeyReader(content: string): boolean {
  if (!ELEVENLABS_KEY_ENV_PATTERN.test(content)) return false;
  if (!ELEVENLABS_CALL_PATTERN.test(content)) return false;
  return !BYOK_MARKERS.some((marker) => content.includes(marker));
}

/**
 * RA-6979 / RA-6986 (leak class 1, module-scope variant) — detect the canonical
 * SDK singleton: a provider client instantiated at MODULE scope (curly-brace
 * depth 0 of the string/comment/regex-stripped source — outside every function
 * body, exported or not) in a module that reads the platform env key. Once a
 * depth-0 instantiation is confirmed, the env-key read may sit ANYWHERE in the
 * module body — the constructor arguments
 * (`new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`), a separate
 * top-level statement (`const key = process.env...;`), OR a non-exported helper
 * the singleton closes over (`new Anthropic({ apiKey: readKey() })` with
 * `function readKey() { return process.env.ANTHROPIC_API_KEY; }`, RA-6986). A
 * BYOK marker anywhere in the module suppresses the match. `strippedContent`
 * MUST be pre-stripped (strings/comments/regex) so the brace-depth scan can't
 * be fooled by braces inside literals — including an unbalanced `/[{]/` in a
 * regex character class. An instantiation inside a NON-exported lazy helper
 * (lib/testimonial/transcribe.ts's defaultClient) sits at depth >= 1 and
 * deliberately does NOT match — that shape stays at per-export granularity.
 *
 * RA-6991 — the LEAK SIGNAL (an env-key read) is checked over the whole module,
 * but the BYOK SUPPRESSION is scoped to MODULE-EVALUATION text only: depth-0
 * statements plus the singleton's own constructor arguments. A module-scope
 * singleton is constructed at import time, so only a BYOK resolution that also
 * runs at module scope can gate it; a BYOK marker buried in an unrelated
 * function body (`export function unused() { resolveWorkspaceAiKey(...) }`)
 * cannot, and must NOT suppress the seed. RA-6986 had widened the suppression
 * to the whole module, which let exactly that construct slip the gate.
 */
function hasModuleScopeEnvClientSingleton(strippedContent: string): boolean {
  const instantiation = new RegExp(PROVIDER_CLIENT_NEW_PATTERN.source, "g");
  let moduleScopeArgs: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = instantiation.exec(strippedContent)) !== null) {
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      const ch = strippedContent[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth !== 0) continue;
    // Confirmed module-scope instantiation. Capture its balanced-paren
    // constructor args so a BYOK resolution INSIDE the constructor
    // (`new Anthropic({ apiKey: getProviderApiKey() })`) still counts as a
    // module-scope resolution — those args nest one object-literal brace deep,
    // so they are excluded from the depth-0 text scan below.
    let index = match.index + match[0].length;
    const argsStart = index;
    let parenDepth = 1;
    while (index < strippedContent.length && parenDepth > 0) {
      const ch = strippedContent[index];
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      index++;
    }
    moduleScopeArgs = strippedContent.slice(argsStart, index - 1);
    break;
  }
  if (moduleScopeArgs === null) return false;

  // Leak signal: a provider env key is read ANYWHERE in the module (top-level,
  // constructor args, or a non-exported helper the singleton closes over).
  if (!AI_PROVIDER_KEY_ENV_PATTERN.test(strippedContent)) return false;

  // Suppression scope: depth-0 (module-evaluation) statements + the singleton's
  // own constructor args. A BYOK marker only here can gate the import-time
  // singleton.
  let moduleScopeText = "";
  let braceDepth = 0;
  for (const ch of strippedContent) {
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (braceDepth === 0) moduleScopeText += ch;
  }
  const moduleScope = `${moduleScopeText}\n${moduleScopeArgs}`;
  return !BYOK_MARKERS.some((marker) => moduleScope.includes(marker));
}

/**
 * RA-6979 (leak class 1) — the exported names of a lib module that instantiate
 * an AI provider client with the PLATFORM env key inline (not via the curated
 * getAnthropicApiKey/selectAnthropicApiKey helpers, and not resolving BYOK).
 * Importing and calling such an export spends the platform key on the caller's
 * workload. HYBRID seed granularity:
 *   - in-function instantiation: only the instantiating export name is seeded,
 *     so inert sibling exports (a rule-based classifier, a constant) never
 *     taint their callers; and
 *   - module-scope singleton (`const client = new Anthropic({ apiKey:
 *     process.env.ANTHROPIC_API_KEY })` at file top — the canonical SDK
 *     pattern): EVERY export can close over the singleton, so the module's
 *     whole export surface is seeded.
 */
function extractInlineEnvSpenderExports(content: string): Set<string> {
  const stripped = stripStringsAndComments(content);
  const spenders = new Set<string>();
  for (const [name, body] of extractExportedFunctionBodies(stripped)) {
    if (
      AI_PROVIDER_KEY_ENV_PATTERN.test(body) &&
      PROVIDER_CLIENT_NEW_PATTERN.test(body) &&
      !BYOK_MARKERS.some((marker) => body.includes(marker))
    ) {
      spenders.add(name);
    }
  }
  if (hasModuleScopeEnvClientSingleton(stripped)) {
    for (const name of extractExportedNames(content)) {
      spenders.add(name);
    }
  }
  // RA-6920 / RA-6998 — ElevenLabs (fetch-based, module-const key) seeds the
  // whole export surface. Checked on RAW content (its HTTP markers are string
  // literals stripped from `stripped`).
  if (hasElevenLabsPlatformKeyReader(content)) {
    for (const name of extractExportedNames(content)) {
      spenders.add(name);
    }
  }
  return spenders;
}

/**
 * RA-6979 (leak class 1) — build the INLINE-ENV-KEY delegate graph. Seed: lib
 * modules (outside the platform-ops allowlist) whose exported function reads a
 * `process.env.<PROVIDER>_API_KEY` and instantiates a provider client inline.
 * Only those spending export names are seeded, so an inert sibling export (a
 * rule-based classifier, a constant) never taints its callers. Propagation
 * reuses the same import-graph closure as the helper-delegate graph: any module
 * that imports and calls a tainted export (without threading an apiKey) becomes
 * a full-surface delegate.
 */
function buildEnvSeedDelegateExports(
  fileContents: Map<string, string>,
  rootDir: string,
): Map<string, Set<string>> {
  const taintedExports = new Map<string, Set<string>>();
  const seedModules = new Set<string>();

  for (const [abs, content] of fileContents) {
    const rel = normalisePath(path.relative(rootDir, abs));
    if (!rel.startsWith("lib/")) continue; // leak class 1 is a lib key-reader imported by a route
    if (isPlatformOpsPath(rel)) continue; // allowlist cron/admin/harness platform-ops
    const spenders = extractInlineEnvSpenderExports(content);
    if (spenders.size > 0) {
      taintedExports.set(abs, spenders);
      seedModules.add(abs);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [abs, content] of fileContents) {
      if (seedModules.has(abs)) continue; // seed stays at spender-export granularity
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
  const envSeedExports = buildEnvSeedDelegateExports(fileContents, rootDir);

  const findings = files
    .map((file) => {
      const relative = path.relative(rootDir, file);
      const content = fileContents.get(file) ?? "";
      const normalizedRel = normalisePath(relative);
      const isAppRoute = normalizedRel.startsWith("app/");
      const libDelegated =
        isAppRoute && delegatesToPlatformKey(file, content, delegateExports, rootDir);
      // RA-6979 leak class 1: a route importing a lib that spends the platform
      // key inline. Platform-ops route paths (cron/admin/harness) are exempt —
      // internal tools that legitimately run on the platform key.
      const envDelegated =
        isAppRoute &&
        !isPlatformOpsPath(normalizedRel) &&
        delegatesToPlatformKey(file, content, envSeedExports, rootDir);
      return auditAiCallSite(relative, content, libDelegated || envDelegated);
    })
    .filter((finding): finding is AiCallSiteFinding => finding !== null);

  const providerCounts = Object.fromEntries(
    ([
      "anthropic",
      "openai",
      "gemini",
      "elevenlabs",
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
