/**
 * Issue #2406: a credential form submitted before React hydrates falls back to
 * the browser's native submit. Without `method="post"` that is a GET, which
 * puts `email=...&password=...` in the URL — browser history, server logs,
 * Referer headers. Every <form> in a file that renders a password input must
 * declare method="post" so the pre-hydration fallback can never leak.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.includes("__tests__"))
      out.push(full);
  }
  return out;
}

function attr(
  el: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute =>
      ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function stringValue(a: ts.JsxAttribute | undefined): string | undefined {
  const init = a?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression &&
    ts.isStringLiteral(init.expression)
  ) {
    return init.expression.text;
  }
  return undefined;
}

/** True when the file renders an <input> whose type can be "password". */
function rendersPasswordInput(src: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText() === "input"
    ) {
      const type = attr(n, "type");
      if (type && type.getText().includes("password")) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return found;
}

function formsMissingPost(src: ts.SourceFile): number[] {
  const lines: number[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText() === "form"
    ) {
      if (stringValue(attr(n, "method"))?.toLowerCase() !== "post") {
        lines.push(src.getLineAndCharacterOfPosition(n.getStart()).line + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return lines;
}

function parse(file: string, text = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

describe("credential forms never submit via GET (#2406)", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => ({ f, src: parse(f) }))
    .filter(({ src }) => rendersPasswordInput(src));

  it("finds the known credential forms (the scan is not vacuous)", () => {
    const rel = files.map(({ f }) => relative(ROOT, f));
    expect(rel).toEqual(
      expect.arrayContaining([
        "app/login/page.tsx",
        "app/signup/page.tsx",
        "app/portal/login/page.tsx",
      ]),
    );
  });

  it("detects a form without method=post (positive control)", () => {
    const planted = parse(
      "planted.tsx",
      `export const X = () => <form onSubmit={f}><input type="password" /></form>;`,
    );
    expect(rendersPasswordInput(planted)).toBe(true);
    expect(formsMissingPost(planted)).toEqual([1]);
  });

  it('every <form> in a password-bearing file declares method="post"', () => {
    const offenders = files.flatMap(({ f, src }) =>
      formsMissingPost(src).map((line) => `${relative(ROOT, f)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
