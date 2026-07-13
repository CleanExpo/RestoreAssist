/**
 * Draw diagonal AI-draft watermark text on a pdf-lib page.
 */

import type { PDFPage, PDFFont } from "pdf-lib";
import { rgb, degrees } from "pdf-lib";
import { AI_OWNERSHIP_WATERMARK } from "@/lib/reports/ai-ownership";

export function drawAiOwnershipWatermark(
  page: PDFPage,
  font: PDFFont,
  text: string = AI_OWNERSHIP_WATERMARK,
): void {
  const { width, height } = page.getSize();
  const size = 14;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: Math.max(40, (width - textWidth) / 2 - 40),
    y: height / 2,
    size,
    font,
    color: rgb(0.75, 0.75, 0.75),
    rotate: degrees(35),
    opacity: 0.45,
  });
}
