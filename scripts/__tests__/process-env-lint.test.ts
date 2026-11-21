import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { ESLint } from "eslint";

/**
 * RA-7784: the lint rule itself (config/eslint-process-env.mjs, wired into
 * config/eslint.config.mjs) must fail on every escape shape Critic listed on
 * RA-7477 / PR #2359, with file and line, in a shipped file that is not on
 * the baseline. Harmless process members and identifiers merely named `env`
 * must stay clean.
 */

const repoRoot = path.resolve(__dirname, "../..");
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: path.join(repoRoot, "config/eslint.config.mjs"),
  ruleFilter: ({ ruleId }) => ruleId === "no-restricted-syntax",
});

/** Not on the baseline, not a test, not an allowed file. */
const NEW_FILE = "lib/ra-7784-new-reader.ts";

async function violations(code: string, filePath = NEW_FILE) {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-syntax");
}

const ESCAPE_SHAPES: Array<[string, string]> = [
  // The five from Critic's review at bdafe79.
  ["optional process", "export const a = process?.env.SECRET_X;"],
  ["destructured env", "const { env } = process;\nexport const a = env.SECRET_X;"],
  ["aliased process", "const p = process;\nexport const a = p.env.SECRET_X;"],
  ["globalThis.process", "export const a = globalThis.process.env.SECRET_X;"],
  ["template key", "export const a = process[`env`].SECRET_X;"],
  // Plain forms.
  ["dot access", "export const a = process.env.SECRET_X;"],
  ["string key", 'export const a = process["env"].SECRET_X;'],
  ["global.process", "export const a = global.process.env.SECRET_X;"],
  ["spread", "export const a = { ...process.env };"],
  ["assigned alias", "let p: unknown;\np = process;\nexport { p };"],
  ["passed as argument", "declare function f(x: unknown): void;\nf(process);"],
  // Loading the process module (Critic HOLD on fde3dd2).
  ["require('process')", "export const a = require('process').env.SECRET_X;"],
  ["require('node:process')", "export const a = require('node:process').env.SECRET_X;"],
  ["default import", "import proc from 'node:process';\nexport const a = proc.env.SECRET_X;"],
  ["named import", "import { env } from 'node:process';\nexport const a = env.SECRET_X;"],
  ["dynamic import", "export const a = import('node:process');"],
  // Five more (Critic post-merge verdict on d58a69e).
  ["import = require", "import x = require('process');\nexport const a = x.env.SECRET_X;"],
  ["module.require", "export const a = module.require('process').env.SECRET_X;"],
  [
    "renamed createRequire",
    "import { createRequire } from 'node:module';\nconst r = createRequire(import.meta.url);\nexport const a = r('process').env.SECRET_X;",
  ],
  ["concatenated module name", "export const a = require('pro' + 'cess').env.SECRET_X;"],
  ["template module name", "const n = 'cess';\nexport const a = require(`pro${n}`).env.SECRET_X;"],
  ["parenthesised require", "export const a = (require)('process').env.SECRET_X;"],
];

describe("process-env lint rule (RA-7784)", () => {
  it.each(ESCAPE_SHAPES)("fails on %s with a line number", async (_label, code) => {
    const found = await violations(code);
    expect(found.length, code).toBeGreaterThan(0);
    for (const m of found) {
      expect(m.severity).toBe(2);
      expect(m.line).toBeGreaterThan(0);
      expect(m.message).toContain("RA-7784");
    }
  });

  it("allows harmless process members and identifiers named env", async () => {
    const code = [
      "export const cwd = process.cwd();",
      "export const platform = process.platform;",
      "export function stop(): void { process.exit(1); }",
      "const env = { mode: 'x' };",
      "export const mode = env.mode;",
      "export function read(o: { env: string }) { return o.env; }",
      "export const pkg = require('./local-module');",
    ].join("\n");
    expect(await violations(code)).toEqual([]);
  });

  it("exempts lib/env.ts, test files and baselined files, and nothing else", async () => {
    const code = "export const a = process.env.SECRET_X;";
    expect(await violations(code, "lib/env.ts")).toEqual([]);
    expect(await violations(code, "lib/__tests__/anything.test.ts")).toEqual([]);
    // On the baseline at RA-7784.
    expect(await violations(code, "lib/env-check.ts")).toEqual([]);
    // Migrated off the baseline in this PR, so a regression fails.
    expect((await violations(code, "app/api/cron/cron-watchdog/route.ts")).length).toBeGreaterThan(0);
  });

  it("covers .js, .mjs, .cjs, .jsx, .mts and .cts shipped files", async () => {
    for (const ext of ["js", "mjs", "cjs", "jsx", "mts", "cts", "tsx"]) {
      const found = await violations("export const a = process.env.SECRET_X;", `lib/ra-7784-new.${ext}`);
      expect(found.length, ext).toBeGreaterThan(0);
    }
  });
});
