/**
 * Build a Word (.docx) buffer from report export-package text sections.
 */

import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
} from "docx";
import { AI_OWNERSHIP_WATERMARK } from "@/lib/reports/ai-ownership";

export interface ReportDocxInput {
  claimReference: string;
  inspectionReport?: string;
  scopeOfWorks?: string;
  costEstimation?: string;
  showAiDraftDisclaimer?: boolean;
}

function textToParagraphs(text: string): Paragraph[] {
  const lines = text.split(/\r?\n/);
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", size: 22 })],
        spacing: { after: 120 },
      }),
  );
}

function section(title: string, body: string): Paragraph[] {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 200 },
    }),
    ...textToParagraphs(body),
  ];
}

export async function buildReportDocx(input: ReportDocxInput): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: "RestoreAssist Document Package",
          bold: true,
          size: 32,
        }),
      ],
      spacing: { after: 200 },
    }),
  ];

  if (input.showAiDraftDisclaimer) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: AI_OWNERSHIP_WATERMARK,
            bold: true,
            size: 20,
            color: "B91C1C",
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "AI drafted this package as an assistant only. The application holder must rewrite and take ownership before issuing.",
            italics: true,
            size: 18,
          }),
        ],
        spacing: { after: 300 },
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Claim / report reference: ${input.claimReference}`,
          size: 22,
        }),
      ],
      spacing: { after: 400 },
    }),
  );

  if (input.inspectionReport?.trim()) {
    children.push(...section("Professional Inspection Report", input.inspectionReport));
  }
  if (input.scopeOfWorks?.trim()) {
    children.push(...section("Scope of Works", input.scopeOfWorks));
  }
  if (input.costEstimation?.trim()) {
    children.push(...section("Cost Estimation", input.costEstimation));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
