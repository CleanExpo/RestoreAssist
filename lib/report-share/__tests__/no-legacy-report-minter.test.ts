/**
 * RA-8588 — every no-login report link must be a stored ReportShareAccess row.
 *
 * A link minted by `generateInsurerToken` has no row, so the Share screen
 * cannot list it and Revoke cannot stop it: a report emailed to the wrong
 * address stayed readable for 30 days. Product code mints report links with
 * `mintReportShareAccess`; `generateInsurerToken` survives only so tests can
 * build a legacy token for the fallback in `verifyReportReaderToken`.
 *
 * This guard fails when any non-test source under app, lib, components or
 * scripts names `generateInsurerToken` again. The planted-caller case below
 * proves the scanner can see one.
 */

import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";

const MINTER = "generateInsurerToken";
const ROOTS = ["app", "lib", "components", "scripts"];
// The definition itself is the only allowed non-test occurrence.
const DEFINITION = path.join("lib", "portal-token.ts");
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function isTestPath(rel: string): boolean {
  return (
    rel.split(path.sep).includes("__tests__") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
  );
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
}

// Code only: a comment that names the minter (as the removal notes do) is
// not a caller. Block comments, then line comments not inside a URL.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findLegacyMinterCallers(repoRoot: string): string[] {
  const files: string[] = [];
  for (const root of ROOTS) walk(path.join(repoRoot, root), files);
  return files
    .map((full) => path.relative(repoRoot, full))
    .filter((rel) => rel !== DEFINITION && !isTestPath(rel))
    .filter((rel) =>
      stripComments(readFileSync(path.join(repoRoot, rel), "utf8")).includes(
        MINTER,
      ),
    )
    .sort();
}

describe("RA-8588 — no product code mints an unrevocable report link", () => {
  it("finds a planted caller (positive control)", () => {
    const fake = mkdtempSync(path.join(tmpdir(), "ra-8588-"));
    mkdirSync(path.join(fake, "app", "api", "send"), { recursive: true });
    mkdirSync(path.join(fake, "app", "api", "send", "__tests__"), {
      recursive: true,
    });
    mkdirSync(path.join(fake, "lib"), { recursive: true });
    writeFileSync(
      path.join(fake, "app", "api", "send", "route.ts"),
      `import { ${MINTER} } from "@/lib/portal-token";\n`,
    );
    writeFileSync(
      path.join(fake, "app", "api", "send", "__tests__", "route.test.ts"),
      `${MINTER}("r");\n`,
    );
    writeFileSync(
      path.join(fake, "lib", "portal-token.ts"),
      `export function ${MINTER}() {}\n`,
    );
    // A comment naming the minter is not a caller.
    writeFileSync(
      path.join(fake, "lib", "notes.ts"),
      `/** Replaced \`${MINTER}\` (RA-8588). */\n// ${MINTER} is legacy\nexport const x = 1;\n`,
    );

    expect(findLegacyMinterCallers(fake)).toEqual([
      path.join("app", "api", "send", "route.ts"),
    ]);
  });

  it("finds none in this repository", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    // Sanity: the scan really reached the definition's directory.
    expect(readFileSync(path.join(repoRoot, DEFINITION), "utf8")).toContain(
      MINTER,
    );
    expect(findLegacyMinterCallers(repoRoot)).toEqual([]);
  });
});
