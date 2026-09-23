/**
 * RA-7581 — a paid property lookup that never ran must not look like one that did.
 *
 * The inspection form advertised "Lookup Property Data ($2.30)" from a stub
 * whose click handler made no network call and invoked onSuccess with
 * `{ data: null }`. The form then stamped `propertyDataFetchedAt` with the
 * current time, so the job recorded a paid lookup that never happened.
 *
 * A test that only asserts the button renders would pass on that broken tree
 * and prove nothing. This control fails while the inspection form still
 * renders that button without a working provider, and fails if any code path
 * stamps `propertyDataFetchedAt` when the lookup payload is null.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const ROOT = process.cwd();
const FORM = join(ROOT, "components", "InitialDataEntryForm.tsx");
const LOOKUP_BUTTON = join(ROOT, "components", "property-lookup-button.tsx");
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP_DIRS = new Set([
  "__tests__",
  "node_modules",
  ".next",
  ".git",
  "dist",
]);

function walkTs(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTs(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function parseTsx(fileName: string, src: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function inspectFormLookup(src: string): {
  rendersLookupButton: boolean;
  pricedLookupLabel: boolean;
} {
  const sf = parseTsx("InitialDataEntryForm.tsx", src);
  let rendersLookupButton = false;
  let pricedLookupLabel = false;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText(sf) === "PropertyLookupButton") {
        rendersLookupButton = true;
      }
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (/Lookup Property Data/.test(node.text)) {
        rendersLookupButton = true;
      }
      if (/Lookup Property Data \(\$2\.30\)/.test(node.text)) {
        pricedLookupLabel = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { rendersLookupButton, pricedLookupLabel };
}

function hasWorkingProvider(src: string): boolean {
  const sf = parseTsx("property-lookup-button.tsx", src);
  let callsFetch = false;
  let stubNullSuccess = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "fetch") callsFetch = true;
      if (node.expression.text === "onSuccess") {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === "data" &&
              prop.initializer.kind === ts.SyntaxKind.NullKeyword
            ) {
              stubNullSuccess = true;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return callsFetch && !stubNullSuccess;
}

function isLookupDataGuard(cond: ts.Expression, sf: ts.SourceFile): boolean {
  const text = cond.getText(sf);
  if (/\|\|\s*null/.test(text)) return false;
  return /\b(?:data|payload|result)(?:\.data|\?\.data)\b/.test(text);
}

function nodeIsInside(container: ts.Node, target: ts.Node): boolean {
  let cur: ts.Node | undefined = target;
  while (cur) {
    if (cur === container) return true;
    cur = cur.parent;
  }
  return false;
}

function guardedByLookupData(call: ts.Node, sf: ts.SourceFile): boolean {
  let cur: ts.Node | undefined = call.parent;
  while (cur) {
    if (ts.isIfStatement(cur) && isLookupDataGuard(cur.expression, sf)) {
      return nodeIsInside(cur.thenStatement, call);
    }
    if (
      ts.isBinaryExpression(cur) &&
      cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isLookupDataGuard(cur.left, sf)
    ) {
      return nodeIsInside(cur.right, call);
    }
    cur = cur.parent;
  }
  return false;
}

function isTimestampExpression(expr: ts.Expression, sf: ts.SourceFile): boolean {
  return /new Date\s*\(|Date\.now\s*\(|toISOString\s*\(/.test(
    expr.getText(sf),
  );
}

/**
 * A stamp is writing "this lookup happened now" — a current timestamp —
 * into propertyDataFetchedAt. Setting the field to null, or to a value
 * that arrived with real lookup data, is not a stamp.
 */
function nullLookupFetchedAtStamps(file: string, src: string): string[] {
  const sf = parseTsx(file, src);
  const hits: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "setPropertyDataFetchedAt") {
        const arg = node.arguments[0];
        if (
          arg &&
          isTimestampExpression(arg, sf) &&
          !guardedByLookupData(node, sf)
        ) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          hits.push(
            `${file}:${line + 1}: setPropertyDataFetchedAt stamps a timestamp without a truthy lookup-data guard`,
          );
        }
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) &&
        node.name.text === "propertyDataFetchedAt") ||
        (ts.isStringLiteral(node.name) &&
          node.name.text === "propertyDataFetchedAt")) &&
      isTimestampExpression(node.initializer, sf) &&
      !guardedByLookupData(node, sf)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push(
        `${file}:${line + 1}: propertyDataFetchedAt is assigned a timestamp without a truthy lookup-data guard`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("RA-7581 property lookup does not record a lookup that never ran", () => {
  it("does not render a Property Lookup button on the inspection form without a working provider", () => {
    const form = readFileSync(FORM, "utf8");
    const { rendersLookupButton, pricedLookupLabel } = inspectFormLookup(form);

    if (!rendersLookupButton && !pricedLookupLabel) return;

    const providerSrc = existsSync(LOOKUP_BUTTON)
      ? readFileSync(LOOKUP_BUTTON, "utf8")
      : "";
    expect(
      hasWorkingProvider(providerSrc),
      "inspection form still renders Lookup Property Data without a provider that actually fetches",
    ).toBe(true);
  });

  it("does not stamp propertyDataFetchedAt when the lookup data is null", () => {
    const hits = SCAN_DIRS.flatMap((dir) =>
      walkTs(join(ROOT, dir)).flatMap((file) =>
        nullLookupFetchedAtStamps(
          file.slice(ROOT.length + 1),
          readFileSync(file, "utf8"),
        ),
      ),
    );
    expect(hits).toEqual([]);
  });
});
