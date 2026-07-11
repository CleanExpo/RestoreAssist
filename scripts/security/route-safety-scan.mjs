/**
 * Route-safety prevention guard — deterministic scanner over app/api/**\/route.ts.
 *
 * Implements the deep-audit's #1 recommendation: make two regressions
 * IMPOSSIBLE to reintroduce silently:
 *
 *   (a) PAID-AI PROXY without auth — an unauthenticated route that proxies a
 *       metered/paid AI provider (HeyGen avatar video, ElevenLabs voice/SFX,
 *       the Synthex client). Left ungated, anyone on the internet can spend the
 *       company's AI budget. This is the CRITICAL class.
 *
 *   (b) MUTATION route without auth — a route that exports POST/PUT/PATCH/DELETE
 *       and performs a Prisma write, but has no auth gate and isn't one of the
 *       documented legit-exception patterns. Left ungated, anyone can mutate
 *       tenant data.
 *
 * DESIGN: conservative, deterministic, zero-dependency static text analysis.
 * No provider calls, no DB, no Prisma client, no network. Safe to run in CI on
 * every PR. It NEVER edits app/route code.
 *
 * ── Heuristics (intentionally conservative to minimise false positives) ──────
 *
 * AUTH-GATE detection (matches the existing scripts/audit-api-routes.ts
 * convention so the two stay in agreement):
 *   A file is considered auth-gated if its text contains any of:
 *     getServerSession(   |   getToken(   |   verifyAdminFromDb(
 *   (getServerSession(authOptions) from @/lib/auth is the canonical gate.)
 *
 * PAID-AI proxy detection — a route is a paid-AI proxy if EITHER:
 *   - its path (under app/api/) contains  heygen  or  elevenlabs ; OR
 *   - its text imports/references a paid-AI surface:
 *       @/lib/synthex/client | synthex/client | @/lib/elevenlabs/client |
 *       elevenlabs/client | generateAvatarVideo | generateVoice | streamVoice |
 *       generateSFX | getVideoStatus
 *   Flagged (class "paid-ai-no-auth") when it is a paid-AI proxy AND NOT
 *   auth-gated. Legit-exception patterns below still suppress (a paid route
 *   genuinely behind a [token] path or a signed webhook is acceptable), but in
 *   practice paid-AI routes should always carry a session gate.
 *
 * MUTATION-write detection — a route is a flagged mutation if ALL hold:
 *   - it exports a mutating handler: export ... function POST|PUT|PATCH|DELETE
 *     (covers `export async function POST`, `export const POST =`, and the
 *     `export { handler as POST }` re-export form); AND
 *   - it performs a Prisma write: a `prisma.<model>.<verb>(` call where verb is
 *     one of create|createMany|update|updateMany|upsert|delete|deleteMany, OR a
 *     `$executeRaw` / `$transaction` call; AND
 *   - it is NOT auth-gated; AND
 *   - it does NOT match a legit-exception pattern.
 *   Flagged class: "mutation-no-auth".
 *
 * ── Legit auth-exception patterns (NOT false-flagged) ────────────────────────
 *   1. Auth entry routes:        app/api/auth/**       (these ESTABLISH auth)
 *   2. Token-param routes:       any segment is a [token]/[...token] param —
 *                                the token in the path IS the auth.
 *   3. Signature-verified hooks: app/api/webhooks/**   (verified by signature,
 *                                not by session)
 *   4. Hard-gated test helpers:  app/api/test/** that check
 *                                process.env.ALLOW_TEST_HELPERS !== "true"
 *                                (the env flag is off in prod, so the route is
 *                                inert there).
 *
 * NOTE: exceptions 1/3/4 suppress BOTH classes; exception 2 (token path)
 * likewise suppresses both — a token route is self-authenticating.
 *
 * ── Baseline ─────────────────────────────────────────────────────────────────
 * Pre-existing candidates are recorded in route-safety-baseline.json so the
 * guard is GREEN on day one and only fails on NEW drift.
 *
 *   node scripts/security/route-safety-scan.mjs --baseline
 *       Regenerate the baseline from the current tree (records every finding).
 *
 *   node scripts/security/route-safety-scan.mjs   (default / CI mode)
 *       Scan, then exit NON-ZERO only on findings NOT present in the baseline.
 *       Baselined findings are reported as "known (baselined)" and do not fail.
 *
 * Exit codes:
 *   0  No new findings (clean, or all findings are baselined)
 *   1  One or more NEW findings not in the baseline
 *   2  Internal error (could not read tree / baseline parse error)
 *
 * Usage:
 *   node scripts/security/route-safety-scan.mjs
 *   node scripts/security/route-safety-scan.mjs --baseline
 *   node scripts/security/route-safety-scan.mjs --json
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const API_ROOT = path.join(REPO_ROOT, "app", "api");
const BASELINE_PATH = path.join(__dirname, "route-safety-baseline.json");

// ── Auth-gate detection (mirrors scripts/audit-api-routes.ts) ───────────────
function hasAuthGate(content) {
  return (
    content.includes("getServerSession(") ||
    content.includes("getToken(") ||
    content.includes("verifyAdminFromDb(")
  );
}

// ── Paid-AI proxy detection ─────────────────────────────────────────────────
const PAID_AI_PATH_RE = /(^|\/)(heygen|elevenlabs)(\/|$)/i;
const PAID_AI_REFERENCES = [
  "@/lib/synthex/client",
  "synthex/client",
  "@/lib/elevenlabs/client",
  "elevenlabs/client",
  "generateAvatarVideo",
  "generateVoice",
  "streamVoice",
  "generateSFX",
  "getVideoStatus",
];

function isPaidAiProxy(relPath, content) {
  if (PAID_AI_PATH_RE.test(relPath)) return true;
  return PAID_AI_REFERENCES.some((ref) => content.includes(ref));
}

// ── Mutation + Prisma-write detection ───────────────────────────────────────
const MUTATION_EXPORT_RE =
  /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\bas\s+(POST|PUT|PATCH|DELETE)\b[^}]*\}/;

const PRISMA_WRITE_RE =
  /\bprisma\.[A-Za-z0-9_]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$transaction\s*\(/;

function exportsMutation(content) {
  return MUTATION_EXPORT_RE.test(content);
}

function hasPrismaWrite(content) {
  return PRISMA_WRITE_RE.test(content);
}

// ── Legit auth-exception patterns ───────────────────────────────────────────
function isAuthEntryRoute(relPath) {
  return relPath.startsWith("app/api/auth/");
}

function isWebhookRoute(relPath) {
  return relPath.startsWith("app/api/webhooks/");
}

// A path segment that is a Next.js dynamic param literally named "token"
// (or "...token"). The token in the URL is the auth.
function isTokenParamRoute(relPath) {
  return /\[\.{0,3}token\]/i.test(relPath);
}

function hasTestHelperEnvGuard(content) {
  // Inline guard (the historical form) OR the centralized two-key predicate
  // testHelpersBlocked() from app/api/test/_helpers.ts, which performs the same
  // ALLOW_TEST_HELPERS check plus the VERCEL_ENV production hard-block.
  return (
    /process\.env\.ALLOW_TEST_HELPERS\s*!==\s*["']true["']/.test(content) ||
    /\btestHelpersBlocked\s*\(/.test(content)
  );
}

function isGuardedTestHelper(relPath, content) {
  return relPath.startsWith("app/api/test/") && hasTestHelperEnvGuard(content);
}

function isLegitException(relPath, content) {
  return (
    isAuthEntryRoute(relPath) ||
    isWebhookRoute(relPath) ||
    isTokenParamRoute(relPath) ||
    isGuardedTestHelper(relPath, content)
  );
}

// ── File walking ────────────────────────────────────────────────────────────
function walkRouteFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkRouteFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out.sort();
}

function toRel(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

// ── Core scan ───────────────────────────────────────────────────────────────
function scan() {
  const files = walkRouteFiles(API_ROOT);
  const findings = [];

  for (const file of files) {
    const relPath = toRel(file);
    const content = readFileSync(file, "utf8");

    const gated = hasAuthGate(content);
    const exception = isLegitException(relPath, content);

    // (a) paid-AI proxy without auth — the critical class.
    if (isPaidAiProxy(relPath, content) && !gated && !exception) {
      findings.push({
        file: relPath,
        class: "paid-ai-no-auth",
        reason:
          "Route proxies a paid/metered AI provider (HeyGen/ElevenLabs/Synthex client) " +
          "but has no getServerSession/getToken/verifyAdminFromDb auth gate and is not a " +
          "legit-exception (auth/webhook/[token]/test-helper) route.",
      });
    }

    // (b) mutation route doing a Prisma write without auth.
    if (
      exportsMutation(content) &&
      hasPrismaWrite(content) &&
      !gated &&
      !exception
    ) {
      findings.push({
        file: relPath,
        class: "mutation-no-auth",
        reason:
          "Route exports a mutating handler (POST/PUT/PATCH/DELETE) that performs a Prisma " +
          "write but has no getServerSession/getToken/verifyAdminFromDb auth gate and is not " +
          "a legit-exception (auth/webhook/[token]/test-helper) route.",
      });
    }
  }

  // Stable ordering: by file then class.
  findings.sort((a, b) =>
    a.file === b.file ? a.class.localeCompare(b.class) : a.file.localeCompare(b.file),
  );

  return { routeCount: files.length, findings };
}

// ── Baseline I/O ────────────────────────────────────────────────────────────
function findingKey(f) {
  return `${f.file}::${f.class}`;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return new Set((parsed.findings || []).map(findingKey));
  } catch (err) {
    console.error(`[route-safety] could not parse baseline: ${err.message}`);
    process.exit(2);
  }
}

function writeBaseline(result) {
  const payload = {
    description:
      "Route-safety baseline. Pre-existing heuristic candidates for the route-safety guard. " +
      "Findings listed here are KNOWN and do NOT fail CI. Triage candidates live in " +
      "docs/security/route-safety-backlog.md. Regenerate with: node scripts/security/route-safety-scan.mjs --baseline",
    generatedAt: new Date().toISOString(),
    routeCount: result.routeCount,
    findingCount: result.findings.length,
    findings: result.findings,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
  return payload;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const wantBaseline = args.includes("--baseline");
  const wantJson = args.includes("--json");

  let result;
  try {
    result = scan();
  } catch (err) {
    console.error(`[route-safety] scan failed: ${err.stack || err.message}`);
    process.exit(2);
  }

  if (wantBaseline) {
    const payload = writeBaseline(result);
    console.log(
      `[route-safety] baseline written: ${payload.findingCount} finding(s) across ${payload.routeCount} routes -> ${toRel(BASELINE_PATH)}`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();
  const known = [];
  const fresh = [];
  for (const f of result.findings) {
    if (baseline && baseline.has(findingKey(f))) known.push(f);
    else fresh.push(f);
  }

  if (wantJson) {
    console.log(
      JSON.stringify(
        { routeCount: result.routeCount, known, new: fresh },
        null,
        2,
      ),
    );
    process.exit(fresh.length > 0 ? 1 : 0);
  }

  console.log(`# Route-safety scan`);
  console.log(`Routes scanned: ${result.routeCount}`);
  console.log(
    `Baselined (known): ${known.length}   New (must fix): ${fresh.length}`,
  );
  console.log("");

  if (known.length > 0) {
    console.log("Known (baselined) candidates — see docs/security/route-safety-backlog.md:");
    for (const f of known) console.log(`  - [${f.class}] ${f.file}`);
    console.log("");
  }

  if (fresh.length === 0) {
    console.log("[route-safety] PASS — no new route-safety findings.");
    process.exit(0);
  }

  console.error("[route-safety] FAIL — new route-safety finding(s) not in baseline:");
  for (const f of fresh) {
    console.error(`  - [${f.class}] ${f.file}`);
    console.error(`    ${f.reason}`);
  }
  console.error("");
  console.error("If this is an intentional, reviewed exception, gate the route with");
  console.error("getServerSession(authOptions) — or, only with team sign-off, regenerate");
  console.error("the baseline: node scripts/security/route-safety-scan.mjs --baseline");
  process.exit(1);
}

main();
