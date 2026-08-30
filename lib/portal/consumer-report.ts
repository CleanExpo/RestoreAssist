import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ConsumerReportPdfInput = {
  title: string;
  inspectionNumber?: string | null;
  propertyAddress: string;
  status: string;
  date: Date;
  affectedAreaCount?: number;
  scopeItemCount?: number;
  contractorName?: string | null;
};

export async function generateConsumerReportPdf(
  input: ConsumerReportPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = 790;

  const newPage = () => {
    page = pdf.addPage(pageSize);
    y = 790;
  };
  const write = (text: string, options: { heading?: boolean; size?: number } = {}) => {
    const size = options.size ?? (options.heading ? 14 : 10);
    const font = options.heading ? bold : regular;
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 495 && line) {
        if (y < 55) newPage();
        page.drawText(line, { x: 50, y, size, font, color: rgb(0.12, 0.16, 0.22) });
        y -= size + 5;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      if (y < 55) newPage();
      page.drawText(line, { x: 50, y, size, font, color: rgb(0.12, 0.16, 0.22) });
      y -= size + 7;
    }
  };
  const section = (title: string, lines: Array<string | null | undefined>) => {
    const values = lines.filter((line): line is string => Boolean(line?.trim()));
    if (values.length === 0) return;
    y -= 8;
    write(title, { heading: true, size: 12 });
    for (const value of values) write(value);
  };

  page.drawRectangle({ x: 0, y: 812, width: pageSize[0], height: 30, color: rgb(0.04, 0.11, 0.2) });
  page.drawText("RestoreAssist | Client report", { x: 50, y: 822, size: 11, font: bold, color: rgb(1, 1, 1) });
  write(input.title, { heading: true, size: 18 });
  write(input.propertyAddress);
  write(`Status: ${input.status.replaceAll("_", " ")}`);
  write(`Report date: ${input.date.toLocaleDateString("en-AU")}`);
  if (input.inspectionNumber) write(`Reference: ${input.inspectionNumber}`);

  section("What this means for you", [
    "Your restoration provider has recorded the affected areas and proposed work for this property.",
  ]);
  section("Claim overview", [
    `${input.affectedAreaCount ?? 0} affected area(s) recorded.`,
    `${input.scopeItemCount ?? 0} restoration work item(s) included.`,
  ]);
  section("Questions", [
    `Ask ${input.contractorName ?? "your restoration provider"} for the separate technical evidence report if your insurer or assessor needs classifications, environmental measurements or detailed readings.`,
  ]);

  return pdf.save();
}
