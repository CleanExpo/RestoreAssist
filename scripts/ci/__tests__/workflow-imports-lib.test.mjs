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
import { fileURLToPath } from "node:url";

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

test("no workflow imports a CLI entry or a missing script", () => {
  assert.deepEqual(workflowEntryImports(), []);
});

test("the scan sees the inline imports it is meant to guard (positive control)", () => {
  const text = readFileSync(join(WORKFLOWS, "build-production-image.yml"), "utf8");
  assert.match(text, /from "\.\/scripts\/ci\/lib\/verify-release-provenance\.mjs"/);
  assert.ok([...text.matchAll(IMPORT_RE)].length >= 1);
});
