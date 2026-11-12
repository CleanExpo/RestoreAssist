#!/usr/bin/env node
/**
 * API error-body sink guard (RA-8348).
 *
 * Routes built on `apiError()` / `fromException()` answer failures with
 * `{ error: { code, message, eventId } }`, so `body.error` is an OBJECT.
 * Passing it straight into a string-only sink breaks the screen:
 *
 *   setX(body.error ?? "...")      -> `{x}` in JSX throws React error #31
 *   throw new Error(body.error)    -> toast shows "[object Object]"
 *   `${body.error}`                -> "[object Object]" in a sentence
 *
 * The one owner for reading an error body is `apiErrorMessage(body)` in
 * lib/api-error-message.ts (or `parseApiError(res)`). This guard fails when
 * `<expr>.error` (not followed by `.` / `?.`) is the direct argument of a
 * `set[A-Z]*(` call, of `new Error(`, or the head of a template `${...}`.
 *
 * Sites that existed when the guard landed are baselined per file in
 * scripts/ci/api-error-sinks-baseline.json and ratchet down: a count above
 * the baseline is a new defect; a count below it means the baseline must be
 * lowered in the same change. Reading a string-typed `.error` through
 * apiErrorMessage() is harmless, so migrating any baselined site is safe.
 *
 * Usage:
 *   node scripts/check-api-error-sinks.mjs              # scan the tree
 *   node scripts/check-api-error-sinks.mjs --files a b  # scan files, no baseline
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BASELINE_PATH = join(ROOT, "scripts/ci/api-error-sinks-baseline.json");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const EXCLUDE_PREFIXES = ["app/api/"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_PATH = /(^|\/)(__tests__|node_modules)\/|\.test\.|\.spec\./;

// `body.error`, `body?.error`, `data.result.error` — ending at `.error` with
// no further member access (`.error.message` is fine) and no call.
const ERROR_EXPR = String.raw`[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*\s*\??\.\s*error(?![\w$])(?!\s*\??\.\s*[A-Za-z_$])(?!\s*\()`;

const SINKS = [
  {
    kind: "setState",
    re: new RegExp(String.raw`\bset[A-Z][\w$]*\(\s*${ERROR_EXPR}`, "g"),
  },
  {
    kind: "new Error",
    re: new RegExp(String.raw`\bnew\s+Error\(\s*${ERROR_EXPR}`, "g"),
  },
  { kind: "template", re: new RegExp(String.raw`\$\{\s*${ERROR_EXPR}`, "g") },
];

/** Blank out comments, keeping line numbers stable. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/.*$/gm, (m, lead) => lead);
}

export function findSinks(source) {
  const clean = stripComments(source);
  const hits = [];
  for (const { kind, re } of SINKS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const line = clean.slice(0, m.index).split("\n").length;
      hits.push({ kind, line, text: m[0].replace(/\s+/g, " ") });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(full, out);
    } else if (EXTENSIONS.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function report(failures) {
  console.error(
    "API error-sink guard failed. `body.error` from apiError()/fromException() is an object;\n" +
      "read it with apiErrorMessage(body) from lib/api-error-message.ts (or parseApiError(res)).\n",
  );
  console.error(failures.join("\n"));
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] === "--files") {
  const failures = [];
  for (const file of args.slice(1)) {
    for (const hit of findSinks(readFileSync(file, "utf8"))) {
      failures.push(`${file}:${hit.line} [${hit.kind}] ${hit.text}`);
    }
  }
  if (failures.length > 0) report(failures);
  console.log(`API error-sink guard passed for ${args.length - 1} file(s).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")).sites ?? {};
const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), []))
  .map((f) => relative(ROOT, f).split("\\").join("/"))
  .filter(
    (f) => !EXCLUDE_PREFIXES.some((p) => f.startsWith(p)) && !SKIP_PATH.test(f),
  );

const failures = [];
const seenBaselined = new Set();
for (const file of files) {
  const hits = findSinks(readFileSync(join(ROOT, file), "utf8"));
  const allowed = baseline[file] ?? 0;
  if (allowed > 0) seenBaselined.add(file);
  if (hits.length > allowed) {
    for (const hit of hits)
      failures.push(`${file}:${hit.line} [${hit.kind}] ${hit.text}`);
    if (allowed > 0)
      failures.push(
        `${file}: ${hits.length} site(s) above, baseline allows ${allowed}`,
      );
  } else if (hits.length < allowed) {
    failures.push(
      `${file}: baseline allows ${allowed} site(s) but ${hits.length} remain; lower the baseline in scripts/ci/api-error-sinks-baseline.json`,
    );
  }
}
for (const file of Object.keys(baseline)) {
  if (!seenBaselined.has(file)) {
    failures.push(
      `${file}: listed in the baseline but not scanned; remove the entry`,
    );
  }
}
if (failures.length > 0) report(failures);

const remaining = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(
  `API error-sink guard passed for ${files.length} files (${remaining} baselined site(s) left to migrate).`,
);
