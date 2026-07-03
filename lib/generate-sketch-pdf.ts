/**
 * generate-sketch-pdf.ts — RA2-050 / RA2-051 (RA-120, RA-121)
 *
 * Generates a standalone A4-landscape floor plan PDF from canvas PNG exports.
 * Each floor occupies one page with a header, sketch image, and room legend.
 *
 * Also exports embedSketchesInPdf() for adding sketches to an existing
 * pdf-lib PDFDocument (RA-120 integration into report PDF).
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  buildComplianceAnnex,
  type ScopeMaterialInfo,
  type MoisturePinInput,
} from "@/lib/sketch/pdf-scope";
import type { DamageCause } from "@/lib/nz/nhcover";
import { extractRooms, PX_PER_METRE } from "@/lib/sketch/extract-rooms";
import { recommendedEquipment } from "@/lib/sketch/iicrc-utils";

// ── Constants ─────────────────────────────────────────────

/** A4 landscape (842 × 595 pt) */
const PAGE_W = 842;
const PAGE_H = 595;

const MARGIN = 36;
const HEADER_H = 56;
const FOOTER_H = 28;
const CONTENT_Y_TOP = PAGE_H - MARGIN - HEADER_H;
const CONTENT_H = PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_H;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BRAND_DARK = rgb(0.11, 0.18, 0.28); // #1C2E47
const BRAND_CYAN = rgb(0.0, 0.73, 0.83); // #00BAD4 approx
const TEXT_MAIN = rgb(0.1, 0.1, 0.1);
const TEXT_MUTED = rgb(0.45, 0.45, 0.45);
const DIVIDER = rgb(0.87, 0.87, 0.87);

// The StandardFont (Helvetica) can only encode WinAnsi/CP-1252. User-supplied
// text (room labels, address, notes) could carry emoji, arrows or other glyphs
// that make pdf-lib throw at drawText — which would 500 the whole export. `safe()`
// keeps WinAnsi-encodable code points, maps arrows to "->", and drops the rest so
// PDF generation can never crash on user input.
const WINANSI_PUNCT = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
// Exported for unit testing (RA-6687). Pure helper — no side effects.
export function safe(text: string): string {
  return Array.from(text ?? "")
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp >= 0x20 && cp <= 0x7e) return ch; // printable ASCII
      if (cp >= 0xa0 && cp <= 0xff) return ch; // Latin-1 supplement
      if (WINANSI_PUNCT.has(cp)) return ch; // CP-1252 punctuation
      if (cp >= 0x2190 && cp <= 0x21ff) return "->"; // arrows
      return ""; // emoji / other scripts / symbols
    })
    .join("");
}

// Room extraction is the shared util (lib/sketch/extract-rooms) so the PDF and
// the structured scope export never drift.

// ── Data URL → Uint8Array ─────────────────────────────────

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Floor sub-header line ─────────────────────────────────
// RA-6846 [A7] / RA-6843 [A4]: the floor sub-header carries the total measured
// area and the calibrated drawing scale. `totalAreaM2` is measured-geometry
// only (the caller passes extractRooms()'s sum, which already excludes
// underlay_reference per the A0 firewall). Pure + exported for unit testing.
export function formatFloorMeta(input: {
  totalAreaM2: number;
  pxPerMetre: number;
}): string {
  const parts: string[] = [];
  if (input.totalAreaM2 > 0) {
    parts.push(`Total measured area: ${input.totalAreaM2.toFixed(1)} m²`);
  }
  parts.push(`Scale: 1 m = ${Math.round(input.pxPerMetre)} px`);
  return parts.join("   ·   ");
}

// ── PDF building blocks ───────────────────────────────────

async function addSketchPage(
  doc: PDFDocument,
  floor: {
    label: string;
    pngDataUrl: string;
    fabricJson?: Record<string, unknown> | null;
  },
  shared: {
    helvetica: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    propertyAddress: string;
    reportNumber: string;
    pageNum: number;
    totalPages: number;
  },
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const { helvetica, bold } = shared;

  // ── Header ──
  page.drawRectangle({
    x: 0,
    y: PAGE_H - MARGIN - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: BRAND_DARK,
  });

  // Brand label
  page.drawText("RestoreAssist", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 22,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Floor Plan", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 40,
    size: 9,
    font: helvetica,
    color: BRAND_CYAN,
  });

  // Address (centred)
  if (shared.propertyAddress) {
    const addr = safe(shared.propertyAddress);
    const addrW = helvetica.widthOfTextAtSize(addr, 10);
    page.drawText(addr, {
      x: (PAGE_W - addrW) / 2,
      y: PAGE_H - MARGIN - 30,
      size: 10,
      font: helvetica,
      color: rgb(1, 1, 1),
    });
  }

  // Floor label (right)
  const floorLabel = safe(floor.label);
  const floorLabelX = PAGE_W - MARGIN - bold.widthOfTextAtSize(floorLabel, 12);
  page.drawText(floorLabel, {
    x: floorLabelX,
    y: PAGE_H - MARGIN - 26,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  if (shared.reportNumber) {
    const refText = `Ref: ${shared.reportNumber}`;
    const refX = PAGE_W - MARGIN - helvetica.widthOfTextAtSize(refText, 9);
    page.drawText(refText, {
      x: refX,
      y: PAGE_H - MARGIN - 42,
      size: 9,
      font: helvetica,
      color: BRAND_CYAN,
    });
  }

  // ── Room legend ──
  const rooms = extractRooms(floor.fabricJson);

  // ── Floor sub-header: total measured area + calibrated scale (RA-6846/6843) ──
  // scaleConfig is stored at the top level of the sketch blob (SketchScaleModal);
  // it survives measuredSketchData()'s spread, so it is readable here. Area is the
  // measured-only sum from the legend rooms above.
  const scaleCfg = (
    floor.fabricJson as { scaleConfig?: { pxPerMetre?: number } } | null | undefined
  )?.scaleConfig;
  const metaLine = formatFloorMeta({
    totalAreaM2: rooms.reduce((a, r) => a + r.areaM2, 0),
    pxPerMetre: scaleCfg?.pxPerMetre ?? PX_PER_METRE,
  });
  const metaText = safe(metaLine);
  const metaW = helvetica.widthOfTextAtSize(metaText, 8);
  page.drawText(metaText, {
    x: (PAGE_W - metaW) / 2,
    y: PAGE_H - MARGIN - 50,
    size: 8,
    font: helvetica,
    color: BRAND_CYAN,
  });
  let legendW = 0;

  if (rooms.length > 0) {
    legendW = 140;
    const legendX = PAGE_W - MARGIN - legendW;
    const legendTop = CONTENT_Y_TOP - 4;

    // Legend box
    page.drawRectangle({
      x: legendX,
      y: legendTop - rooms.length * 16 - 28,
      width: legendW,
      height: rooms.length * 16 + 28,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: DIVIDER,
      borderWidth: 0.5,
    });

    page.drawText("Room Legend", {
      x: legendX + 8,
      y: legendTop - 16,
      size: 8,
      font: bold,
      color: TEXT_MAIN,
    });

    let ly = legendTop - 30;
    for (const room of rooms) {
      // Colour swatch
      const hex = room.stroke.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      page.drawRectangle({
        x: legendX + 8,
        y: ly + 1,
        width: 8,
        height: 8,
        color: rgb(r, g, b),
      });

      const safeLabel = safe(room.label);
      const label =
        safeLabel.length > 14 ? safeLabel.slice(0, 13) + "…" : safeLabel;
      page.drawText(label, {
        x: legendX + 20,
        y: ly + 2,
        size: 7.5,
        font: helvetica,
        color: TEXT_MAIN,
      });

      const areaText = `${room.areaM2.toFixed(1)} m²`;
      const areaX =
        legendX + legendW - 8 - helvetica.widthOfTextAtSize(areaText, 7.5);
      page.drawText(areaText, {
        x: areaX,
        y: ly + 2,
        size: 7.5,
        font: helvetica,
        color: TEXT_MUTED,
      });

      ly -= 16;
    }
  }

  // ── Sketch image ──
  const pngBytes = dataUrlToBytes(floor.pngDataUrl);
  const pngImg = await doc.embedPng(pngBytes);
  const { width: imgW, height: imgH } = pngImg.scale(1);

  const availW = CONTENT_W - legendW - (legendW > 0 ? 8 : 0);
  const scale = Math.min(availW / imgW, CONTENT_H / imgH, 1);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const imgX = MARGIN + (availW - drawW) / 2;
  const imgY = CONTENT_Y_TOP - CONTENT_H + (CONTENT_H - drawH) / 2;

  // White background so transparent canvas shows as white
  page.drawRectangle({
    x: imgX,
    y: imgY,
    width: drawW,
    height: drawH,
    color: rgb(1, 1, 1),
  });
  page.drawImage(pngImg, { x: imgX, y: imgY, width: drawW, height: drawH });

  // ── Footer ──
  const footerY = MARGIN;
  page.drawLine({
    start: { x: MARGIN, y: footerY + FOOTER_H - 2 },
    end: { x: PAGE_W - MARGIN, y: footerY + FOOTER_H - 2 },
    thickness: 0.5,
    color: DIVIDER,
  });

  const pageText = `Page ${shared.pageNum} of ${shared.totalPages}`;
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - helvetica.widthOfTextAtSize(pageText, 8),
    y: footerY + 8,
    size: 8,
    font: helvetica,
    color: TEXT_MUTED,
  });

  page.drawText("Generated by RestoreAssist · Floor plan is indicative only", {
    x: MARGIN,
    y: footerY + 8,
    size: 8,
    font: helvetica,
    color: TEXT_MUTED,
  });
}

// ── Compliance annex page (spec §11) ─────────────────────────

const ACM_RED = rgb(0.7, 0.1, 0.1);

function addComplianceAnnexPage(
  doc: PDFDocument,
  annex: ReturnType<typeof buildComplianceAnnex>,
  shared: {
    helvetica: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    propertyAddress: string;
    equipment?: { dehumidifier: number; airMover: number; airScrubber: number };
  },
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const { helvetica, bold } = shared;
  let y = PAGE_H - MARGIN;

  page.drawText("Compliance Annex — ANSI/IICRC S500:2021 / NCC", {
    x: MARGIN,
    y,
    size: 16,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 22;
  if (shared.propertyAddress) {
    page.drawText(safe(shared.propertyAddress), {
      x: MARGIN,
      y,
      size: 10,
      font: helvetica,
      color: TEXT_MUTED,
    });
    y -= 22;
  }

  // Materials & elements
  page.drawText("Materials & elements", {
    x: MARGIN,
    y,
    size: 12,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 16;
  if (annex.rows.length === 0) {
    page.drawText("No annotated elements.", {
      x: MARGIN,
      y,
      size: 10,
      font: helvetica,
      color: TEXT_MUTED,
    });
    y -= 14;
  }
  for (const r of annex.rows) {
    if (y < MARGIN + 80) break;
    const line = `• ${safe(r.roomLabel)} (${r.elementType}) — ${r.materialName ? safe(r.materialName) : "no material assigned"}${r.isPotentialAcm ? "   [SUSPECTED ACM]" : ""}`;
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 10,
      font: helvetica,
      color: r.isPotentialAcm ? ACM_RED : TEXT_MAIN,
    });
    y -= 14;
  }
  y -= 10;

  // WHS / suspected ACM
  if (annex.acmElements.length > 0) {
    page.drawText("WHS — suspected asbestos (ACM)", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: ACM_RED,
    });
    y -= 16;
    page.drawText(
      `Strip-out / demolition blocked until a WHS pathway is recorded for: ${annex.acmElements.map(safe).join(", ")}`,
      { x: MARGIN, y, size: 10, font: helvetica, color: ACM_RED },
    );
    y -= 22;
  }

  // Water category (S500 §5.2)
  if (annex.waterCategories.length > 0) {
    y -= 4;
    page.drawText("S500 water category", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: BRAND_DARK,
    });
    y -= 16;
    for (const c of annex.waterCategories) {
      if (y < MARGIN + 40) break;
      page.drawText(
        `${c.label} — containment: ${c.containmentRequired ? "yes" : "no"} · contaminated disposal: ${c.disposalAsContaminated ? "yes" : "no"} · PPE: ${c.ppe.join(", ")}`,
        { x: MARGIN, y, size: 9, font: helvetica, color: TEXT_MAIN },
      );
      y -= 14;
    }
    y -= 8;
  }

  // NCC references
  page.drawText(`NCC references (${annex.edition})`, {
    x: MARGIN,
    y,
    size: 12,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 16;
  if (annex.nccReferences.length === 0) {
    page.drawText("None applicable from the annotated materials.", {
      x: MARGIN,
      y,
      size: 10,
      font: helvetica,
      color: TEXT_MUTED,
    });
    y -= 14;
  }
  for (const ref of annex.nccReferences) {
    if (y < MARGIN + 40) break;
    const line = `• ${ref.topic} — ${ref.volume}${ref.australianStandard ? ` (${ref.australianStandard})` : ""}`;
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 10,
      font: helvetica,
      color: TEXT_MAIN,
    });
    y -= 14;
  }

  // NHCover routing (NZ) — spec §5.5
  if (annex.nhcover) {
    const nh = annex.nhcover;
    y -= 10;
    page.drawText("NHCover routing (NZ — Natural Hazards Insurance Act 2023)", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: BRAND_DARK,
    });
    y -= 16;
    page.drawText(
      `Building cap: NZ$${nh.buildingCapNzd.toLocaleString("en-NZ")} + GST · Excess: NZ$${nh.flatExcessNzd} per insured home`,
      { x: MARGIN, y, size: 10, font: helvetica, color: TEXT_MAIN },
    );
    y -= 14;
    page.drawText(
      "Natural hazards (earthquake, landslip, volcanic, hydrothermal, tsunami, fire) -> NHCover building; storm/flood building -> private insurer; land -> NHCover.",
      { x: MARGIN, y, size: 9, font: helvetica, color: TEXT_MUTED },
    );
    y -= 16;
    if (nh.routing) {
      page.drawText(
        `Cause: ${nh.routing.cause} — building: ${nh.routing.building.covered ? "NHCover" : "PRIVATE insurer"} · land: ${nh.routing.land.covered ? "NHCover" : "private"}`,
        { x: MARGIN, y, size: 10, font: helvetica, color: TEXT_MAIN },
      );
      y -= 14;
    }
    if (nh.claim) {
      const topUp =
        nh.claim.privateTopUp > 0
          ? `, NZ$${nh.claim.privateTopUp.toLocaleString("en-NZ")} private top-up`
          : "";
      page.drawText(
        `Estimate: NZ$${nh.claim.nhcCoveredAmount.toLocaleString("en-NZ")} via NHCover (excess NZ$${nh.claim.excess})${topUp}.`,
        { x: MARGIN, y, size: 10, font: helvetica, color: TEXT_MAIN },
      );
      y -= 14;
    }
  }

  // S500 drying log
  if (annex.dryingLog.length > 0) {
    y -= 10;
    page.drawText("S500 drying log", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: BRAND_DARK,
    });
    y -= 16;
    for (const d of annex.dryingLog) {
      if (y < MARGIN + 30) break;
      const line = `• ${safe(d.materialLabel)}: ${d.wme}% WME (target ${d.targetMc}%) — ${d.dryStandardMet ? "DRY" : "NOT YET DRY"}${d.note ? ` · ${safe(d.note)}` : ""}`;
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 10,
        font: helvetica,
        color: d.dryStandardMet ? rgb(0.1, 0.45, 0.2) : ACM_RED,
      });
      y -= 14;
    }
  }

  // S500 §8.3 drying equipment (indicative)
  if (shared.equipment) {
    const eq = shared.equipment;
    y -= 10;
    page.drawText("S500 drying equipment (indicative)", {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: BRAND_DARK,
    });
    y -= 16;
    page.drawText(
      `Dehumidifiers: ${eq.dehumidifier} · Air movers: ${eq.airMover} · Air scrubbers: ${eq.airScrubber}`,
      { x: MARGIN, y, size: 10, font: helvetica, color: TEXT_MAIN },
    );
    y -= 14;
  }

  page.drawText(
    "Generated by RestoreAssist · Compliance annex is indicative — confirm against current standards",
    { x: MARGIN, y: MARGIN / 2, size: 7, font: helvetica, color: TEXT_MUTED },
  );
}

// ── Public API ─────────────────────────────────────────────

export interface SketchFloor {
  label: string;
  /** canvas.toDataURL({ format: 'png', multiplier: 2 }) */
  pngDataUrl: string;
  /** Fabric.js toJSON() output (for room area extraction) */
  fabricJson?: Record<string, unknown> | null;
}

export interface SketchPdfOptions {
  floors: SketchFloor[];
  propertyAddress?: string;
  reportNumber?: string;
  inspectionDate?: string;
  /** ANZ materials library — drives the compliance annex (spec §11). */
  materials?: ScopeMaterialInfo[];
  /** NCC edition override for the annex (defaults to the configured edition). */
  nccEdition?: string;
  /** Moisture pins across floors — drives the S500 drying log (spec §5.2). */
  moisturePins?: MoisturePinInput[];
  /** Jurisdiction (default AU). NZ renders the NHCover routing block (spec §5.5). */
  country?: "AU" | "NZ";
  /** NZ damage cause for specific NHCover routing. */
  nhCause?: DamageCause;
  /** NZ estimated building repair (NZ$) for the NHCover claim calc. */
  estimatedRepairNzd?: number;
}

/**
 * Generate a standalone A4-landscape floor plan PDF.
 * Returns the PDF as a Uint8Array (for streaming to the client).
 */
export async function generateSketchPdf(
  options: SketchPdfOptions,
): Promise<Uint8Array> {
  const {
    floors,
    propertyAddress = "",
    reportNumber = "",
    materials,
    nccEdition,
    moisturePins,
    country,
    nhCause,
    estimatedRepairNzd,
  } = options;

  if (!floors.length) throw new Error("At least one floor is required");

  const hasAnnex = Boolean(materials && materials.length);

  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const shared = {
    helvetica,
    bold,
    propertyAddress,
    reportNumber,
    totalPages: floors.length + (hasAnnex ? 1 : 0),
    pageNum: 0,
  };

  for (const floor of floors) {
    shared.pageNum++;
    await addSketchPage(doc, floor, shared);
  }

  // Compliance annex (materials / WHS-ACM / NCC references) — spec §11
  if (hasAnnex) {
    const mergedObjects = floors.flatMap(
      (f) => (f.fabricJson?.objects as unknown[] | undefined) ?? [],
    );
    const annex = buildComplianceAnnex({ objects: mergedObjects }, materials!, {
      edition: nccEdition,
      pins: moisturePins,
      country,
      nhCause,
      estimatedRepairNzd,
    });
    const totalAreaM2 = floors.reduce(
      (s, f) =>
        s + extractRooms(f.fabricJson).reduce((a, r) => a + r.areaM2, 0),
      0,
    );
    shared.pageNum++;
    addComplianceAnnexPage(doc, annex, {
      ...shared,
      equipment: recommendedEquipment(totalAreaM2),
    });
  }

  // Metadata
  doc.setTitle(`Floor Plan — ${propertyAddress || "RestoreAssist"}`);
  doc.setAuthor("RestoreAssist");
  doc.setCreator("RestoreAssist Sketch Tool");
  doc.setCreationDate(new Date());

  return doc.save();
}

/**
 * Embed floor plan sketch images into an existing pdf-lib PDFDocument.
 * Call this from within an existing report PDF generator (RA-120).
 * Adds a new landscape page per floor at the end of the document.
 */
export async function embedSketchesInPdf(
  doc: PDFDocument,
  floors: SketchFloor[],
  options: { propertyAddress?: string; reportNumber?: string } = {},
): Promise<void> {
  if (!floors.length) return;

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const shared = {
    helvetica,
    bold,
    propertyAddress: options.propertyAddress ?? "",
    reportNumber: options.reportNumber ?? "",
    totalPages: floors.length,
    pageNum: 0,
  };

  for (const floor of floors) {
    shared.pageNum++;
    await addSketchPage(doc, floor, shared);
  }
}
