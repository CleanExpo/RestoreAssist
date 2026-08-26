import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeps the instruction layer honest.
 *
 * Claude Code auto-loads CLAUDE.md, AGENTS.md and .claude/rules/*.md — nothing
 * else. Two things had gone wrong and neither was detectable:
 *
 * 1. CLAUDE.md had been reduced to a single `@AGENTS.md` line, so nothing in
 *    the loaded chain reached .claude/RULES.md. All 33 engineering rules, the
 *    security ones included, were unreachable from a fresh session — while
 *    RULES.md still opened by saying "CLAUDE.md lists the 17 non-negotiables".
 *
 * 2. The docs cited paths that no longer existed: `Synthex/…` named three
 *    times as the design source of truth, `content/**` when the tree is
 *    `data/content`, `packages/videos/**` which was gone.
 *
 * A path that does not resolve is worse than no guidance: it reads as
 * authoritative and sends the reader somewhere empty.
 */

const ROOT = process.cwd();

/** The files a session actually loads, plus what they route to. */
const INSTRUCTION_DOCS = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/rules/verification-gate.md",
  ".claude/rules/review-dimensions.md",
  ".claude/RULES.md",
  ".claude/DESIGN.md",
];

/** Top-level directories that make a backticked string a repo path. */
const REPO_ROOTS = [
  "app/", "lib/", "components/", "scripts/", "prisma/", "docs/",
  ".claude/", ".github/", "tools/", "data/", "config/", "public/",
  "packages/", "mobile/",
];

/** Extensions that make a slash-containing span a file path wherever it sits. */
const SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".md", ".css", ".json", ".yml", ".yaml", ".sh", ".prisma", ".sql",
];

/**
 * Pull repo-relative paths out of backticked spans.
 *
 * Deliberately conservative: only strings under a known top-level directory
 * count. Prose, npm scripts and symbol names are not paths, and treating them
 * as such would make the check noisy enough to be switched off.
 */
export function extractRepoPaths(markdown: string): string[] {
  const found = new Set<string>();
  for (const [, span] of markdown.matchAll(/`([^`\n]+)`/g)) {
    const raw = span.trim();
    if (raw.includes("://")) continue; // URLs are not repo paths
    // `~/...` is the owner's machine, not this repo. Such references are
    // legitimate but unopenable from here, so they are out of scope for an
    // existence check — the docs flag them as machine-local instead.
    if (raw.startsWith("~")) continue;
    // Under a known top-level directory, OR anything that reads as a file
    // path with a source extension. The second rule is what catches a
    // citation rooted somewhere that does not exist at all — the original
    // `Synthex/packages/brand-config/src/brands/ra.ts` sat outside every
    // known root, so a roots-only check waved it straight through.
    const underKnownRoot = REPO_ROOTS.some((r) => raw.startsWith(r));
    const looksLikeFile =
      raw.includes("/") && SOURCE_EXTENSIONS.some((e) => raw.endsWith(e));
    if (!underKnownRoot && !looksLikeFile) continue;
    // Drop glob tails and trailing punctuation so the base path can be tested.
    const path = raw
      .replace(/\/\*\*.*$/, "")
      .replace(/\/\*.*$/, "")
      .replace(/[.,;:)]+$/, "");
    // Skip templates: `public/logos/{slug}.png`, `docs/<name>.md`, `$VAR`.
    if (/[ <>{}$\[\]]/.test(path)) continue;
    found.add(path);
  }
  return [...found].sort();
}

describe("instruction chain", () => {
  it("auto-loads CLAUDE.md, which routes to the full rule set", () => {
    const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    // The regression: CLAUDE.md was one `@AGENTS.md` line and nothing else.
    expect(claude).toContain("@AGENTS.md");
    expect(claude).toContain(".claude/RULES.md");
  });

  it("does not claim CLAUDE.md holds a rule list it does not hold", () => {
    const rules = readFileSync(join(ROOT, ".claude", "RULES.md"), "utf8");
    expect(rules).not.toContain("CLAUDE.md` lists the 17 non-negotiables");
  });

  it("states a rule count that matches the rules present", () => {
    const rules = readFileSync(join(ROOT, ".claude", "RULES.md"), "utf8");
    const numbers = [...rules.matchAll(/^(\d+)\.\s+\*{0,2}\S/gm)].map((m) =>
      Number(m[1]),
    );
    const highest = Math.max(...numbers);
    // The header said 28 while the rules ran to 33.
    expect(rules).toContain(`The ${highest} rules below`);
    expect(rules).toContain(`## The ${highest} rules`);
  });
});

describe("instruction docs cite paths that exist", () => {
  it.each(INSTRUCTION_DOCS)("%s", (doc) => {
    const full = join(ROOT, doc);
    expect(existsSync(full), `${doc} is itself missing`).toBe(true);
    const missing = extractRepoPaths(readFileSync(full, "utf8")).filter(
      (p) => !existsSync(join(ROOT, p)),
    );
    expect(missing, `${doc} cites paths that do not exist`).toEqual([]);
  });

  it("finds enough paths for the check to be meaningful", () => {
    // A extractor that matched nothing would make every case above pass
    // vacuously — which is exactly how the stale citations survived.
    const total = INSTRUCTION_DOCS.reduce(
      (n, doc) =>
        n + extractRepoPaths(readFileSync(join(ROOT, doc), "utf8")).length,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });

  it("would have caught the citations that had gone stale", () => {
    const gone = extractRepoPaths(
      "See `Synthex/packages/brand-config/src/brands/ra.ts` and `content/**` and `packages/videos/**`.",
    );
    expect(gone).toContain("packages/videos");
    expect(gone.filter((p) => existsSync(join(ROOT, p)))).toEqual([]);
  });
});
