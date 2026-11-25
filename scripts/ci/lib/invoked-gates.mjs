/**
 * Which scripts does CI actually start? Side-effect free; used by
 * scripts/ci/__tests__/gate-entry-symlink.test.mjs (RA-7785).
 *
 * The answer is read from the two places that start scripts: every
 * `.github/workflows/*.yml` and every gate-shaped `package.json` script
 * (check:, audit:, lint:, security:, test:, verify:, validate:). A comment line
 * in a workflow is not an invocation. Nothing here is a hardcoded list, so a
 * new gate added to either place is discovered without anyone remembering to
 * register it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SCRIPT_REF = /(?:^|[\s"'`=(:])(?:\.\/)?(scripts\/[\w./-]+\.(?:mjs|cjs|js|ts))(?![\w.-])/g;
export const GATE_SCRIPT_PREFIXES = ["check:", "audit:", "lint:", "security:", "test:", "verify:", "validate:"];

/** Script paths referenced by one text, ignoring `#` comment lines. */
export function scriptRefs(text, { yaml = false } = {}) {
  const refs = new Set();
  for (const line of text.split("\n")) {
    if (yaml && line.trimStart().startsWith("#")) continue;
    for (const m of line.matchAll(SCRIPT_REF)) refs.add(m[1]);
  }
  return refs;
}

/**
 * Map of repo-relative script path -> sorted list of callers
 * ("workflow:<file>" or "package.json:<script name>"). Only files that exist.
 */
export function invokedScripts(root) {
  const callers = new Map();
  const add = (file, caller) => {
    if (!existsSync(path.join(root, file))) return;
    if (!callers.has(file)) callers.set(file, new Set());
    callers.get(file).add(caller);
  };
  const wfDir = path.join(root, ".github", "workflows");
  for (const name of readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    for (const ref of scriptRefs(readFileSync(path.join(wfDir, name), "utf8"), { yaml: true })) {
      add(ref, `workflow:${name}`);
    }
  }
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    if (!GATE_SCRIPT_PREFIXES.some((p) => name.startsWith(p))) continue;
    for (const ref of scriptRefs(cmd)) add(ref, `package.json:${name}`);
  }
  return new Map([...callers].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));
}

/**
 * True when a file is a thin CLI entry over a lib/ module: it imports `main`
 * from a relative `lib/` path. These are the gates whose start-up path the
 * symlink test exercises.
 */
export function isLibEntry(text) {
  return /import\s*\{[^}]*\bmain\b[^}]*\}\s*from\s*["']\.\/lib\/[^"']+["']/.test(text);
}
