/**
 * Issue #2406: a form submitted before React hydrates falls back to the
 * browser's native submit. Without `method="post"` that is a GET, which puts
 * every named field — email, password, contact details — in the URL, browser
 * history, server logs and Referer headers.
 *
 * Detecting "forms that hold a password" is not enough: a password field can
 * be a design-system <Input> or live in a child component in another file
 * (independent review of 92c1fdae). So the rule is unconditional: every
 * <form> under app/ and components/ declares method="post".
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

function methodValue(el: ts.JsxOpeningLikeElement): string | undefined {
  const a = el.attributes.properties.find(
    (p): p is ts.JsxAttribute =>
      ts.isJsxAttribute(p) && p.name.getText() === "method",
  );
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

function parse(file: string, text = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Line numbers of every <form> whose method is not a literal "post". */
function formsMissingPost(src: ts.SourceFile): number[] {
  const lines: number[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText() === "form" &&
      methodValue(n)?.toLowerCase() !== "post"
    ) {
      lines.push(src.getLineAndCharacterOfPosition(n.getStart()).line + 1);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return lines;
}

describe("forms never submit via native GET (#2406)", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
    f,
    src: parse(f),
  }));

  it("scans the known credential forms (the scan is not vacuous)", () => {
    const withForms = files
      .filter(({ src }) => src.text.includes("<form"))
      .map(({ f }) => relative(ROOT, f));
    expect(withForms).toEqual(
      expect.arrayContaining([
        "app/login/page.tsx",
        "app/signup/page.tsx",
        "app/portal/login/page.tsx",
        "app/dashboard/security/page.tsx",
      ]),
    );
  });

  it.each([
    ["no method", `<form onSubmit={f}><input type="password" /></form>`],
    ["design-system input", `<form onSubmit={f}><Input type="password" /></form>`],
    ["password in child component", `<form onSubmit={f}><PasswordStep /></form>`],
    ["expression GET", `<form method={"GET"} onSubmit={f}><X /></form>`],
    ["dynamic method", `<form method={m} onSubmit={f}><X /></form>`],
  ])("flags a planted form: %s", (_label, jsx) => {
    const planted = parse("planted.tsx", `export const X = () => ${jsx};`);
    expect(formsMissingPost(planted)).toEqual([1]);
  });

  it("accepts method=\"post\" and method={\"POST\"}", () => {
    const ok = parse(
      "ok.tsx",
      `export const X = () => <><form method="post" /><form method={"POST"} /></>;`,
    );
    expect(formsMissingPost(ok)).toEqual([]);
  });

  it('every <form> under app/ and components/ declares method="post"', () => {
    const offenders = files.flatMap(({ f, src }) =>
      formsMissingPost(src).map((line) => `${relative(ROOT, f)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
