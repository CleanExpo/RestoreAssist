/**
 * RA-7550 — contract for what a user is told Basic needs before Generate.
 *
 * Neither a deny-list of false phrasings nor a keyword filter can be
 * complete: "you must attach photos", "attach them first" and "attach at
 * least four pictures" each slipped past one. So there is no filter. Every
 * piece of copy in these surfaces is pinned, and any edit fails here until a
 * reviewer reads the new wording and updates APPROVED:
 *
 * - the Basic chooser (ReportTypeSelection), the Basic note and both help
 *   articles are pinned whole;
 * - in the two large forms, the region around the Basic sentence is pinned:
 *   the element that holds it, with every sibling and nested element, so a
 *   new sentence beside it changes the region.
 *
 * To regenerate after a reviewed change: PRINT_APPROVED=1 npx vitest run
 * --config config/vitest.config.js <this file>, then paste and review the diff.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

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
function serialiseChildren(sf: ts.SourceFile, children: ts.NodeArray<ts.JsxChild>): string {
  return children
    .map((child) => {
      if (ts.isJsxText(child)) return child.text;
      if (ts.isJsxExpression(child)) {
        const e = child.expression;
        if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return e.text;
        return " {expr} ";
      }
      if (ts.isJsxElement(child)) {
        const tag = child.openingElement.tagName.getText(sf);
        return `<${tag}>${serialiseChildren(sf, child.children)}</${tag}>`;
      }
      if (ts.isJsxSelfClosingElement(child)) return `<${child.tagName.getText(sf)} />`;
      if (ts.isJsxFragment(child)) return serialiseChildren(sf, child.children);
      return " ";
    })
    .join("");
}

function tsxBlocks(src: string): string[] {
  const sf = ts.createSourceFile("copy.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return blocksUnder(sf, sf);
}

/**
 * Every copy block under `root`, including JSX text and string literals
 * inside conditional and logical expressions (`{busy ? "..." : "..."}`,
 * `{x && <button>...</button>}`), with the same AST exclusions.
 */
function blocksUnder(sf: ts.SourceFile, root: ts.Node): string[] {
  const blocks: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const ownText = node.children.some((c) => ts.isJsxText(c) && c.text.trim() !== "");
      if (ownText) blocks.push(flat(serialiseChildren(sf, node.children)));
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isStyleOrModule(node)) {
      blocks.push(flat(node.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return blocks;
}

/**
 * Strings no user reads: import paths, the "use client" directive, and class
 * lists (a `className` attribute, or anything inside a cn()/clsx() call).
 * Decided from the AST position, never from what the string looks like.
 */
function isStyleOrModule(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return true;
    if (ts.isExpressionStatement(n) && n.expression === node) return true;
    if (ts.isJsxAttribute(n)) return n.name.getText() === "className";
    if (ts.isCallExpression(n) && /^(cn|clsx|cva|twMerge)$/.test(n.expression.getText())) return true;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return false;
  }
  return false;
}

/**
 * MDX blocks: the frontmatter plus intro, then one block per heading section,
 * so a new sentence anywhere in a section that mentions photos or status
 * changes that section.
 */
function mdxBlocks(src: string): string[] {
  return src.split(/\n(?=#{1,6} )/).map(flat);
}

/**
 * The region around `anchor` in a TSX file: the parent of the innermost JSX
 * element whose text contains it, serialised with every sibling and nested
 * element, plus every copy block inside it (conditional labels included). Throws when the anchor is gone, so a rewording cannot silently
 * drop the region out of the contract.
 */
function tsxRegion(src: string, anchor: string): string[] {
  const sf = ts.createSourceFile("copy.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let holder: ts.JsxElement | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && flat(serialiseChildren(sf, node.children)).includes(anchor)) {
      holder = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const parent = holder?.parent;
  if (!holder || !parent || !ts.isJsxElement(parent)) {
    throw new Error(`anchor not found in a JSX element: ${anchor}`);
  }
  // The serialised region catches added siblings; blocksUnder also reads the
  // copy inside its expressions, which the serialisation shows only as {expr}.
  return [flat(serialiseChildren(sf, parent.children)), ...blocksUnder(sf, parent)];
}

type Surface =
  | { kind: "whole" }
  | { kind: "region"; anchor: string };

const SURFACES: Record<string, Surface> = {
  "lib/reports/basic-report-inputs.ts": { kind: "whole" },
  "components/initial-data-entry/ReportTypeSelection.tsx": { kind: "whole" },
  "components/InspectionReportViewer.tsx": {
    kind: "region",
    anchor: "Generate produces an AI draft from the data already saved.",
  },
  "components/InitialDataEntryForm.tsx": {
    kind: "region",
    anchor: "Complete each step to build your report.",
  },
  "data/content/help/reports/first-ai-report.mdx": { kind: "whole" },
  "data/content/help/getting-started/first-inspection.mdx": { kind: "whole" },
};

function pinnedCopy(rel: string): string[] {
  const src = readFileSync(path.join(process.cwd(), rel), "utf8");
  const surface = SURFACES[rel];
  if (rel.endsWith(".mdx")) return mdxBlocks(src);
  if (surface.kind === "region") return tsxRegion(src, surface.anchor);
  return tsxBlocks(src);
}

// The reviewed copy for each surface: JSX text blocks with their nested
// markup, string literals, and MDX heading sections, in source order.
const APPROVED: Record<string, string[]> = {
  "lib/reports/basic-report-inputs.ts": [
    "Basic reports need client name, address, postcode, and the technician field report. Photos and an in-progress inspection status are optional for Basic. Quick Fill can populate those fields.",
  ],
  "components/initial-data-entry/ReportTypeSelection.tsx": [
    "basic",
    "enhanced",
    "optimised",
    "<FileText /> Select Report Type",
    "Choose the level of detail for your inspection report. Data has been saved successfully.",
    "<strong> Free Plan: </strong> You can generate Basic reports only. Upgrade to unlock Enhanced and Optimised reports.",
    "Free Plan:",
    "",
    "button",
    "basic",
    "Basic",
    "Quick Processing",
    "Generate an AI draft from saved data. Photos are optional for Basic.",
    "Areas affected",
    "Observations from technician",
    "Equipment deployed",
    "Reference to IICRC standards",
    "Any obvious hazards flagged",
    "button",
    "enhanced",
    "RECOMMENDED",
    "Enhanced",
    "Basic + Tier 1",
    "Upgrade required: Enhanced reports are available on paid plans.",
    "Answer Tier 1 critical questions, then generate report",
    "All Basic Report features",
    "Tier 1: Critical Questions (8 required)",
    "Property type & construction year",
    "Water source & category",
    "Occupancy & hazard assessment",
    "button",
    "optimised",
    "COMPREHENSIVE",
    "Optimised",
    "Enhanced + Tier 2 + Tier 3",
    "Upgrade required: Optimised reports are available on paid plans.",
    "Complete all tiers including photo uploads, then generate report",
    "All Enhanced features",
    "Tier 2: Enhancement Questions (7 optional)",
    "Tier 3: Optimisation Questions (5 optional)",
    "Photo uploads with categorization",
    "Most comprehensive report",
  ],
  "components/InspectionReportViewer.tsx": [
    "<div> <AlertCircle /> <h3> Report Not Generated </h3> </div> <div> <AiOwnershipPreGenerateNotice /> </div> <p> Generate produces an AI draft from the data already saved. Photos are optional for Basic. The draft is not a signed or issued report until you rewrite it and confirm ownership. </p> <div> {expr} {expr} {expr} {expr} </div>",
    "Report Not Generated",
    "Generate produces an AI draft from the data already saved. Photos are optional for Basic. The draft is not a signed or issued report until you rewrite it and confirm ownership.",
    "Basic",
    "basic",
    "Generating...",
    "Generate Basic Report",
    "Enhanced",
    "enhanced",
    "Generating...",
    "Generate Enhanced Report",
    "Optimised",
    "Optimized",
    "enhanced",
    "Generating...",
    "Generate Optimised Report",
    "<Loader2 /> Generating Excel...",
    "<Table /> Generate Excel Report",
  ],
  "components/InitialDataEntryForm.tsx": [
    "<h2> Initial Data Entry </h2> <p> Complete each step to build your report. All fields marked with * are required. Quick Fill can populate a Basic draft — photos are optional for Basic. </p>",
    "Initial Data Entry",
    "Complete each step to build your report. All fields marked with * are required. Quick Fill can populate a Basic draft — photos are optional for Basic.",
  ],
  "data/content/help/reports/first-ai-report.mdx": [
    "--- title: \"Generate your first AI-drafted S500 report\" slug: \"first-ai-report\" category: \"reports\" order: 1 audience: [\"tradie\", \"admin\"] readTimeMin: 6 updatedAt: \"2026-09-14\" status: \"published\" heroImage: \"ra-help/reports/first-ai-report-hero\" relatedSlugs: [\"photo-cocoa\", \"first-inspection\"] aiSummary: \"Walks a user through generating an AI-drafted IICRC S500:2021 water-damage report — what Basic needs (name, address, postcode, field report; photos optional), how the draft differs from a signed or issued report, and how to rewrite then confirm ownership.\" userIntents: - \"how do I generate an AI report\" - \"first AI report\" - \"ai-drafted report\" - \"how does the AI report work\" - \"S500 report\" successCriteria: - \"AI draft generated for an inspection\" - \"Draft reviewed and at least one section edited\" - \"Ownership confirmed before the report is issued\" --- RestoreAssist drafts compliant S500 / S520 / S540 / S700 reports from the data you've captured. The model writes an **AI draft**. You review, rewrite, and confirm ownership before anything is signed or issued. > **A report usually starts from an inspection.** You can also start at `/dashboard/reports/new` and use **Quick Fill** or type the Basic fields. Create an [inspection](/help/getting-started/first-inspection) when you want photos, moisture readings, and scope items on the draft. Photos are optional for Basic. <VideoExplainer slug=\"help-reports\" />",
    "## Before you start **Basic** needs: - Client name, property address, and postcode - Technician field report Photos, moisture readings, and scope items improve Enhanced and Optimised drafts. They are **optional for Basic**. Quick Fill can populate the Basic fields so you can generate a draft without photos. Inspections do not use an `IN_PROGRESS` status. Generate is not locked behind photos or that status.",
    "## AI draft vs signed or issued Generate produces an **AI draft**, not a signed or issued report. After generate: 1. Read the draft and rewrite it in your own words 2. Save the rewrite 3. Confirm ownership Until you confirm ownership, exports stay watermarked as an AI draft. RestoreAssist is not liable for issued wording — that sits with you.",
    "## Generate the draft Open the inspection's detail page and click **Generate report**, or finish the form on `/dashboard/reports/new` and choose **Basic**. <Screenshot src=\"ra-help/reports/generate-report-button\" alt=\"The Generate report button on an inspection detail page\" caption=\"Generate report is available for Basic without photos attached.\" /> A premium task router (`lib/ai/model-router.ts`) picks the model based on claim complexity. Average turnaround is 10–30 seconds. Bring-your-own-key (BYOK) reduces token cost by 60–80% — set your key in **Settings → AI keys** if you want to use your own. While your trial is in date and has report credits left, Basic can generate without your own key. After that, Basic needs your own Anthropic key, on a paid plan as well as on the trial.",
    "## What the draft contains The generated report follows the IICRC structure for your claim type. For water it includes: 1. **Property & loss overview** — address, date of loss, cause 2. **Category & class determination** — per `S500:2021 §10` and `§11` 3. **Affected materials inventory** — with photo references when photos exist 4. **Moisture mapping** — readings table + interpretation 5. **Scope of work** — line items mapped to drying / extraction / antimicrobial steps 6. **Standards cited** — `S500:2021` sections referenced inline",
    "## Review and edit The draft is a starting point, not a finished document. Read every section. Common edits: - Tighten loss-cause wording to match what the homeowner told you - Re-classify category if the model under- or over-called it - Add narrative on access constraints or hidden moisture <Screenshot src=\"ra-help/reports/draft-editor\" alt=\"The draft editor showing AI-generated report sections\" caption=\"Each section is editable inline; the standards citations stay locked unless you remove them deliberately.\" />",
    "## Save and confirm ownership Click **Save** after you rewrite. Then confirm ownership on the report. Until you do, PDF, Word, and ZIP keep the AI-draft watermark. Confirming ownership is how a draft becomes your issued report.",
  ],
  "data/content/help/getting-started/first-inspection.mdx": [
    "--- title: \"Your first inspection in 8 minutes\" slug: \"first-inspection\" category: \"getting-started\" order: 1 audience: [\"tradie\", \"admin\"] readTimeMin: 8 updatedAt: \"2026-09-14\" status: \"published\" heroImage: \"ra-help/getting-started/first-inspection-hero\" relatedSlugs: [\"photo-cocoa\"] aiSummary: \"Walks a tradie from '+ New inspection' through claim-type pick, optional photo capture with chain-of-custody, scope items, AI report draft, ownership confirm, invoice, and handover. Average 8 minutes for a standard water-damage Cat-1 inspection.\" userIntents: - \"how do I create an inspection\" - \"first inspection walkthrough\" - \"what's the new inspection flow\" - \"how to start a job\" successCriteria: - \"Inspection in COMPLETED or CLOSED status\" - \"Photos uploaded with chain-of-custody hashes when captured (optional for Basic)\" - \"Scope items added\" - \"AI draft generated and reviewed\" --- Your first inspection should take about 8 minutes from \"+ New inspection\" to an owned report draft and a closed job.",
    "## 1. Start a new inspection From `/dashboard/inspections`, click **+ New inspection**. <Screenshot src=\"ra-help/getting-started/new-inspection-button\" alt=\"The New inspection button on the inspections list page\" caption=\"Click + New inspection from /dashboard/inspections.\" />",
    "## 2. Pick the claim type The picker shows four options: WATER (S500:2021), MOULD (S520:2024), TRAUMA (S540:2023), FIRE (S700:2025). The standard you pick determines which fields RestoreAssist gates as required before sign-off.",
    "## 3. Capture photos with chain-of-custody Photos are optional for a **Basic** AI draft. When you do capture them, tap the camera button at the bottom-right of the inspection screen. Every photo carries a SHA-256 hash, UTC timestamp, GPS coordinates, and your tagged user ID — see [Photo chain-of-custody](/help/inspections/photo-cocoa).",
    "## 4. Add readings + scope items Add moisture readings, affected-area measurements, and scope line items. Each becomes input to the AI report.",
    "## 5. Generate the AI report draft Tap **Generate report** when you are ready. Basic does not require photos or an `IN_PROGRESS` status. The draft takes 10-30 seconds. That draft is not a signed or issued report — review, rewrite, then confirm ownership.",
    "### How an inspection becomes a report The report is generated from the inspection you captured, or from the Basic fields on `/dashboard/reports/new`. Photos, moisture readings, and scope items improve the draft. They are optional for Basic. **Quick Fill** can populate those Basic fields without photos. There are two ways to reach the report: 1. **From the inspection (recommended for your first job)** — tap **Generate report** on the inspection detail page, as above. The new inspection is pre-linked, so every reading and photo flows straight in. 2. **From `/dashboard/reports/new`** — start a report and pick the inspection to pull from, or use Quick Fill for a Basic draft. Either way the bridge is the same: **inspection or Basic fields → AI draft → rewrite → confirm ownership**. See [Generate your first AI-drafted S500 report](/help/reports/first-ai-report) for what the draft contains and how to edit it.",
    "## 6. Sign off → invoice → handover Click **Close inspection**, generate the invoice, and hand over to the client via the portal.",
    "## Done You should now have a `CLOSED` inspection with all evidence captured, AI report drafted, invoice issued, and client portal link sent. Average time: 8 minutes for a standard Cat-1 job.",
  ],
};

describe("Basic prerequisite copy contract (RA-7550)", () => {
  if (process.env.PRINT_APPROVED === "1") {
    const out: Record<string, string[]> = {};
    for (const rel of Object.keys(SURFACES)) out[rel] = pinnedCopy(rel);
    console.log(JSON.stringify(out, null, 2));
  }

  it.each(Object.keys(SURFACES))("%s copy matches the approved wording", (rel) => {
    expect(
      pinnedCopy(rel),
      `${rel}: copy changed. If the new wording is true, update APPROVED after review.`,
    ).toEqual(APPROVED[rel]);
  });

  it("an edit anywhere in a pinned surface is seen (controls)", () => {
    const card =
      "<div><h4>Basic</h4><p>Generate an AI draft. Photos are optional for Basic.</p><ul><li>Areas</li></ul></div>";
    const base = tsxBlocks(card);
    // Round 6: an ordinary sibling sentence with no photo keyword.
    expect(
      tsxBlocks(card.replace("</p>", "</p><p>Attach at least four pictures before generating a Basic report.</p>")),
    ).not.toEqual(base);
    // Round 5: strikethrough plus a keyword-free imperative.
    expect(
      tsxBlocks(card.replace("Photos are optional for Basic.", "<s>Photos are optional for Basic.</s> Attach them first.")),
    ).not.toEqual(base);
    // Round 4: semicolon prose.
    expect(tsxBlocks("<p>Before generating Basic, attach photos; this is mandatory.</p>")).toContain(
      "Before generating Basic, attach photos; this is mandatory.",
    );
    // Region: a sibling added next to the anchor changes the region.
    const region = (s: string) => tsxRegion(s, "Generate an AI draft.");
    expect(region(card.replace("</p>", "</p><p>Attach them first.</p>"))).not.toEqual(region(card));
    // A wrapped line is the same copy.
    expect(tsxBlocks(card.replace("AI draft. Photos", "AI draft.\n   Photos"))).toEqual(base);
    // MDX: a new keyword-free paragraph changes its section.
    const mdx = "## Before you start\nPhotos are optional for Basic.\n\n## Next\nOther.";
    expect(mdxBlocks(mdx.replace("Basic.", "Basic.\n\nAttach at least four pictures."))).not.toEqual(
      mdxBlocks(mdx),
    );
    expect(() => tsxRegion(card, "no such anchor")).toThrow(/anchor not found/);
    // Round 7: a label inside a conditional expression in the region.
    const cond = (label: string) =>
      `<div><p>Generate an AI draft.</p>{basic && <button>{busy ? "Generating..." : "${label}"}</button>}</div>`;
    const condRegion = (s: string) => tsxRegion(s, "Generate an AI draft.");
    expect(condRegion(cond("Attach at least four pictures first."))).not.toEqual(
      condRegion(cond("Generate Basic Report")),
    );
  });
});
