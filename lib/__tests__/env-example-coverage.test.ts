import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * RA-7477: every env name read on a runtime path must appear in .env.example.
 *
 * Scans app/ and lib/ (.ts/.tsx), skipping __tests__ directories and
 * .test./.spec. files, so tooling-only names (E2E, Playwright, and the rest)
 * stay out of scope. Reads .env.example only — never a live env file.
 */

const repoRoot = path.resolve(__dirname, "../..");

/** The only env file this guard is allowed to open. */
const ENV_EXAMPLE_REL = ".env.example";

/**
 * Injected by Node, Next.js, Vercel, npm, or the CI runner. Not application
 * configuration, so .env.example does not list them.
 *
 * A prefix matches that exact name and any `${prefix}_…` name (`VERCEL`
 * covers `VERCEL` and `VERCEL_ENV`). `npm_` already ends in an underscore,
 * so it covers `npm_package_version` and the other npm-injected names.
 */
const BUILTIN_ENV_NAMES = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "CI",
  "PORT",
  "TZ",
  "HOME",
  "PATH",
  "TMPDIR",
  "NODE_OPTIONS",
  "ANALYZE",
] as const;

const BUILTIN_ENV_PREFIXES = ["VERCEL", "npm_"] as const;

const DOT_ACCESS = /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const BRACKET_ACCESS =
  /\bprocess\.env\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g;

function isBuiltinEnvName(name: string): boolean {
  if ((BUILTIN_ENV_NAMES as readonly string[]).includes(name)) return true;
  return BUILTIN_ENV_PREFIXES.some((prefix) =>
    prefix.endsWith("_")
      ? name.startsWith(prefix)
      : name === prefix || name.startsWith(`${prefix}_`),
  );
}

/** Names read via process.env.NAME or process.env['NAME'] / process.env["NAME"]. */
function envNamesInSource(src: string): string[] {
  const names = new Set<string>();

  for (const match of src.matchAll(DOT_ACCESS)) {
    const name = match[1];
    if (!name) continue;
    // Prose wildcards (`process.env.NEXT_PUBLIC_*`) are not identifiers.
    // A real read is never followed by `*`.
    const after = src[match.index! + match[0].length];
    if (after === "*") continue;
    names.add(name);
  }

  for (const match of src.matchAll(BRACKET_ACCESS)) {
    const name = match[2];
    if (name) names.add(name);
  }

  return [...names].sort();
}

function isRuntimeSource(name: string): boolean {
  if (!/\.(ts|tsx)$/.test(name)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(name)) return false;
  return true;
}

function runtimeSourceFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && isRuntimeSource(entry.name)) files.push(full);
    }
  }

  walk(path.join(repoRoot, "app"));
  walk(path.join(repoRoot, "lib"));
  return files;
}

function documentedEnvNames(exampleSource: string): Set<string> {
  const names = new Set<string>();
  for (const line of exampleSource.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function readEnvExample(): string {
  return fs.readFileSync(path.join(repoRoot, ENV_EXAMPLE_REL), "utf8");
}

/** Runtime names that are neither documented nor on the built-in allow-list. */
function undocumentedRuntimeEnvNames(exampleSource: string): string[] {
  const documented = documentedEnvNames(exampleSource);
  const used = new Set<string>();
  for (const file of runtimeSourceFiles()) {
    for (const name of envNamesInSource(fs.readFileSync(file, "utf8"))) {
      used.add(name);
    }
  }
  return [...used]
    .filter((name) => !documented.has(name) && !isBuiltinEnvName(name))
    .sort();
}

describe("runtime env names are documented in .env.example (RA-7477)", () => {
  it("reads dot access, quoted bracket access, and ignores a prose wildcard", () => {
    expect(
      envNamesInSource(
        [
          "process.env.FOO",
          "process.env['BAR']",
          'process.env["BAZ"]',
          "process.env[name]",
          "process.env.NEXT_PUBLIC_*",
        ].join("\n"),
      ),
    ).toEqual(["BAR", "BAZ", "FOO"]);
  });

  it("allow-lists platform names and leaves application names to .env.example", () => {
    for (const name of [
      "NODE_ENV",
      "NEXT_RUNTIME",
      "CI",
      "PORT",
      "TZ",
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_URL",
      "VERCEL_GIT_COMMIT_SHA",
      "npm_package_version",
    ]) {
      expect(isBuiltinEnvName(name), name).toBe(true);
    }
    expect(isBuiltinEnvName("DATABASE_URL")).toBe(false);
    expect(isBuiltinEnvName("GIT_SHA")).toBe(false);
  });

  it("every runtime process.env name is in .env.example or the built-in allow-list", () => {
    const missing = undocumentedRuntimeEnvNames(readEnvExample());
    expect(
      missing,
      `These names are read in app/ or lib/ but absent from .env.example:\n${missing
        .map((name) => `  ${name}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
