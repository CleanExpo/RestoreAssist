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
