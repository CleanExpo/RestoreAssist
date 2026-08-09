import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  embedSketchesInPdf,
  safe,
  type SketchFloor,
} from "@/lib/generate-sketch-pdf";
import type {
  ReportFloorPlanOutput,
  ReportFloorPlanStatus,
} from "@/lib/reports/claim-sketch-floors";

const EMBED_FAILURE_REASON =
  "The stored floor-plan image could not be embedded at report generation time.";

/**
 * Append one landscape floor-plan page per sketch to an already-generated
 * report PDF (RA-120 / PR2). The IICRC report bytes come out of
 * `generateIICRCReportPDF`; this re-opens them, embeds the per-floor sketch
 * pages, and re-saves — keeping the floor plan inside the canonical report
 * rather than a separate download.
 *
 * No floors → the original bytes are returned untouched (no re-encode cost).
 */
export async function appendSketchPages(
  reportPdfBytes: Uint8Array,
  floors: SketchFloor[],
  options: { propertyAddress?: string; reportNumber?: string } = {},
): Promise<Uint8Array> {
  if (!floors.length) return reportPdfBytes;

  const doc = await PDFDocument.load(reportPdfBytes);
  await embedSketchesInPdf(doc, floors, options);
  return doc.save();
}

export function floorPlanDisclosureLines(
  statuses: ReportFloorPlanStatus[],
): string[] {
  return statuses
    .filter(({ status }) => status === "unavailable")
    .flatMap(({ label, reason }) => [
      `${label}: unavailable`,
      reason ??
        "The floor-plan image was unavailable at report generation time.",
    ]);
}

function fitText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
): string {
  const cleaned = safe(text);
  if (font.widthOfTextAtSize(cleaned, size) <= maxWidth) return cleaned;

  let end = cleaned.length;
  while (
    end > 1 &&
    font.widthOfTextAtSize(`${cleaned.slice(0, end)}...`, size) > maxWidth
  ) {
    end--;
  }
  return `${cleaned.slice(0, end)}...`;
}

async function appendFloorPlanDisclosurePages(
  reportPdfBytes: Uint8Array,
  statuses: ReportFloorPlanStatus[],
  options: { propertyAddress?: string; reportNumber?: string },
): Promise<Uint8Array> {
  const unavailable = statuses.filter(({ status }) => status === "unavailable");
  if (!unavailable.length) return reportPdfBytes;

  const doc = await PDFDocument.load(reportPdfBytes);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const startPage = () => {
    page.drawText("Floor Plan Availability", {
      x: margin,
      y,
      size: 16,
      font: bold,
      color: rgb(0.11, 0.18, 0.28),
    });
    y -= 22;
    page.drawText(
      "The following floor plans could not be included in this PDF.",
      {
        x: margin,
        y,
        size: 10,
        font: regular,
        color: rgb(0.35, 0.35, 0.35),
      },
    );
    y -= 18;
    if (options.propertyAddress) {
      page.drawText(fitText(options.propertyAddress, regular, 9, maxWidth), {
        x: margin,
        y,
        size: 9,
        font: regular,
      });
      y -= 14;
    }
    if (options.reportNumber) {
      page.drawText(
        fitText(`Report: ${options.reportNumber}`, regular, 9, maxWidth),
        { x: margin, y, size: 9, font: regular },
      );
      y -= 22;
    }
  };

  startPage();
  for (const status of unavailable) {
    const [statusLine, reasonLine] = floorPlanDisclosureLines([status]);
    if (y < margin + 50) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      startPage();
    }
    page.drawText(fitText(statusLine, bold, 11, maxWidth), {
      x: margin,
      y,
      size: 11,
      font: bold,
      color: rgb(0.55, 0.18, 0.12),
    });
    y -= 15;
    page.drawText(fitText(reasonLine, regular, 9, maxWidth), {
      x: margin,
      y,
      size: 9,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 24;
  }

  return doc.save();
}

/**
 * Append floor pages independently so one malformed render cannot remove valid
 * floors. Any missing, unreadable, or unembeddable floor is then named on a
 * disclosure page in the same canonical PDF.
 */
export async function appendFloorPlanPagesWithDisclosure(
  reportPdfBytes: Uint8Array,
  floorPlans: ReportFloorPlanOutput[],
  options: { propertyAddress?: string; reportNumber?: string } = {},
): Promise<{
  pdfBytes: Uint8Array;
  floorPlans: ReportFloorPlanOutput[];
}> {
  let pdfBytes = reportPdfBytes;
  const resolved = floorPlans.map((output) => ({
    ...output,
    status: { ...output.status },
  }));

  for (const output of resolved) {
    if (!output.floor) continue;
    try {
      pdfBytes = await appendSketchPages(pdfBytes, [output.floor], options);
    } catch {
      output.floor = null;
      output.status = {
        ...output.status,
        status: "unavailable",
        reason: EMBED_FAILURE_REASON,
      };
    }
  }

  pdfBytes = await appendFloorPlanDisclosurePages(
    pdfBytes,
    resolved.map(({ status }) => status),
    options,
  );
  return { pdfBytes, floorPlans: resolved };
}
