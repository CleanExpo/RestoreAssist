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

/** Collapse whitespace so line wrapping never changes a block. */
const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * TS/TSX copy blocks, read from the compiler's AST so prose punctuation can
 * never be mistaken for code.
 *
 * - A JSX block is an element with its own non-blank text. It is serialised
 *   with its nested markup (`<s>...</s>`, `<strong>...</strong>`) and any
 *   string expressions inlined, so wrapping approved words in a strikethrough,
 *   or adding "Attach them first." beside them, changes the block.
 * - Every string and no-substitution template literal is a block of its own.
 */
function tsxBlocks(src: string): string[] {
  const sf = ts.createSourceFile("copy.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const blocks: string[] = [];
  const serialise = (children: ts.NodeArray<ts.JsxChild>): string =>
    children
      .map((child) => {
        if (ts.isJsxText(child)) return child.text;
        if (ts.isJsxExpression(child)) {
          const e = child.expression;
          if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return e.text;
          return " {expr} ";
        }
        if (ts.isJsxElement(child)) {
          const tag = child.openingElement.tagName.getText(sf);
          return `<${tag}>${serialise(child.children)}</${tag}>`;
        }
        if (ts.isJsxSelfClosingElement(child)) return `<${child.tagName.getText(sf)} />`;
        if (ts.isJsxFragment(child)) return serialise(child.children);
        return " ";
      })
      .join("");
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const ownText = node.children.some((c) => ts.isJsxText(c) && c.text.trim() !== "");
      if (ownText) blocks.push(flat(serialise(node.children)));
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      blocks.push(flat(node.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return blocks;
}

/**
 * MDX blocks: the frontmatter plus intro, then one block per heading section,
 * so a new sentence anywhere in a section that mentions photos or status
 * changes that section.
 */
function mdxBlocks(src: string): string[] {
  return src.split(/\n(?=#{1,6} )/).map(flat);
}

/** The blocks that mention photos or an in-progress status. */
function prerequisiteBlocks(blocks: string[]): string[] {
  return [...new Set(blocks.filter((b) => KEY.test(b)))].sort();
}

// Each entry is a whole block: a JSX element's text with its nested markup,
// a string literal, or an MDX heading section. Review the block, not a
// sentence, before changing it.
const APPROVED: Record<string, string[]> = {
  "lib/reports/basic-report-inputs.ts": [
    "Basic reports need client name, address, postcode, and the technician field report. Photos and an in-progress inspection status are optional for Basic. Quick Fill can populate those fields.",
  ],
  "components/initial-data-entry/ReportTypeSelection.tsx": [
    "Complete all tiers including photo uploads, then generate report",
    "Generate an AI draft from saved data. Photos are optional for Basic.",
    "Photo uploads with categorization",
  ],
  "components/InspectionReportViewer.tsx": [
    "Generate produces an AI draft from the data already saved. Photos are optional for Basic. The draft is not a signed or issued report until you rewrite it and confirm ownership.",
  ],
  "components/InitialDataEntryForm.tsx": [
    "Complete each step to build your report. All fields marked with * are required. Quick Fill can populate a Basic draft — photos are optional for Basic.",
  ],
  "data/content/help/reports/first-ai-report.mdx": [
    "## Before you start **Basic** needs: - Client name, property address, and postcode - Technician field report Photos, moisture readings, and scope items improve Enhanced and Optimised drafts. They are **optional for Basic**. Quick Fill can populate the Basic fields so you can generate a draft without photos. Inspections do not use an `IN_PROGRESS` status. Generate is not locked behind photos or that status.",
    "## Generate the draft Open the inspection's detail page and click **Generate report**, or finish the form on `/dashboard/reports/new` and choose **Basic**. <Screenshot src=\"ra-help/reports/generate-report-button\" alt=\"The Generate report button on an inspection detail page\" caption=\"Generate report is available for Basic without photos attached.\" /> A premium task router (`lib/ai/model-router.ts`) picks the model based on claim complexity. Average turnaround is 10–30 seconds. Bring-your-own-key (BYOK) reduces token cost by 60–80% — set your key in **Settings → AI keys** if you want to use your own. Basic on the trial can still generate without a key.",
    "## What the draft contains The generated report follows the IICRC structure for your claim type. For water it includes: 1. **Property & loss overview** — address, date of loss, cause 2. **Category & class determination** — per `S500:2021 §10` and `§11` 3. **Affected materials inventory** — with photo references when photos exist 4. **Moisture mapping** — readings table + interpretation 5. **Scope of work** — line items mapped to drying / extraction / antimicrobial steps 6. **Standards cited** — `S500:2021` sections referenced inline",
    "--- title: \"Generate your first AI-drafted S500 report\" slug: \"first-ai-report\" category: \"reports\" order: 1 audience: [\"tradie\", \"admin\"] readTimeMin: 6 updatedAt: \"2026-09-14\" status: \"published\" heroImage: \"ra-help/reports/first-ai-report-hero\" relatedSlugs: [\"photo-cocoa\", \"first-inspection\"] aiSummary: \"Walks a user through generating an AI-drafted IICRC S500:2021 water-damage report — what Basic needs (name, address, postcode, field report; photos optional), how the draft differs from a signed or issued report, and how to rewrite then confirm ownership.\" userIntents: - \"how do I generate an AI report\" - \"first AI report\" - \"ai-drafted report\" - \"how does the AI report work\" - \"S500 report\" successCriteria: - \"AI draft generated for an inspection\" - \"Draft reviewed and at least one section edited\" - \"Ownership confirmed before the report is issued\" --- RestoreAssist drafts compliant S500 / S520 / S540 / S700 reports from the data you've captured. The model writes an **AI draft**. You review, rewrite, and confirm ownership before anything is signed or issued. > **A report usually starts from an inspection.** You can also start at `/dashboard/reports/new` and use **Quick Fill** or type the Basic fields. Create an [inspection](/help/getting-started/first-inspection) when you want photos, moisture readings, and scope items on the draft. Photos are optional for Basic. <VideoExplainer slug=\"help-reports\" />",
  ],
  "data/content/help/getting-started/first-inspection.mdx": [
    "## 3. Capture photos with chain-of-custody Photos are optional for a **Basic** AI draft. When you do capture them, tap the camera button at the bottom-right of the inspection screen. Every photo carries a SHA-256 hash, UTC timestamp, GPS coordinates, and your tagged user ID — see [Photo chain-of-custody](/help/inspections/photo-cocoa).",
    "## 5. Generate the AI report draft Tap **Generate report** when you are ready. Basic does not require photos or an `IN_PROGRESS` status. The draft takes 10-30 seconds. That draft is not a signed or issued report — review, rewrite, then confirm ownership.",
    "### How an inspection becomes a report The report is generated from the inspection you captured, or from the Basic fields on `/dashboard/reports/new`. Photos, moisture readings, and scope items improve the draft. They are optional for Basic. **Quick Fill** can populate those Basic fields without photos. There are two ways to reach the report: 1. **From the inspection (recommended for your first job)** — tap **Generate report** on the inspection detail page, as above. The new inspection is pre-linked, so every reading and photo flows straight in. 2. **From `/dashboard/reports/new`** — start a report and pick the inspection to pull from, or use Quick Fill for a Basic draft. Either way the bridge is the same: **inspection or Basic fields → AI draft → rewrite → confirm ownership**. See [Generate your first AI-drafted S500 report](/help/reports/first-ai-report) for what the draft contains and how to edit it.",
    "--- title: \"Your first inspection in 8 minutes\" slug: \"first-inspection\" category: \"getting-started\" order: 1 audience: [\"tradie\", \"admin\"] readTimeMin: 8 updatedAt: \"2026-09-14\" status: \"published\" heroImage: \"ra-help/getting-started/first-inspection-hero\" relatedSlugs: [\"photo-cocoa\"] aiSummary: \"Walks a tradie from '+ New inspection' through claim-type pick, optional photo capture with chain-of-custody, scope items, AI report draft, ownership confirm, invoice, and handover. Average 8 minutes for a standard water-damage Cat-1 inspection.\" userIntents: - \"how do I create an inspection\" - \"first inspection walkthrough\" - \"what's the new inspection flow\" - \"how to start a job\" successCriteria: - \"Inspection in COMPLETED or CLOSED status\" - \"Photos uploaded with chain-of-custody hashes when captured (optional for Basic)\" - \"Scope items added\" - \"AI draft generated and reviewed\" --- Your first inspection should take about 8 minutes from \"+ New inspection\" to an owned report draft and a closed job.",
  ],
};

describe("Basic prerequisite copy contract (RA-7550)", () => {
  it.each(Object.keys(APPROVED))(
    "%s mentions photos or in-progress status only in approved blocks",
    (rel) => {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      const blocks = rel.endsWith(".mdx") ? mdxBlocks(src) : tsxBlocks(src);
      expect(
        prerequisiteBlocks(blocks),
        `${rel}: a block that mentions photos or status changed. If it is true, update APPROVED after review.`,
      ).toEqual([...APPROVED[rel]].sort());
    },
  );

  it("a changed block is seen (controls)", () => {
    const tsxBlock = (s: string) => prerequisiteBlocks(tsxBlocks(s));
    const base = tsxBlock("<p>Generate an AI draft. Photos are optional for Basic.</p>");
    // Round 5: strike the approved sentence and add an imperative without the keyword.
    expect(
      tsxBlock("<p>Generate an AI draft. <s>Photos are optional for Basic.</s> Attach them first.</p>"),
    ).not.toEqual(base);
    // Strikethrough alone, no new words.
    expect(
      tsxBlock("<p>Generate an AI draft. <s>Photos are optional for Basic.</s></p>"),
    ).not.toEqual(base);
    // Round 4: semicolon prose.
    expect(tsxBlock("<p>Before generating Basic, attach photos; this is mandatory.</p>")).toEqual([
      "Before generating Basic, attach photos; this is mandatory.",
    ]);
    // A wrapped line is the same block.
    expect(tsxBlock("<p>Generate an AI draft.\n   Photos are optional for Basic.</p>")).toEqual(base);
    const mdx = "## Before you start\nPhotos are optional for Basic.\n\n## Next\nOther.";
    const mdxBase = prerequisiteBlocks(mdxBlocks(mdx));
    expect(
      prerequisiteBlocks(mdxBlocks(mdx.replace("Basic.", "Basic.\n\nAttach them before you generate."))),
    ).not.toEqual(mdxBase);
  });
});
