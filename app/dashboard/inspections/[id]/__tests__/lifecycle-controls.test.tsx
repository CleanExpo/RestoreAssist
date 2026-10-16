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

/**
 * Every node of the parsed page that carries `needle`: JSX text, string and
 * template literal text, or an identifier reference. Read from the TSX syntax
 * tree, not the raw source, so a comment can neither hide an occurrence nor
 * stand in for a bracket (Codex 570cd23f3: brackets inside JSX comments let an
 * ungated link pass as part of the gated block).
 */
function occurrences(needle: string): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxText(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      node.text.includes(needle)
    ) {
      found.push(node);
    } else if (
      ts.isIdentifier(node) &&
      node.text === needle &&
      !ts.isFunctionDeclaration(node.parent)
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
