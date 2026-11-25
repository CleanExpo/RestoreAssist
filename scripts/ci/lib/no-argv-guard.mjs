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
 * arguments) where any of these holds:
 *   - a decider sits within a short window of it: `import.meta`, `.pathname`,
 *     `__filename`, `require.main`, or a `.endsWith(`, `.startsWith(`,
 *     `.includes(` or `.test(` call;
 *   - the line itself compares (`===`, `!==`, `==`, `!=`), which catches
 *     `basename(<arg>) === "gate.mjs"` and `<arg> === selfPath` (RA-8484);
 *   - the line binds the argument, or something derived from it such as its
 *     basename, to a name, and a later use of that name meets either rule
 *     above, however far away (RA-8484: `const entry = <arg>` then, many lines
 *     on, `entry.endsWith(...)` or `self === entry`).
 * Whole-line `//` comments and block comments are ignored, so prose describing
 * the fault does not trip it; code never escapes that way.
 *
 * Findings in files listed in scripts/argv-guard-baseline.json (up to the
 * listed count) are tolerated: they are the group 2 helpers still to convert.
 * The baseline only shrinks. An entry whose file no longer has the finding is
 * reported as a note and does not fail, so a conversion can merge first.
 *
 * Exit 0: at least one file scanned, no findings beyond the baseline.
 * Exit 1: findings beyond the baseline (printed as file:line).
 * Exit 2: usage error, unreadable root or baseline, or nothing scanned.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCRIPT_ARG = /\bargv\s*(?:\?\.)?\s*\[\s*1\s*\]/;
const DECIDERS = [
  /\bimport\.meta\b/,
  /\.(?:endsWith|startsWith|includes|test)\s*\(/,
  /\.pathname\b/,
  /\b__filename\b/,
  /\brequire\.main\b/,
];
// A comparison on the line itself. `=>` and plain assignment do not match.
const COMPARES = /[!=]==?/;
// `const entry = ...`, `let entry = ...`: the name the argument is bound to.
const BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?!=)/;
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
  const decides = (i) => {
    if (COMPARES.test(lines[i])) return true;
    const window = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join("\n");
    return DECIDERS.some((re) => re.test(window));
  };
  const aliasDecides = (name, from) => {
    const use = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
    for (let j = from + 1; j < lines.length; j++) {
      if (use.test(lines[j]) && decides(j)) return true;
    }
    return false;
  };
  lines.forEach((line, i) => {
    if (!SCRIPT_ARG.test(line)) return;
    const bound = BINDING.exec(line)?.[1];
    if (decides(i) || (bound && aliasDecides(bound, i))) {
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

/** Repo-relative path of the shrink-only baseline of known findings. */
export const BASELINE_REL = "scripts/argv-guard-baseline.json";

/**
 * { "repo/relative/file": allowedCount }. A missing file is an empty baseline,
 * so deleting it fails closed rather than disarming the check.
 */
export function readBaseline(root) {
  const file = path.join(root, BASELINE_REL);
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const files = parsed?.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error('expected a "files" object of { path: count }');
  }
  for (const [k, v] of Object.entries(files)) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`bad count for ${k}: ${JSON.stringify(v)}`);
  }
  return files;
}

/**
 * Split hits into fresh (fail) and known (baselined). A file over its count has
 * all its hits reported as fresh. A baseline entry whose file now has fewer
 * findings, none, or no longer exists is `stale`: tolerated, and reported, so
 * a conversion can land before the baseline is pruned.
 */
export function compareBaseline(hits, baseline) {
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  const fresh = [];
  const known = [];
  for (const [file, list] of byFile) {
    if (list.length <= (baseline[file] ?? 0)) known.push(...list);
    else fresh.push(...list);
  }
  const stale = Object.entries(baseline)
    .map(([file, allowed]) => ({ file, allowed, found: byFile.get(file)?.length ?? 0 }))
    .filter((s) => s.found < s.allowed);
  return { fresh, known, stale };
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
  let baseline;
  try {
    baseline = readBaseline(root);
  } catch (error) {
    console.error(`check-no-argv-guard: cannot read ${BASELINE_REL} (${error.message})`);
    return 2;
  }
  const { fresh, known, stale } = compareBaseline(result.hits, baseline);
  for (const s of stale) {
    console.log(
      `check-no-argv-guard: note: ${BASELINE_REL} allows ${s.allowed} for ${s.file}, which now has ${s.found}. ` +
        "Remove or lower the entry.",
    );
  }
  if (fresh.length === 0) {
    console.log(
      `check-no-argv-guard: OK. ${result.files.length} file(s) under scripts/, no argv-based main-module checks ` +
        `beyond the baseline (${known.length} baselined in ${Object.keys(baseline).length} file(s)).`,
    );
    return 0;
  }
  console.error(
    `check-no-argv-guard: ${fresh.length} argv-based main-module check(s) not in ${BASELINE_REL}. Such a check skips ` +
      "the gate and exits 0 when the script is reached through a symlink (RA-7785):\n",
  );
  for (const h of fresh) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error(
    "\nMove the logic into a side-effect-free lib/ module that exports main() returning an exit code,\n" +
      "and make the script a thin entry that always runs `process.exitCode = await main()`.\n" +
      "Reference: scripts/ci/lib/corpus-hygiene.mjs and scripts/ci/check-corpus-hygiene.mjs.\n" +
      `The baseline only shrinks: do not add to ${BASELINE_REL}.`,
  );
  return 1;
}
