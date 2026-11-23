/**
 * The argv main-module detector (RA-7785) must flag every guard shape that
 * shipped under scripts/, ignore prose about it, and refuse an empty scan.
 * The fixtures are assembled from pieces so this file is not itself a finding.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { main, scanText } from "../lib/no-argv-guard.mjs";

const ARG = "process.argv" + "[1]";
const SHAPES = {
  "template file URL": `if (import.meta.url === \`file://\${${ARG}}\`) {\n  main();\n}\n`,
  pathToFileURL: `if (\n  ${ARG} &&\n  import.meta.url === pathToFileURL(${ARG}).href\n) {\n  main();\n}\n`,
  "resolve vs fileURLToPath": `const invoked =\n  !!${ARG} &&\n  resolve(${ARG}) === fileURLToPath(import.meta.url);\nif (invoked) main();\n`,
  "optional endsWith": `if (${ARG}?.endsWith("x.mjs")) main();\n`,
  "plain endsWith": `if (${ARG} && ${ARG}.endsWith("x.mjs")) main();\n`,
  "regex test": `if (/x\\.ts$/.test(${ARG} ?? "")) main();\n`,
  "resolved entry then compare": `const entry = ${ARG} ? path.resolve(${ARG}) : "";\nif (entry && import.meta.url === pathToFileURL(entry).href) main();\n`,
  "URL pathname": `const isMain =\n  ${ARG} != null &&\n  new URL(import.meta.url).pathname === ${ARG};\n`,
  // RA-8484 (findings 16 and 17): basename, far endsWith and far pathname.
  "basename compared": `import path from "node:path";\nif (path.basename(${ARG}) === "gate.mjs") main();\n`,
  "basename bound, compared later": `const entry = path.basename(${ARG} ?? "");\n${"const pad = 0;\n".repeat(8)}if (entry === "gate.mjs") main();\n`,
  "argument bound, endsWith later": `const entry = ${ARG};\n${"const pad = 0;\n".repeat(8)}if (entry && entry.endsWith("gate.mjs")) main();\n`,
  "pathname bound, compared later": `const self = new URL(import.meta.url).pathname;\n${"const pad = 0;\n".repeat(8)}if (self === ${ARG}) main();\n`,
  "typed binding, regex test later": `const entry: string = ${ARG} ?? "";\n${"const pad = 0;\n".repeat(8)}if (/gate\\.ts$/.test(entry)) main();\n`,
  "argument includes": `if (${ARG}.includes("gate")) main();\n`,
  "argument equals __filename": `if (${ARG} === __filename) main();\n`,
};

for (const [name, text] of Object.entries(SHAPES)) {
  test(`flags the ${name} guard`, () => {
    assert.ok(scanText(text).length > 0, `not flagged:\n${text}`);
  });
}

test("ignores the fault described in comments", () => {
  const text = `// compares import.meta.url with ${ARG}\n/*\n * ${ARG}.endsWith(...) and import.meta\n */\nprocess.exitCode = main();\n`;
  assert.deepEqual(scanText(text), []);
});

test("does not flag a thin entry", () => {
  assert.deepEqual(scanText('import { main } from "./lib/x.mjs";\n\nprocess.exitCode = await main();\n'), []);
});

test("does not flag the argument read only for a usage message", () => {
  const text = `const name = path.basename(${ARG} ?? "gate");\n${"const pad = 0;\n".repeat(8)}console.error(\`usage: \${name} <file>\`);\n`;
  assert.deepEqual(scanText(text), []);
});

test("an alias is matched by whole name, not as part of a longer one", () => {
  const text = `const entry = ${ARG};\n${"const pad = 0;\n".repeat(8)}if (entryCount === 2) stop();\nrun(entry);\n`;
  assert.deepEqual(scanText(text), []);
});

test("reports the line of the argument read", () => {
  const [hit] = scanText(`const a = 1;\n\nif (${ARG}?.endsWith("x.mjs")) main();\n`);
  assert.equal(hit.line, 3);
});

function scratch(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "ra7785-argv-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test("exit codes: 0 clean, 1 findings, 2 empty or unreadable", () => {
  const quiet = { error: console.error, log: console.log };
  console.error = console.log = () => {};
  const dirs = [];
  try {
    const clean = scratch({ "scripts/a.mjs": "export const a = 1;\n" });
    const dirty = scratch({ "scripts/ci/b.mjs": SHAPES["optional endsWith"] });
    const empty = scratch({ "scripts/README.md": "no code\n" });
    dirs.push(clean, dirty, empty);
    assert.equal(main(["--root", clean]), 0);
    assert.equal(main(["--root", dirty]), 1);
    assert.equal(main(["--root", empty]), 2);
    assert.equal(main(["--root", path.join(clean, "missing")]), 2);
    assert.equal(main(["--root"]), 2);
    assert.equal(main(["--bogus"]), 2);
  } finally {
    Object.assign(console, quiet);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
});

test("baseline: a listed finding passes, an unlisted one fails, a stale entry is a note", () => {
  const guard = SHAPES["optional endsWith"];
  const baseline = (files) => JSON.stringify({ note: "test", files });
  const lines = [];
  const quiet = { error: console.error, log: console.log };
  console.error = console.log = (m) => lines.push(String(m));
  const dirs = [];
  try {
    const listed = scratch({ "scripts/old.mjs": guard, "scripts/argv-guard-baseline.json": baseline({ "scripts/old.mjs": 1 }) });
    const unlisted = scratch({
      "scripts/old.mjs": guard,
      "scripts/new.mjs": guard,
      "scripts/argv-guard-baseline.json": baseline({ "scripts/old.mjs": 1 }),
    });
    const over = scratch({ "scripts/old.mjs": guard + guard, "scripts/argv-guard-baseline.json": baseline({ "scripts/old.mjs": 1 }) });
    const stale = scratch({
      "scripts/old.mjs": "export const converted = true;\n",
      "scripts/argv-guard-baseline.json": baseline({ "scripts/old.mjs": 1, "scripts/gone.mjs": 2 }),
    });
    const broken = scratch({ "scripts/a.mjs": "export {};\n", "scripts/argv-guard-baseline.json": "{ not json" });
    dirs.push(listed, unlisted, over, stale, broken);
    assert.equal(main(["--root", listed]), 0);
    lines.length = 0;
    assert.equal(main(["--root", unlisted]), 1);
    assert.ok(lines.some((l) => l.includes("scripts/new.mjs:1")), "the unlisted file is not named");
    assert.ok(!lines.some((l) => l.includes("scripts/old.mjs:1")), "a baselined finding was reported");
    assert.equal(main(["--root", over]), 1);
    lines.length = 0;
    assert.equal(main(["--root", stale]), 0);
    assert.ok(lines.some((l) => l.includes("note:") && l.includes("scripts/old.mjs")), "stale entry not noted");
    assert.ok(lines.some((l) => l.includes("note:") && l.includes("scripts/gone.mjs")), "missing file not noted");
    assert.equal(main(["--root", broken]), 2);
  } finally {
    Object.assign(console, quiet);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
});
