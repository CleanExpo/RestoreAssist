/**
 * RA-7550 — closed-world contract for what Basic needs before Generate.
 *
 * A deny-list of false phrasings can never be complete ("you must attach
 * photos" and "set the status to IN_PROGRESS first" both slipped past one).
 * So every sentence in these sources that mentions photos or an in-progress
 * status must be one a reviewer approved. A new or reworded sentence fails
 * here until someone reads it and adds it to APPROVED; a removed one fails
 * too, so the list never goes stale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const KEY = /photo|in[_ -]?progress/i;

/**
 * User-visible copy in a TS/TSX file, read from the compiler's AST so that
 * punctuation in prose (a semicolon, an `=`) can never be mistaken for code:
 * - each JSX element's children joined in order, with string-literal
 *   expressions inlined (`{" "}`) and any other expression as a space;
 * - every string and no-substitution template literal.
 */
function tsxCopyRuns(src: string): string[] {
  const sf = ts.createSourceFile("copy.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const runs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      runs.push(
        node.children
          .map((child) => {
            if (ts.isJsxText(child)) return child.text;
            if (ts.isJsxExpression(child) && child.expression &&
                (ts.isStringLiteral(child.expression) ||
                 ts.isNoSubstitutionTemplateLiteral(child.expression))) {
              return child.expression.text;
            }
            return " ";
          })
          .join(""),
      );
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      runs.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return runs;
}

/** MDX: every line is its own block (headings, list items, paragraphs). */
function mdxCopyRuns(src: string): string[] {
  return src.split("\n");
}

function sentencesMentioningPrerequisites(runs: string[]): string[] {
  const out = new Set<string>();
  for (const run of runs) {
    const flat = run.replace(/\s+/g, " ").trim();
    for (const s of flat.split(/(?<=[.!?])\s+/)) {
      if (KEY.test(s)) out.add(s.trim());
    }
  }
  return [...out].sort();
}

const APPROVED: Record<string, string[]> = {
  "lib/reports/basic-report-inputs.ts": [
    "Photos and an in-progress inspection status are optional for Basic.",
  ],
  "components/initial-data-entry/ReportTypeSelection.tsx": [
    "Complete all tiers including photo uploads, then generate report",
    "Photo uploads with categorization",
    "Photos are optional for Basic.",
  ],
  "components/InspectionReportViewer.tsx": [
    "Photos are optional for Basic.",
  ],
  "components/InitialDataEntryForm.tsx": [
    "Quick Fill can populate a Basic draft — photos are optional for Basic.",
  ],
  "data/content/help/reports/first-ai-report.mdx": [
    "**Affected materials inventory** — with photo references when photos exist",
    "Create an [inspection](/help/getting-started/first-inspection) when you want photos, moisture readings, and scope items on the draft.",
    "Generate is not locked behind photos or that status.",
    "Inspections do not use an `IN_PROGRESS` status.",
    "Photos are optional for Basic.",
    "Photos, moisture readings, and scope items improve Enhanced and Optimised drafts.",
    "Quick Fill can populate the Basic fields so you can generate a draft without photos.",
    "aiSummary: \"Walks a user through generating an AI-drafted IICRC S500:2021 water-damage report — what Basic needs (name, address, postcode, field report; photos optional), how the draft differs from a signed or issued report, and how to rewrite then confirm ownership.\"",
    "caption=\"Generate report is available for Basic without photos attached.\"",
    "relatedSlugs: [\"photo-cocoa\", \"first-inspection\"]",
  ],
  "data/content/help/getting-started/first-inspection.mdx": [
    "**Quick Fill** can populate those Basic fields without photos.",
    "- \"Photos uploaded with chain-of-custody hashes when captured (optional for Basic)\"",
    "Basic does not require photos or an `IN_PROGRESS` status.",
    "Capture photos with chain-of-custody",
    "Every photo carries a SHA-256 hash, UTC timestamp, GPS coordinates, and your tagged user ID — see [Photo chain-of-custody](/help/inspections/photo-cocoa).",
    "Photos are optional for a **Basic** AI draft.",
    "Photos, moisture readings, and scope items improve the draft.",
    "The new inspection is pre-linked, so every reading and photo flows straight in.",
    "aiSummary: \"Walks a tradie from '+ New inspection' through claim-type pick, optional photo capture with chain-of-custody, scope items, AI report draft, ownership confirm, invoice, and handover.",
    "relatedSlugs: [\"photo-cocoa\"]",
  ],
};

describe("Basic prerequisite copy contract (RA-7550)", () => {
  it.each(Object.keys(APPROVED))(
    "%s mentions photos or in-progress status only in approved sentences",
    (rel) => {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      const runs = rel.endsWith(".mdx") ? mdxCopyRuns(src) : tsxCopyRuns(src);
      expect(
        sentencesMentioningPrerequisites(runs),
        `${rel}: a photo or status sentence changed. If it is true, add it to APPROVED after review.`,
      ).toEqual([...APPROVED[rel]].sort());
    },
  );

  it("the extraction sees a new prerequisite sentence (control)", () => {
    const mdx = "Basic does not require photos.\nTo generate a Basic report, you must attach photos.\n";
    expect(sentencesMentioningPrerequisites(mdxCopyRuns(mdx))).toContain(
      "To generate a Basic report, you must attach photos.",
    );
    const tsx =
      "<p>\n  Photos are optional for Basic. Set the inspection status to\n  IN_PROGRESS before generating.\n</p>";
    expect(sentencesMentioningPrerequisites(tsxCopyRuns(tsx))).toContain(
      "Set the inspection status to IN_PROGRESS before generating.",
    );
    const interpolated = '<p>Photos are {" "}needed for {tier}.</p>';
    expect(
      sentencesMentioningPrerequisites(tsxCopyRuns(interpolated)),
    ).toContain("Photos are needed for .");
    const semicolon =
      "<p>Before generating Basic, attach photos; this is mandatory.</p>";
    expect(sentencesMentioningPrerequisites(tsxCopyRuns(semicolon))).toContain(
      "Before generating Basic, attach photos; this is mandatory.",
    );
  });
});
