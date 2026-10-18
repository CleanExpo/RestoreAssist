import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const source = readFileSync(
  join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
  "utf8",
);
const file = ts.createSourceFile(
  "page.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

// Stands in for a value only known at runtime, so text on either side of it
// never joins into a needle by accident.
const RUNTIME = "\u0000";

/**
 * The constant text a node renders or evaluates to, with whitespace removed:
 * string and template literals, `+` concatenations, JSX text and the children
 * of a JSX element joined in order. Runtime values become a placeholder.
 * Folding is what stops an action being spelt in pieces (Codex 6a50fd93f:
 * `{"Generate" + " Invoice"}` and `"/in" + "voice"` matched no single node).
 */
const folded = new Map<ts.Node, string>();
function fold(node: ts.Node): string {
  let text = folded.get(node);
  if (text === undefined) folded.set(node, (text = foldUncached(node)));
  return text;
}

function foldUncached(node: ts.Node): string {
  const squash = (text: string) => text.replace(/\s+/g, "");
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
    return squash(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    return squash(node.head.text) +
      node.templateSpans.map((span) => fold(span.expression) + squash(span.literal.text)).join("");
  }
  if (ts.isParenthesizedExpression(node)) return fold(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return fold(node.left) + fold(node.right);
  }
  if (ts.isJsxExpression(node)) return node.expression ? fold(node.expression) : "";
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.map(fold).join("");
  return RUNTIME;
}

/** The nodes whose fold() may contain a needle: the operands fold() reads. */
function foldedParts(node: ts.Node): ts.Node[] {
  if (ts.isTemplateExpression(node)) return node.templateSpans.map((span) => span.expression);
  if (ts.isParenthesizedExpression(node)) return [node.expression];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [node.left, node.right];
  }
  if (ts.isJsxExpression(node)) return node.expression ? [node.expression] : [];
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return [...node.children];
  return [];
}

/**
 * Every place in the parsed page that carries `needle`: the smallest node
 * whose folded text contains it, an identifier reference, or (for `<Tag>`) a
 * JSX element of that tag. Read from the TSX syntax tree, not the raw source,
 * so comments can neither hide an occurrence nor stand in for a bracket
 * (Codex 570cd23f3). Text computed only at runtime (a `.join()`, a lookup) is
 * beyond a source check; this covers literal and constant-folded forms.
 */
function occurrences(needle: string): ts.Node[] {
  const found: ts.Node[] = [];
  const tag = /^<(\w+)>$/.exec(needle)?.[1];
  const target = needle.replace(/\s+/g, "");
  const visit = (node: ts.Node) => {
    if (tag) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText() === tag
      ) {
        found.push(node);
      }
    } else if (ts.isIdentifier(node)) {
      if (node.text === needle && !ts.isFunctionDeclaration(node.parent)) found.push(node);
    } else if (
      fold(node).includes(target) &&
      !foldedParts(node).some((part) => fold(part).includes(target))
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** True when `node` sits on the right of a `gate && ...` whose left is exactly `gate`. */
function isGatedBy(node: ts.Node, gate: string): boolean {
  for (
    let child: ts.Node = node, parent = node.parent;
    parent;
    child = parent, parent = parent.parent
  ) {
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.right === child &&
      ts.isIdentifier(parent.left) &&
      parent.left.text === gate
    ) {
      return true;
    }
  }
  return false;
}

/** The action is present, and every occurrence of it renders only under `gate`. */
function expectOnlyUnderGate(gate: string, needles: string[]) {
  for (const needle of needles) {
    const nodes = occurrences(needle);
    expect(nodes.length, `${needle} is missing`).toBeGreaterThan(0);
    for (const node of nodes) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      expect(
        isGatedBy(node, gate),
        `${needle} at page.tsx:${line + 1} is not under ${gate}`,
      ).toBe(true);
    }
  }
}

describe("inspection lifecycle controls", () => {
  it("keeps sign-off visible from completed work through signed submission", () => {
    expect(source).toMatch(
      /const canSignOff =\s*\["ESTIMATED", "COMPLETED", "SUBMITTED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    // What matters is that `canSignOff` gates <InspectionSignOff>, not how the
    // block is wrapped. The wrapper <div> moved OUTSIDE this conditional in
    // 04951e56d so the field evidence checklist renders unconditionally, which
    // broke the previous nesting-specific pattern without changing the
    // behaviour under test.
    //
    // The optional group is a single opening tag, NOT `[\s\S]*?`. An unbounded
    // gap — which the previous pattern also had — lets the match start at any
    // other `{canSignOff && (` in the file and run forward to an
    // <InspectionSignOff> that is no longer gated at all, so the assertion
    // would pass while the behaviour it names was gone.
    expect(source).toMatch(
      /\{canSignOff && \(\s*(?:<div[^>]*>\s*)?<InspectionSignOff/,
    );
    // ...and no other copy renders outside it (Codex 6a50fd93f: a second,
    // ungated <InspectionSignOff> passed while one gated copy existed).
    expectOnlyUnderGate("canSignOff", ["<InspectionSignOff>"]);
  });

  it("only exposes invoice generation after sign-off or while already billing", () => {
    expect(source).toMatch(
      /const canGenerateInvoice =\s*\(inspection\.status === "SUBMITTED" && Boolean\(inspection\.signedAt\)\) \|\|\s*inspection\.status === "IN_BILLING"/,
    );
    // The invoice action renders only under canGenerateInvoice: no ungated
    // copy beside a gated one.
    expectOnlyUnderGate("canGenerateInvoice", ["Generate Invoice", "/invoice"]);
  });

  it("exposes report generation for review-ready work without reopening billing", () => {
    expect(source).toMatch(
      /const canGenerateReport =\s*\["ESTIMATED", "SUBMITTED", "COMPLETED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    expectOnlyUnderGate("canGenerateReport", [
      "handleGenerateReport",
      "Generate NIR Report",
    ]);
  });
});
