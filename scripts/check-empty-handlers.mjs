#!/usr/bin/env node
/**
 * RA-8611 - fail when a product mount passes an `on*` prop a handler that
 * does no work.
 *
 * The defect kind: a control is on screen and enabled, but the handler behind
 * it does nothing. RA-8605, RA-8606 and RA-8609 had no handler passed at all
 * (scripts/check-unpassed-handlers.mjs, RA-8609, catches those). RA-8611 had a
 * handler passed that was empty: the guided interview's bottom "Next" button
 * was mounted with `onNext={() => {}}`. TypeScript and lint accept that, and a
 * "was a handler passed" check counts it as passed. This check closes that gap.
 *
 * Rule: in non-test .tsx files under `app/` and `components/` (outside the
 * vendored kits `components/ui` and `components/ai-elements`), a JSX attribute
 * `onX={...}` must not be an arrow function whose body is empty, or which only
 * returns `undefined`, `null` or `void 0`. Single-line and multi-line forms are
 * both matched.
 *
 * A deliberate no-op is allowed only for a notice hook (a callback the
 * component calls to tell the caller something, not a user control), and only
 * when it is declared in the source next to the handler: a comment containing
 * `empty-handler-ok: <reason>` on the same line as the attribute or on the line
 * directly above it. The reason must be at least a few words. There is no
 * separate exemption list file.
 *
 * Limits (stated, not hidden): a no-op passed by name (`onX={noop}`) or a
 * function whose body only logs is not detected; only arrow functions written
 * inline at the mount are checked.
 *
 * Usage:  node scripts/check-empty-handlers.mjs [--root DIR]
 *         node scripts/check-empty-handlers.mjs --self-test
 * Output: one `EMPTY_HANDLER <name> <file>:<line>` line per finding; exit 1
 *         when any are found, 0 when none.
 */
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN_ROOTS = ["app", "components"];
const VENDORED_KITS = ["components/ui", "components/ai-elements"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);

// `onX={` then optional `async`, then an arrow-function parameter list
// (`()`, `(e)`, `(_e: Foo)`, or a bare identifier), `=>`, then a body that
// does nothing: `{}`, `{ return; }`, `{ return undefined; }`, or an expression
// body of `undefined`, `null`, `void 0` (optionally parenthesised), then `}`.
// [\s\S] lets the match span lines.
const EMPTY_HANDLER = new RegExp(
  String.raw`\b(on[A-Z][A-Za-z0-9]*)\s*=\s*\{\s*(?:async\s+)?` +
    String.raw`(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[\w$<>\[\]|. ]+)?\s*=>\s*` +
    String.raw`(?:\{\s*(?:return(?:\s+(?:undefined|null|void\s+0))?\s*;?\s*)?\}` +
    String.raw`|\(?\s*(?:undefined|null|void\s+0)\s*\)?)` +
    String.raw`\s*\}`,
  "g",
);
const WAIVER = /empty-handler-ok:\s*(\S.{9,})/;

function isTestFile(rel) {
  return (
    /\.(test|spec)\.tsx?$/.test(rel) ||
    rel.split("/").some((part) => SKIP_DIRS.has(part))
  );
}

function listTsx(root, dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (VENDORED_KITS.some((kit) => rel === kit)) continue;
      out.push(...listTsx(root, rel));
    } else if (entry.name.endsWith(".tsx") && !isTestFile(rel)) {
      out.push(rel);
    }
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function findEmptyHandlers(root) {
  const findings = [];
  let scanned = 0;
  for (const dir of SCAN_ROOTS) {
    for (const rel of listTsx(root, dir)) {
      scanned++;
      const text = readFileSync(join(root, rel), "utf8");
      const lines = text.split("\n");
      for (const match of text.matchAll(EMPTY_HANDLER)) {
        const line = lineOf(text, match.index);
        const same = lines[line - 1] ?? "";
        const above = lines[line - 2] ?? "";
        if (WAIVER.test(same) || WAIVER.test(above)) continue;
        findings.push({ name: match[1], file: rel, line });
      }
    }
  }
  return { findings, scanned };
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "empty-handlers-"));
  const write = (rel, body) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  };
  try {
    // Each of these must be reported.
    write(
      "components/Bad.tsx",
      [
        "export const A = () => <Bar onNext={() => {}} />;", // 1
        "export const B = () => <Bar onSave={(e) => undefined} />;", // 2
        "export const C = () => <Bar onPick={() => null} />;", // 3
        "export const D = () => <Bar onGo={async () => {}} />;", // 4
        "export const E = () => <Bar onX={() => void 0} />;", // 5
        "export const F = () => (", // 6
        "  <Bar", // 7
        "    onMulti={() => {", // 8
        "    }}", // 9
        "  />", // 10
        ");", // 11
        "export const G = () => <Bar onRet={() => { return; }} />;", // 12
        "export const H = () => <Bar onTyped={(e: Event) => {}} />;", // 13
        "// empty-handler-ok:", // 14 (no reason: not a waiver)
        "export const I = () => <Bar onShort={() => {}} />;", // 15
      ].join("\n"),
    );
    // None of these may be reported.
    write(
      "app/page.tsx",
      [
        "export const A = () => <Bar onNext={() => go()} />;",
        "export const B = () => <Bar onSave={handleSave} />;",
        "export const C = () => <Bar onPick={() => { setX(1); }} />;",
        "export const D = () => <Bar onY={() => void load()} />;",
        "// empty-handler-ok: notice hook, this caller has no draft to save",
        "export const E = () => <Bar onBeforeBuy={() => undefined} />;",
        "export const F = () => <Bar onZ={() => undefined} />; // empty-handler-ok: notice hook with nothing to record",
      ].join("\n"),
    );
    // Excluded locations: vendored kit and tests.
    write("components/ui/Kit.tsx", "<Bar onNext={() => {}} />");
    write("components/x/__tests__/a.test.tsx", "<Bar onNext={() => {}} />");
    write("app/y.test.tsx", "<Bar onNext={() => {}} />");

    const { findings } = findEmptyHandlers(root);
    const got = findings.map((f) => `${f.name}@${f.file}:${f.line}`).sort();
    const want = [
      "onGo@components/Bad.tsx:4",
      "onMulti@components/Bad.tsx:8",
      "onNext@components/Bad.tsx:1",
      "onPick@components/Bad.tsx:3",
      "onRet@components/Bad.tsx:12",
      "onSave@components/Bad.tsx:2",
      "onShort@components/Bad.tsx:15",
      "onTyped@components/Bad.tsx:13",
      "onX@components/Bad.tsx:5",
    ].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error("SELF-TEST FAIL");
      console.error(`  want: ${want.join(", ")}`);
      console.error(`  got:  ${got.join(", ")}`);
      return 1;
    }
    console.log(`SELF-TEST PASS (${want.length} planted findings, 0 false positives)`);
    return 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1])
      : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { findings, scanned } = findEmptyHandlers(root);
  if (scanned === 0) {
    console.error(`check-empty-handlers: scanned 0 files under ${root}; refusing to pass`);
    return 1;
  }
  for (const f of findings) console.log(`EMPTY_HANDLER ${f.name} ${f.file}:${f.line}`);
  if (findings.length > 0) {
    console.error(
      `check-empty-handlers: ${findings.length} on* handler(s) do no work. Wire the control to real work or remove it. ` +
        "A notice hook that is deliberately a no-op needs an `empty-handler-ok: <reason>` comment next to it (RA-8611).",
    );
    return 1;
  }
  console.log(`check-empty-handlers: ${scanned} files scanned, no empty on* handlers`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
