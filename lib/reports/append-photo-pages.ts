import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportPhoto } from "./inspection-photos-to-images";

// A4 portrait, 2 columns × 3 rows = 6 photos per page.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const HEADER_H = 28;
const COLS = 2;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const GUTTER = 16;
const CAPTION_H = 14;

const GRID_W = PAGE_W - 2 * MARGIN;
const GRID_TOP = PAGE_H - MARGIN - HEADER_H;
const GRID_H = GRID_TOP - MARGIN;
const CELL_W = (GRID_W - (COLS - 1) * GUTTER) / COLS;
const CELL_H = (GRID_H - (ROWS - 1) * GUTTER) / ROWS;
const IMG_H = CELL_H - CAPTION_H;

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.42, 0.46);
const WARN = rgb(0.62, 0.16, 0.1);

/** Truncate a caption to fit the cell width at the given font size. */
function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * Append captioned photo-grid pages to an already-generated report PDF
 * (RA-120 / PR3) — the inspection's evidence photos as a 2×3 grid per page,
 * each with its caption underneath. Mirrors {@link appendSketchPages}: reopen
 * the report bytes, draw, re-save.
 *
 * No photos → the original bytes are returned untouched. A single photo whose
 * bytes can't be decoded by pdf-lib is skipped (never fails the report).
 */
export async function appendPhotoPages(
  reportPdfBytes: Uint8Array,
  photos: ReportPhoto[],
  options: {
    propertyAddress?: string;
    reportNumber?: string;
    /** Photos the caller could not fetch; stated on the first photo page. */
    missingCount?: number;
  } = {},
): Promise<Uint8Array> {
  const missingBefore = Math.max(0, options.missingCount ?? 0);
  if (!photos.length && missingBefore === 0) return reportPdfBytes;

  const doc = await PDFDocument.load(reportPdfBytes);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const addGridPage = (): PDFPage => {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    p.drawText("Photographic Evidence", {
      x: MARGIN,
      y: PAGE_H - MARGIN - 4,
      size: 13,
      font: bold,
      color: INK,
    });
    if (options.reportNumber) {
      const label = `Report ${options.reportNumber}`;
      p.drawText(label, {
        x: PAGE_W - MARGIN - helv.widthOfTextAtSize(label, 9),
        y: PAGE_H - MARGIN - 2,
        size: 9,
        font: helv,
        color: MUTED,
      });
    }
    return p;
  };

  let page: PDFPage | null = null;
  let firstPage: PDFPage | null = null;
  let undecodable = 0;

  for (let i = 0; i < photos.length; i++) {
    const slot = i % PER_PAGE;
    if (slot === 0) {
      page = addGridPage();
      firstPage ??= page;
    }

    const photo = photos[i];
    let img: Awaited<ReturnType<PDFDocument["embedPng"]>>;
    try {
      img = photo.isPng
        ? await doc.embedPng(photo.bytes)
        : await doc.embedJpg(photo.bytes);
    } catch {
      // Un-decodable image — skip this cell rather than fail the report, and
      // count it so the page says so.
      undecodable++;
      continue;
    }

    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const cellX = MARGIN + col * (CELL_W + GUTTER);
    const cellTopY = GRID_TOP - row * (CELL_H + GUTTER);

    // Scale to fit the image area, centred horizontally.
    const scale = Math.min(CELL_W / img.width, IMG_H / img.height, 1);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const imgX = cellX + (CELL_W - drawW) / 2;
    const imgY = cellTopY - CAPTION_H - drawH;

    page!.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });

    const caption = fit(photo.caption, helv, 8, CELL_W);
    if (caption) {
      page!.drawText(caption, {
        x: cellX,
        y: cellTopY - CELL_H + 2,
        size: 8,
        font: helv,
        color: MUTED,
      });
    }
  }

  if (undecodable > 0) {
    console.error("[report-photos] photos could not be decoded", {
      reportNumber: options.reportNumber ?? null,
      undecodable,
    });
  }
  const notice = missingPhotosNotice(missingBefore + undecodable);
  if (notice) {
    (firstPage ?? addGridPage()).drawText(fit(notice, helv, 8, GRID_W), {
      x: MARGIN,
      y: PAGE_H - MARGIN - 18,
      size: 8,
      font: helv,
      color: WARN,
    });
  }

  return doc.save();
}

/** The sentence a report prints when photos could not be included. */
export function missingPhotosNotice(count: number): string | null {
  if (count <= 0) return null;
  return `${count} photo${count === 1 ? "" : "s"} could not be included in this PDF. The originals remain on the inspection record.`;
}
