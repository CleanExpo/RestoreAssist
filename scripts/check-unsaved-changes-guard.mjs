#!/usr/bin/env node
/**
 * RestoreAssist - unsaved-changes guard check (RA-8397).
 *
 * A long form that saves to the server must warn before typed work is lost.
 * The defect was fixed one screen at a time four times (RA-1213, RA-7763,
 * RA-8322, RA-8334) because nothing checked for it. This check does.
 *
 * A file is a "long form" when it is a client file under app/ (not app/api)
 * or components/, has 8 or more typed boxes, and sends POST, PUT or PATCH.
 * Typed boxes: <Input, <Textarea, <textarea, and <input other than
 * checkbox, radio, hidden, file, submit, button, range, color, reset, image.
 * A long form passes when it calls `useUnsavedChangesGuard(`
 * (lib/hooks/useUnsavedChangesGuard.tsx), or carries the comment
 * `ra-unsaved-guard-exempt: <reason>` with a reason of 10 or more characters.
 *
 * Limits: boxes built from a wrapper component are not counted, and a
 * shorter form with one long text area is not judged.
 *
 * Modes:
 *   (default)          Ratchet. Fails on a long form that is unguarded and not
 *                      in scripts/unsaved-guard-baseline.json, and on a baseline
 *                      entry that is now guarded or gone (shrink the baseline).
 *   --strict           Fails on every unguarded long form, baseline or not.
 *   --update-baseline  Rewrites the baseline from the current tree.
 *   --self-test        Proves the detector flags a planted unguarded form and
 *                      passes guarded, exempted and short ones. Touches no files.
 *
 * Exit 0 = pass. Exit 1 = violations. Exit 2 = could not run (never a pass).
 * Node stdlib only.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "api"]);
const BASELINE_PATH = join(ROOT, "scripts", "unsaved-guard-baseline.json");
const MIN_BOXES = 8;
const HOOK = "useUnsavedChangesGuard";
// A call, not a mention: an import or a comment alone protects nothing.
const HOOK_CALL_RE = /(?<![\w.])useUnsavedChangesGuard\s*\(/;
const EXEMPT_RE = /ra-unsaved-guard-exempt:\s*(\S.{9,})/;
const NON_TYPED = new Set([
  "checkbox",
  "radio",
  "hidden",
  "file",
  "submit",
  "button",
  "range",
  "color",
  "reset",
  "image",
]);
const MUTATION_RE = /method\s*:\s*["'`](POST|PUT|PATCH)["'`]/i;

/** Count typed boxes in one source string. */
export function countTypedBoxes(src) {
  let n = 0;
  n += (src.match(/<(Input|Textarea|textarea)\b/g) || []).length;
  const inputRe = /<input\b([^>]*)>/gs;
  let m;
  while ((m = inputRe.exec(src))) {
    const type = /\btype\s*=\s*\{?\s*["'`]([a-z-]+)["'`]/i.exec(m[1]);
    if (!type || !NON_TYPED.has(type[1].toLowerCase())) n += 1;
  }
  return n;
}

/** Classify one source string: "short", "guarded", "exempt" or "unguarded". */
export function classify(src) {
  if (!/^\s*["']use client["']/m.test(src)) return "short";
  if (!MUTATION_RE.test(src)) return "short";
  if (countTypedBoxes(src) < MIN_BOXES) return "short";
  if (HOOK_CALL_RE.test(src.replace(/\/\/.*$/gm, ""))) return "guarded";
  if (EXEMPT_RE.test(src)) return "exempt";
  return "unguarded";
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
}

function scan() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  if (files.length === 0) {
    console.error(
      "check-unsaved-changes-guard: no .tsx files found; run from the repo root.",
    );
    process.exit(2);
  }
  const unguarded = [];
  let longForms = 0;
  for (const f of files) {
    const kind = classify(readFileSync(f, "utf8"));
    if (kind !== "short") longForms += 1;
    if (kind === "unguarded")
      unguarded.push(relative(ROOT, f).split(sep).join("/"));
  }
  return { scanned: files.length, longForms, unguarded: unguarded.sort() };
}

function selfTest() {
  const box = "<Input value={a} onChange={f} />\n";
  const post = 'fetch("/api/x", { method: "POST" });\n';
  const head = '"use client";\n';
  const cases = [
    ["9-box form, no guard", head + post + box.repeat(9), "unguarded"],
    [
      "same form with the hook",
      head + post + box.repeat(9) + `${HOOK}(dirty);\n`,
      "guarded",
    ],
    [
      "hook imported but never called",
      head + post + box.repeat(9) + `import { ${HOOK} } from "x";\n`,
      "unguarded",
    ],
    [
      "hook named only in a comment",
      head + post + box.repeat(9) + `// TODO ${HOOK}(dirty)\n`,
      "unguarded",
    ],
    [
      "same form exempted with a reason",
      head +
        post +
        box.repeat(9) +
        "// ra-unsaved-guard-exempt: read-only preview, nothing typed is kept\n",
      "exempt",
    ],
    [
      "exempt marker without a reason",
      head + post + box.repeat(9) + "// ra-unsaved-guard-exempt: x\n",
      "unguarded",
    ],
    ["3-box form", head + post + box.repeat(3), "short"],
    [
      "12 checkboxes",
      head + post + '<input type="checkbox" />\n'.repeat(12),
      "short",
    ],
    ["9 boxes but no save call", head + box.repeat(9), "short"],
    [
      "9 boxes, PATCH, multi-line input",
      head +
        'fetch(u, { method: "PATCH" })\n' +
        "<input\n  value={v}\n  onChange={f}\n/>\n".repeat(9),
      "unguarded",
    ],
    ["server component", post + box.repeat(9), "short"],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = classify(src);
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: want ${want}, got ${got}`);
  }
  if (failed) {
    console.error(`self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log(`self-test: ${cases.length} cases passed`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();

  const { scanned, longForms, unguarded } = scan();
  console.log(
    `tsx files read: ${scanned}; long forms: ${longForms}; unguarded: ${unguarded.length}`,
  );

  if (args.includes("--update-baseline")) {
    writeFileSync(BASELINE_PATH, JSON.stringify(unguarded, null, 2) + "\n");
    console.log(`baseline rewritten: ${unguarded.length} file(s)`);
    return;
  }

  if (args.includes("--strict")) {
    for (const f of unguarded) console.error(`unguarded long form: ${f}`);
    if (unguarded.length) {
      console.error(
        `FAIL: ${unguarded.length} long form(s) can lose typed work. Use ${HOOK} (lib/hooks/useUnsavedChangesGuard.tsx).`,
      );
      process.exit(1);
    }
    console.log("PASS (strict)");
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `check-unsaved-changes-guard: baseline missing at ${relative(ROOT, BASELINE_PATH)}`,
    );
    process.exit(2);
  }
  const baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")));
  const fresh = unguarded.filter((f) => !baseline.has(f));
  const current = new Set(unguarded);
  const stale = [...baseline].filter((f) => !current.has(f));
  for (const f of fresh) {
    console.error(
      `new unguarded long form: ${f} — use ${HOOK} (lib/hooks/useUnsavedChangesGuard.tsx), or add "// ra-unsaved-guard-exempt: <reason>"`,
    );
  }
  for (const f of stale) {
    console.error(
      `baseline entry no longer needed: ${f} — remove it from scripts/unsaved-guard-baseline.json`,
    );
  }
  if (fresh.length || stale.length) process.exit(1);
  console.log(`PASS (ratchet): ${baseline.size} known form(s) still to wire`);
}

main();
