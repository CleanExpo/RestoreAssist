import { PDFDocument } from "pdf-lib";
import { embedSketchesInPdf, type SketchFloor } from "@/lib/generate-sketch-pdf";

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
