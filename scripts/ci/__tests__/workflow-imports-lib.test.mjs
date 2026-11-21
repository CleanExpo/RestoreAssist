// RA-7785 follow-up: a workflow step that imports from a script must import the
// side-effect-free lib module, never the CLI entry. #2594 moved logic into lib/
// and left build-production-image.yml importing `verifyReleaseProvenance` from
// the entry, which no longer exports it: every production image build failed.
// Importing an entry would also run its CLI. This test scans every workflow's
// inline `import ... from "./scripts/..."` and fails on any entry import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const IMPORT_RE = /\bfrom\s+["']\.\/(scripts\/[A-Za-z0-9_./-]+)["']|\bimport\(\s*["']\.\/(scripts\/[A-Za-z0-9_./-]+)["']\s*\)/g;
const ENTRY_RE = /^\s*import\s*\{\s*main\s*\}\s*from\s*["']\.\/lib\//m;

function resolve(spec) {
  const base = join(ROOT, spec);
  if (extname(spec) && existsSync(base)) return base;
  for (const ext of [".ts", ".mjs", ".js"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

export function workflowEntryImports(workflowsDir = WORKFLOWS) {
  const found = [];
  for (const f of readdirSync(workflowsDir).filter((n) => /\.ya?ml$/.test(n))) {
    const text = readFileSync(join(workflowsDir, f), "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      const file = resolve(spec);
      const line = text.slice(0, m.index).split("\n").length;
      if (!file) found.push(`${f}:${line} imports ${spec}, which does not exist`);
      else if (ENTRY_RE.test(readFileSync(file, "utf8")))
        found.push(`${f}:${line} imports the CLI entry ${spec}; import its lib module instead`);
    }
  }
  return found;
}

// RA-8512: the entry check above cannot see a lib module that stops exporting
// the name a workflow imports. That is the exact failure #2594 shipped
// ("does not provide an export named 'verifyReleaseProvenance'"), and it was
// only found after merge. This collects each named binding a workflow's inline
// script imports from ./scripts/... and checks the module still exports it:
// .mjs/.js modules are really imported, as the workflow step does; .ts modules
// (run through tsx in the workflow) are checked against their export
// declarations, because plain node cannot load them.
const NAMED_IMPORT_RE = /\bimport\s*\{([^}]*)\}\s*from\s*["']\.\/(scripts\/[A-Za-z0-9_./-]+)["']/g;

function tsExports(source) {
  const names = new Set();
  const decl = /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of source.matchAll(decl)) names.add(m[1]);
  for (const m of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop();
      if (alias) names.add(alias.trim());
    }
  }
  return names;
}

export async function workflowMissingExports(workflowsDir = WORKFLOWS, root = ROOT) {
  const found = [];
  for (const f of readdirSync(workflowsDir).filter((n) => /\.ya?ml$/.test(n))) {
    const text = readFileSync(join(workflowsDir, f), "utf8");
    for (const m of text.matchAll(NAMED_IMPORT_RE)) {
      const spec = m[2];
      const line = text.slice(0, m.index).split("\n").length;
      const names = m[1]
        .split(",")
        .map((p) => p.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      const base = join(root, spec);
      let file = extname(spec) && existsSync(base) ? base : null;
      for (const ext of [".ts", ".mjs", ".js"]) if (!file && existsSync(base + ext)) file = base + ext;
      if (!file) {
        found.push(`${f}:${line} imports ${spec}, which does not exist`);
        continue;
      }
      // Never import a CLI entry: importing one runs its main() and exits the
      // test process. Read its declarations instead; the entry test below
      // reports the entry import itself.
      const source = readFileSync(file, "utf8");
      const exported =
        /\.(mjs|js)$/.test(file) && !ENTRY_RE.test(source)
          ? new Set(Object.keys(await import(pathToFileURL(file).href)))
          : tsExports(source);
      for (const name of names)
        if (!exported.has(name)) found.push(`${f}:${line} imports { ${name} } from ${spec}, which does not export it`);
    }
  }
  return found;
}

test("every name a workflow imports from a script is still exported (RA-8512)", async () => {
  assert.deepEqual(await workflowMissingExports(), []);
});

test("the export check fails on a removed export (negative control)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wf-exports-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    writeFileSync(join(dir, "scripts", "lib", "gone.mjs"), "export function main() {}\n");
    writeFileSync(join(dir, "scripts", "lib", "typed.ts"), "export function present() {}\nfunction hidden() {}\n");
    writeFileSync(
      join(dir, ".github", "workflows", "w.yml"),
      [
        "run: |",
        "  node --input-type=module -e 'import { verifyReleaseProvenance } from \"./scripts/lib/gone.mjs\";'",
        "  npx tsx -e \"import { present, hidden } from './scripts/lib/typed';\"",
        "",
      ].join("\n"),
    );
    const found = await workflowMissingExports(join(dir, ".github", "workflows"), dir);
    assert.deepEqual(found, [
      "w.yml:2 imports { verifyReleaseProvenance } from scripts/lib/gone.mjs, which does not export it",
      "w.yml:3 imports { hidden } from scripts/lib/typed, which does not export it",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the export check sees both workflow imports it guards (positive control)", () => {
  const seen = [];
  for (const f of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n)))
    for (const m of readFileSync(join(WORKFLOWS, f), "utf8").matchAll(NAMED_IMPORT_RE)) seen.push(`${f} ${m[2]}`);
  assert.ok(seen.includes("build-production-image.yml scripts/ci/lib/verify-release-provenance.mjs"), seen.join("\n"));
  assert.ok(seen.includes("release-receipt.yml scripts/lib/release-gate-score"), seen.join("\n"));
});

test("no workflow imports a CLI entry or a missing script", () => {
  assert.deepEqual(workflowEntryImports(), []);
});

test("the scan sees the inline imports it is meant to guard (positive control)", () => {
  const text = readFileSync(join(WORKFLOWS, "build-production-image.yml"), "utf8");
  assert.match(text, /from "\.\/scripts\/ci\/lib\/verify-release-provenance\.mjs"/);
  assert.ok([...text.matchAll(IMPORT_RE)].length >= 1);
});
