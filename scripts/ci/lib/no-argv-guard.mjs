/**
 * Detector for argv-based "is this the main module?" checks under scripts/.
 * Importing this module scans nothing and exits nothing. The CLI entry
 * `scripts/ci/check-no-argv-guard.mjs` calls `main()`.
 *
 * THE FAULT (RA-7785)
 * -------------------
 * A gate that decides whether to run by comparing its own module URL with the
 * process's script argument, or by testing that argument's suffix, skips
 * main() whenever the two spellings differ. Node resolves a symlink in the
 * module URL but leaves the argument as the link path; a lowercase drive
 * letter, a space in the path or a renamed copy miss the same way. The gate
 * then prints nothing and exits 0, which CI reads as a pass. The fix is a thin
 * entry file that always runs `main()` from a side-effect-free library (see
 * scripts/ci/lib/corpus-hygiene.mjs and its entry).
 *
 * A finding is a line that reads the script argument (index 1 of the process
 * arguments) within a short window of `import.meta`, `.endsWith(` or `.test(`.
 * Whole-line `//` comments and block comments are ignored, so prose describing
 * the fault does not trip it; code never escapes that way.
 *
 * Exit 0: at least one file scanned, no findings.
 * Exit 1: findings (printed as file:line).
 * Exit 2: usage error, unreadable root, or nothing scanned. Never a pass.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCRIPT_ARG = /\bargv\s*(?:\?\.)?\s*\[\s*1\s*\]/;
const DECIDERS = [/\bimport\.meta\b/, /\.endsWith\s*\(/, /\.test\s*\(/];
const WINDOW = 3; // lines either side: guards span up to four lines here
const EXT = /\.(?:mjs|cjs|js|ts|mts|cts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules"]);

/**
 * Blank comments while keeping every newline, so line numbers survive.
 * Only `//` comments that start a line are removed: a `//` mid-line may be
 * inside a string such as a `file://` URL, which is exactly where a guard hides.
 */
export function stripComments(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n");
}

/** Findings in one file's text: [{ line, text }], 1-based lines. */
export function scanText(text) {
  const lines = stripComments(text).split("\n");
  const raw = text.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    if (!SCRIPT_ARG.test(line)) return;
    const lo = Math.max(0, i - WINDOW);
    const window = lines.slice(lo, i + WINDOW + 1).join("\n");
    if (DECIDERS.some((re) => re.test(window))) {
      out.push({ line: i + 1, text: raw[i].trim().slice(0, 140) });
    }
  });
  return out;
}

/** Every source file under `dir`, repo-relative to `root`, sorted. */
export function listSources(root, dir = path.join(root, "scripts")) {
  const found = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && EXT.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found.map((f) => path.relative(root, f).split(path.sep).join("/")).sort();
}

/** { files, hits } for the scripts/ tree of `root`. */
export function scanRoot(root) {
  const files = listSources(root);
  const hits = [];
  for (const file of files) {
    for (const h of scanText(readFileSync(path.join(root, file), "utf8"))) {
      hits.push({ file, ...h });
    }
  }
  return { files, hits };
}

/**
 * Run the CLI. Returns the process exit code; never calls process.exit.
 * `--root <dir>` scans `<dir>/scripts` (default: the current directory).
 */
export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let root = cwd;
  const i = argv.indexOf("--root");
  if (i !== -1) {
    if (!argv[i + 1]) {
      console.error("usage: check-no-argv-guard.mjs [--root <repo-root>]");
      return 2;
    }
    root = path.resolve(cwd, argv[i + 1]);
  }
  const unknown = argv.filter((a, j) => a.startsWith("--") && a !== "--root" && argv[j - 1] !== "--root");
  if (unknown.length) {
    console.error(`check-no-argv-guard: unknown option ${unknown[0]}`);
    console.error("usage: check-no-argv-guard.mjs [--root <repo-root>]");
    return 2;
  }
  let result;
  try {
    if (!statSync(path.join(root, "scripts")).isDirectory()) throw new Error("not a directory");
    result = scanRoot(root);
  } catch (error) {
    console.error(`check-no-argv-guard: cannot read ${path.join(root, "scripts")} (${error.message})`);
    return 2;
  }
  if (result.files.length === 0) {
    console.error("check-no-argv-guard: no source files under scripts/. An empty scan is not a pass.");
    return 2;
  }
  if (result.hits.length === 0) {
    console.log(`check-no-argv-guard: OK. ${result.files.length} file(s) under scripts/, no argv-based main-module checks.`);
    return 0;
  }
  console.error(
    `check-no-argv-guard: ${result.hits.length} argv-based main-module check(s). Such a check skips the gate ` +
      "and exits 0 when the script is reached through a symlink (RA-7785):\n",
  );
  for (const h of result.hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error(
    "\nMove the logic into a side-effect-free lib/ module that exports main() returning an exit code,\n" +
      "and make the script a thin entry that always runs `process.exitCode = await main()`.\n" +
      "Reference: scripts/ci/lib/corpus-hygiene.mjs and scripts/ci/check-corpus-hygiene.mjs.",
  );
  return 1;
}
