#!/usr/bin/env node
/**
 * RA-8348 guard: a client must never hand a raw `<ident>.error` to a sink that
 * expects a string.
 *
 * Routes built on apiError()/fromException() reply with
 * `{ error: { code, message, eventId } }`. Putting that object in React state
 * and rendering it crashes ("Objects are not valid as a React child"); passing
 * it to `new Error(...)` shows "[object Object]" in the toast; interpolating it
 * into a template literal does the same. The one reader that handles every
 * envelope shape is `apiErrorMessage()` in lib/api-error-message.ts.
 *
 * A "raw read" is `<ident>.error` that is not followed by `.` or `?.` (a
 * property access such as `data.error.message` is a different, typed read).
 * It is a violation when it appears:
 *   1. inside the arguments of `new Error(`
 *   2. inside the arguments of a state setter `set[A-Z]...(`
 *   3. inside a `${...}` template-literal interpolation
 *
 * Scope: app/, components/, hooks/, lib/ excluding app/api/, tests and
 * __tests__ directories. There is no allow-list: route the value through
 * apiErrorMessage() instead, which also accepts a plain string.
 *
 * Usage: node scripts/check-api-error-sinks.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_DIR = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const SKIP_FILE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$/;

// Receivers whose `.error` is a logging method, not an API body.
const NON_BODY = new Set(["console", "toast", "logger", "log", "Sentry", "sonner"]);

// `<ident>(.<prop>)*.error` not followed by `.`, `?.` or a call.
const RAW_ERROR =
  /(?<![\w$.])([A-Za-z_$][\w$]*)(?:\??\.[A-Za-z_$][\w$]*)*\??\.error\b(?!\s*(?:\?\.|\.|\())/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(ROOT, full).split(sep).join("/");
    if (rel === "app/api") continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXT.test(name) && !SKIP_FILE.test(name)) yield { full, rel };
  }
}

/** Index range between the parenthesis opening at `open` and its match. */
function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { start: open + 1, end: i };
  }
  return { start: open + 1, end: src.length };
}

/** Blank out apiErrorMessage(...) calls: reading through it is the fix. */
function maskSafeReads(text) {
  let out = text;
  for (;;) {
    const m = /\bapiErrorMessage\s*\(/.exec(out);
    if (!m) return out;
    const { end } = balanced(out, m.index + m[0].length - 1);
    out = out.slice(0, m.index) + " ".repeat(end + 1 - m.index) + out.slice(end + 1);
  }
}

function rawErrorsIn(text) {
  const hits = [];
  for (const m of maskSafeReads(text).matchAll(RAW_ERROR)) {
    if (NON_BODY.has(m[1])) continue;
    hits.push({ index: m.index, text: m[0] });
  }
  return hits;
}

export function findSinks(src) {
  const found = [];
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const add = (kind, from, hits) => {
    for (const h of hits) found.push({ kind, index: from + h.index, line: lineOf(from + h.index), text: h.text });
  };

  for (const m of src.matchAll(/\bnew\s+Error\s*\(/g)) {
    const { start, end } = balanced(src, m.index + m[0].length - 1);
    add("new Error(", start, rawErrorsIn(src.slice(start, end)));
  }
  for (const m of src.matchAll(/(?<![\w$.])(set[A-Z]\w*)\s*\(/g)) {
    const { start, end } = balanced(src, m.index + m[0].length - 1);
    add(`${m[1]}(`, start, rawErrorsIn(src.slice(start, end)));
  }
  for (const m of src.matchAll(/\$\{/g)) {
    let depth = 1;
    let i = m.index + 2;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const start = m.index + 2;
    add("template literal", start, rawErrorsIn(src.slice(start, i - 1)));
  }

  const seen = new Set();
  return found.filter((f) => {
    const key = `${f.line}:${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const { full, rel } of walk(join(ROOT, dir))) {
      for (const f of findSinks(readFileSync(full, "utf8"))) {
        violations.push(`${rel}:${f.line}  ${f.text} -> ${f.kind}`);
      }
    }
  }
  if (violations.length > 0) {
    console.error(
      `API error sink guard FAILED: ${violations.length} raw "<ident>.error" read(s) reach a string sink.\n` +
        `Read the body through apiErrorMessage() from lib/api-error-message.ts instead.\n`,
    );
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log("API error sink guard passed: no raw body.error reaches a string sink.");
}
