// RA-7784 — `lib/env.ts` is the only shipped module allowed to read the
// Node `process` environment.
//
// Core ESLint only (eslint-plugin-n is not installed). `no-restricted-syntax`
// selectors cover every escape shape Critic found on RA-7477 / PR #2359:
//
//   process.env.X            process?.env.X          process["env"].X
//   process[`env`].X         globalThis.process.env  global.process.env
//   const { env } = process  const p = process       p = process
//   f(process)               require("process")      require("node:process")
//   import proc from "node:process"                  import { env } from "process"
//   import x = require("process")                    import("node:process")
//   module.require("process")                        createRequire(...)("process")
//   (require)("process")     require("pro" + "cess") require(`${name}`)
//
// Module names that are not a plain string literal fail closed: they are
// flagged, not followed. Harmless members such as `process.cwd()`,
// `process.platform` and `process.exit()` stay allowed, and an identifier
// merely named `env` is never flagged.
//
// Files that already read env are listed in `process-env-baseline.json` so CI
// stays green; any file not on that list fails lint on its first read. Shrink
// the baseline as files move to `lib/env.ts`; never grow it to land a feature.
// `scripts/ci/check-process-env-baseline.mjs` fails on a stale entry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROCESS_ENV_BASELINE_PATH = path.join(here, "process-env-baseline.json");

export const PROCESS_ENV_RULE_MESSAGE =
  "RA-7784: read environment variables through lib/env.ts (readEnv / readDeclaredEnv), not the process object.";

/**
 * Files that may read `process` directly, each with its reason. These are not
 * debt: they are the reader itself or code evaluated before the app module
 * graph exists. Everything else that reads env today is in the baseline.
 */
export const PROCESS_ENV_ALLOWED_FILES = [
  { file: "lib/env.ts", reason: "The single env reader (RA-7784)." },
  {
    file: "next.config.mjs",
    reason:
      "Evaluated by the Next.js CLI before the app module graph exists, and it cannot import TypeScript.",
  },
];

/** Never shipped: tests, fixtures and mocks may stub env freely. */
export const PROCESS_ENV_TEST_GLOBS = [
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/*.test.*",
  "**/*.spec.*",
  "e2e/**",
];

const MODULE = "/^(node:)?process$/";
const msg = (detail) => `${PROCESS_ENV_RULE_MESSAGE} (${detail})`;

export const PROCESS_ENV_SELECTORS = [
  // process.env, process?.env, process["env"]
  {
    selector: "MemberExpression[object.type='Identifier'][object.name='process'][property.name='env']",
    message: msg("process.env"),
  },
  {
    selector: "MemberExpression[object.type='Identifier'][object.name='process'][computed=true][property.value='env']",
    message: msg('process["env"]'),
  },
  // process[`env`] and any other computed, non-literal member of process
  {
    selector:
      "MemberExpression[object.type='Identifier'][object.name='process'][computed=true]:not([property.type='Literal'])",
    message: msg("computed process member"),
  },
  // globalThis.process / global.process / window.process / self.process, dotted or computed
  {
    selector:
      "MemberExpression[object.type='Identifier'][object.name=/^(globalThis|global|window|self)$/][property.name='process']",
    message: msg("globalThis.process"),
  },
  {
    selector:
      "MemberExpression[object.type='Identifier'][object.name=/^(globalThis|global|window|self)$/][computed=true]:not([property.type='Literal'])",
    message: msg("computed global member"),
  },
  {
    selector:
      "MemberExpression[object.type='Identifier'][object.name=/^(globalThis|global|window|self)$/][property.value='process']",
    message: msg('globalThis["process"]'),
  },
  // Aliasing or destructuring process: const { env } = process; const p = process; p = process
  {
    selector: "VariableDeclarator[init.type='Identifier'][init.name='process']",
    message: msg("process alias or destructure"),
  },
  {
    selector: "AssignmentExpression[right.type='Identifier'][right.name='process']",
    message: msg("process assignment"),
  },
  // Handing the whole process object to something else: f(process), [process], { p: process }
  {
    selector: "CallExpression > Identifier.arguments[name='process']",
    message: msg("process passed as an argument"),
  },
  {
    selector: "ArrayExpression > Identifier.elements[name='process']",
    message: msg("process in an array"),
  },
  {
    selector: "Property > Identifier.value[name='process']",
    message: msg("process in an object"),
  },
  // Loading the process module: import, import type excluded by TS only via `import type`
  {
    selector: `ImportDeclaration[source.value=${MODULE}]`,
    message: msg("import of the process module"),
  },
  {
    selector: `ExportNamedDeclaration[source.value=${MODULE}], ExportAllDeclaration[source.value=${MODULE}]`,
    message: msg("re-export of the process module"),
  },
  {
    selector: `ImportExpression[source.value=${MODULE}]`,
    message: msg("dynamic import of the process module"),
  },
  {
    selector: "ImportExpression:not([source.type='Literal'])",
    message: msg("dynamic import with a non-literal module name (fails closed)"),
  },
  {
    selector: `TSImportEqualsDeclaration[moduleReference.expression.value=${MODULE}]`,
    message: msg("import = require of the process module"),
  },
  // Any call whose first argument is the literal module name: require, module.require,
  // (require)(...), a renamed createRequire result, etc.
  {
    selector: `CallExpression[arguments.0.type='Literal'][arguments.0.value=${MODULE}]`,
    message: msg("require of the process module"),
  },
  {
    selector: `CallExpression[arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=${MODULE}]`,
    message: msg("require of the process module via a template literal"),
  },
  // require / module.require / createRequire results with a non-literal module name fail closed
  {
    selector: "CallExpression[callee.type='Identifier'][callee.name='require']:not([arguments.0.type='Literal'])",
    message: msg("require with a non-literal module name (fails closed)"),
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='require']:not([arguments.0.type='Literal'])",
    message: msg("module.require with a non-literal module name (fails closed)"),
  },
  {
    selector: "CallExpression[callee.type='Identifier'][callee.name='createRequire']",
    message: msg("createRequire (its result can load process under any name)"),
  },
];

/** Repo-relative POSIX paths of files that read env today. */
export function readProcessEnvBaseline(file = PROCESS_ENV_BASELINE_PATH) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed.files) || !parsed.files.every((f) => typeof f === "string")) {
    throw new Error(`${file}: expected { "files": string[] }`);
  }
  return parsed.files;
}

/**
 * A literal path as a flat-config `files` pattern. Route folders such as
 * `[id]` and `(auth)` are glob syntax, so an unescaped path would silently
 * fail to match its own file.
 */
export function literalPathPattern(file) {
  return file.replace(/[[\]()*?{}!+@]/g, (c) => `\\${c}`);
}

/** Flat-config blocks: the rule for all shipped source, then the exemptions. */
export function processEnvConfigBlocks({ baseline = readProcessEnvBaseline() } = {}) {
  return [
    {
      files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
      ignores: [...PROCESS_ENV_TEST_GLOBS, ...PROCESS_ENV_ALLOWED_FILES.map((a) => a.file)],
      rules: {
        "no-restricted-syntax": ["error", ...PROCESS_ENV_SELECTORS],
      },
    },
    ...(baseline.length > 0
      ? [
          {
            // RA-7784 baseline: existing direct readers. Shrink only.
            files: baseline.map(literalPathPattern),
            rules: { "no-restricted-syntax": "off" },
          },
        ]
      : []),
  ];
}
