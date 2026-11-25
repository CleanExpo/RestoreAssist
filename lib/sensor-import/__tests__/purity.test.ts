import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The reader library must write nothing and reach nothing: no database client,
 * no route helper, no network. This test reads the source with the TypeScript
 * compiler and allows only the imports the spec names.
 */
const LIB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_PACKAGES = new Set(["zod", "@/lib/sanitize"]);
const EXPECTED_SOURCES = ["map-rows.ts", "mapping.ts", "parse-sensor-csv.ts"];

type Found = { specifier: string | null; form: string };

/** Every place a module can pull in another module, in any syntax. A null specifier is one that is not a plain string. */
function moduleReferences(fileName: string, source: string): Found[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Found[] = [];
  const text = (node: ts.Node | undefined): string | null =>
    node && ts.isStringLiteralLike(node) ? node.text : null;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      found.push({ specifier: text(node.moduleSpecifier), form: "import" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      found.push({ specifier: text(node.moduleSpecifier), form: "re-export" });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push({ specifier: text(node.moduleReference.expression), form: "import-equals" });
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      found.push({
        specifier: ts.isLiteralTypeNode(argument) ? text(argument.literal) : null,
        form: "import-type",
      });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        found.push({ specifier: text(node.arguments[0]), form: "dynamic-import" });
      } else if (ts.isIdentifier(callee) && callee.text === "require") {
        found.push({ specifier: text(node.arguments[0]), form: "require" });
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "require"
      ) {
        found.push({ specifier: text(node.arguments[0]), form: "require-member" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function isAllowed(specifier: string | null): boolean {
  if (specifier === null) return false;
  if (ALLOWED_PACKAGES.has(specifier)) return true;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return false;
  const target = resolve(LIB_DIR, specifier);
  return target.startsWith(LIB_DIR + sep) && !target.startsWith(resolve(LIB_DIR, "__tests__"));
}

function sourceFiles(): string[] {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

describe("AC-11 the library imports nothing that can write or reach out", () => {
  it("has exactly the three source files the spec names", () => {
    expect(sourceFiles()).toEqual(EXPECTED_SOURCES);
    const folders = readdirSync(LIB_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders).toEqual(["__tests__"]);
  });

  it("finds every way of referring to another module (control for the check below)", () => {
    const sample = [
      'import { a } from "pkg-static";',
      'import "pkg-side-effect";',
      'import type { T } from "pkg-type";',
      'export { b } from "pkg-reexport";',
      'export * from "pkg-star";',
      'const c = require("pkg-require");',
      'const d = require.resolve("pkg-resolve");',
      'const e = await import("pkg-dynamic");',
      'type F = import("pkg-import-type").F;',
      'import g = require("pkg-import-equals");',
      "const h = await import(someVariable);",
    ].join("\n");
    const found = moduleReferences("sample.ts", sample);
    expect(found.map((f) => f.specifier)).toEqual([
      "pkg-static",
      "pkg-side-effect",
      "pkg-type",
      "pkg-reexport",
      "pkg-star",
      "pkg-require",
      "pkg-resolve",
      "pkg-dynamic",
      "pkg-import-type",
      "pkg-import-equals",
      null,
    ]);
    expect(found.every((f) => !isAllowed(f.specifier))).toBe(true);
  });

  it("allows only zod, the sanitiser and files inside lib/sensor-import", () => {
    expect(isAllowed("zod")).toBe(true);
    expect(isAllowed("@/lib/sanitize")).toBe(true);
    expect(isAllowed("./mapping")).toBe(true);
    expect(isAllowed("../prisma")).toBe(false);
    expect(isAllowed("./__tests__/purity.test")).toBe(false);
    expect(isAllowed("@/lib/prisma")).toBe(false);
    expect(isAllowed("@prisma/client")).toBe(false);
    expect(isAllowed("next/server")).toBe(false);
    expect(isAllowed("node:fs")).toBe(false);
    expect(isAllowed("zod/v4")).toBe(false);
    expect(isAllowed(null)).toBe(false);
  });

  it("finds no other import in any source file", () => {
    const names = sourceFiles();
    expect(names).toHaveLength(3);
    let seen = 0;
    const offences: string[] = [];
    for (const name of names) {
      const references = moduleReferences(name, readFileSync(resolve(LIB_DIR, name), "utf8"));
      seen += references.length;
      for (const reference of references) {
        if (!isAllowed(reference.specifier)) {
          offences.push(`${name}: ${reference.form} of ${reference.specifier ?? "<not a plain string>"}`);
        }
      }
    }
    // The three files do import each other, zod and the sanitiser; seeing none would mean the scan is blind.
    expect(seen).toBeGreaterThanOrEqual(4);
    expect(offences).toEqual([]);
  });
});
