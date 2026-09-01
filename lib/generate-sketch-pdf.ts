import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  buildComplianceAnnex,
  type ScopeMaterialInfo,
  type MoisturePinInput,
} from "@/lib/sketch/pdf-scope";
import type { DamageCause } from "@/lib/nz/nhcover";
import { extractRooms, PX_PER_METRE } from "@/lib/sketch/extract-rooms";
import {
  formatProvenanceLegend,
  summarizeSketchProvenance,
} from "@/lib/sketch/sketch-provenance-summary";
import {
  buildScopeDryingPlan,
  dryingPlanLines,
  type ScopeDryingPlan,
} from "@/lib/restoration/scope-drying-plan";
import type { PowerAssessment } from "@/lib/restoration/equipment-planner";
import { isSafePublicHttpsUrl } from "@/lib/security/safe-external-url";
import {
  placeMoisturePins,
  moistureLegendClasses,
  type MoistureMapPin,
} from "@/lib/reports/moisture-map";
import {
  placeEvidencePins,
  type EvidenceMapPin,
} from "@/lib/reports/evidence-map";
import { fitSketchImageInBox } from "@/lib/sketch/export-content-bounds";
import { extractDamageLegend } from "@/lib/sketch/damage-zone";
import { extractEquipmentLegend } from "@/lib/sketch/equipment-symbols";
import {
  northArrowGeometry,
  scaleBarLayout,
} from "@/lib/sketch/pdf-plan-chrome";

// ── Constants ─────────────────────────────────────────────

/** A4 landscape (842 × 595 pt) */
const PAGE_W = 842;
const PAGE_H = 595;

const MARGIN = 36;
const HEADER_H = 56;
const FOOTER_H = 40;
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

// ── White-label branding (RA-6851 [A8]) ───────────────────
// The sketch header carries the inspection owner's business identity, not a
// hardcoded RestoreAssist label. `resolveSketchBranding` is a pure function of
// its per-inspection input (resolved server-side from `Inspection.userId`), so
// branding can never bleed across workspaces — the caller always passes one
// tenant's data and gets a fresh object back. Pure + exported for unit testing.

/** Raw branding input, sourced from the owning `User.business*` fields. */
export interface SketchBrandingInput {
  businessName?: string | null;
  /** Cloudinary logo URL (https only). */
  businessLogo?: string | null;
  /** Hex colour that tints the header band when set. */
  primaryColor?: string | null;
  showLogo?: boolean | null;
  showCompanyName?: boolean | null;
  logoPosition?: string | null;
}

/** Normalised branding with defaults applied. */
export interface ResolvedSketchBranding {
  businessName: string;
  logoUrl: string | null;
  primaryColorHex: string | null;
  showLogo: boolean;
  showCompanyName: boolean;
  logoPosition: "left" | "center" | "right";
}

const DEFAULT_BUSINESS_NAME = "RestoreAssist";

/**
 * Parse a hex colour (`#1C2E47`, `#fff`, or bare `00BAD4`) into 0–1 rgb
 * components for pdf-lib. Returns null for any malformed input so a bad
 * workspace colour never crashes the export. Pure — exported for unit testing.
 */
export function parseHexColor(
  hex: string | null | undefined,
): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/**
 * Resolve raw workspace branding into a normalised, render-ready shape.
 * Fallbacks: no name → "RestoreAssist"; non-https / hidden logo → none;
 * invalid colour → none. Always returns a fresh object (no shared singleton).
 */
export function resolveSketchBranding(
  input?: SketchBrandingInput | null,
): ResolvedSketchBranding {
  const name = input?.businessName?.trim();
  const showLogo = input?.showLogo ?? true;
  const showCompanyName = input?.showCompanyName ?? true;
  const logo = input?.businessLogo?.trim();
  const logoUrl =
    showLogo && logo && logo.startsWith("https://") ? logo : null;
  const primaryColorHex =
    input?.primaryColor && parseHexColor(input.primaryColor)
      ? input.primaryColor.trim()
      : null;
  const pos = input?.logoPosition;
  const logoPosition = pos === "center" || pos === "right" ? pos : "left";
  return {
    businessName: name && name.length > 0 ? name : DEFAULT_BUSINESS_NAME,
    logoUrl,
    primaryColorHex,
    showLogo,
    showCompanyName,
    logoPosition,
  };
}

// ── PDF building blocks ───────────────────────────────────

async function addSketchPage(
  doc: PDFDocument,
  floor: {
    label: string;
    pngDataUrl: string;
    fabricJson?: Record<string, unknown> | null;
    moisturePins?: MoistureMapPin[] | null;
    evidencePins?: EvidenceMapPin[] | null;
  },
  shared: {
    helvetica: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    propertyAddress: string;
    reportNumber: string;
    pageNum: number;
    totalPages: number;
    branding: ResolvedSketchBranding;
    logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null;
  },
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const { helvetica, bold, branding, logoImage } = shared;

  // ── Header ──
  // Band tinted by the workspace primaryColor when set (RA-6851 [A8]);
  // otherwise the RestoreAssist default.
  const bandRgb = branding.primaryColorHex
    ? parseHexColor(branding.primaryColorHex)
    : null;
  page.drawRectangle({
    x: 0,
    y: PAGE_H - MARGIN - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: bandRgb ? rgb(bandRgb.r, bandRgb.g, bandRgb.b) : BRAND_DARK,
  });

  // Brand zone (left): white-label logo + business name, with graceful
  // fallbacks. Logo lives in the left brand zone so it never collides with the
  // centred address or the right-aligned floor label.
  let brandX = MARGIN;
  if (logoImage && branding.showLogo) {
    const logoH = 28;
    const logoScale = logoH / logoImage.height;
    const logoW = logoImage.width * logoScale;
    page.drawImage(logoImage, {
      x: MARGIN,
      y: PAGE_H - MARGIN - HEADER_H / 2 - logoH / 2,
      width: logoW,
      height: logoH,
    });
    brandX = MARGIN + logoW + 8;
  }
  if (branding.showCompanyName) {
    page.drawText(safe(branding.businessName), {
      x: brandX,
      y: PAGE_H - MARGIN - 22,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Floor Plan", {
      x: brandX,
      y: PAGE_H - MARGIN - 40,
      size: 9,
      font: helvetica,
      color: BRAND_CYAN,
    });
  } else if (!logoImage) {
    // Neither name nor logo — fall back to the default so the header is never
    // empty.
    page.drawText(DEFAULT_BUSINESS_NAME, {
      x: brandX,
      y: PAGE_H - MARGIN - 22,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Floor Plan", {
      x: brandX,
      y: PAGE_H - MARGIN - 40,
      size: 9,
      font: helvetica,
      color: BRAND_CYAN,
    });
  }

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

  // ── Room + damage + equipment legends ──
  const rooms = extractRooms(floor.fabricJson);
  const damageLegend = extractDamageLegend(floor.fabricJson ?? null);
  const equipmentLegend = extractEquipmentLegend(floor.fabricJson ?? null);

  // ── Floor sub-header: total measured area + calibrated scale (RA-6846/6843) ──
  // scaleConfig is stored at the top level of the sketch blob (SketchScaleModal);
  // it survives measuredSketchData()'s spread, so it is readable here. Area is the
  // measured-only sum from the legend rooms above.
  const scaleCfg = (
    floor.fabricJson as { scaleConfig?: { pxPerMetre?: number } } | null | undefined
  )?.scaleConfig;
  const pxPerMetre = scaleCfg?.pxPerMetre ?? PX_PER_METRE;
  const metaLine = formatFloorMeta({
    totalAreaM2: rooms.reduce((a, r) => a + r.areaM2, 0),
    pxPerMetre,
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

  if (
    rooms.length > 0 ||
    damageLegend.length > 0 ||
    equipmentLegend.length > 0
  ) {
    legendW = 140;
    const legendX = PAGE_W - MARGIN - legendW;
    const legendTop = CONTENT_Y_TOP - 4;
    const damageBlockH =
      damageLegend.length > 0 ? damageLegend.length * 14 + 22 : 0;
    const equipBlockH =
      equipmentLegend.length > 0 ? equipmentLegend.length * 14 + 22 : 0;
    const roomBlockH = rooms.length > 0 ? rooms.length * 16 + 28 : 0;
    const gaps =
      (rooms.length > 0 && damageLegend.length > 0 ? 8 : 0) +
      ((rooms.length > 0 || damageLegend.length > 0) &&
      equipmentLegend.length > 0
        ? 8
        : 0);
    const totalH = roomBlockH + damageBlockH + equipBlockH + gaps;

    // Legend box
    page.drawRectangle({
      x: legendX,
      y: legendTop - totalH,
      width: legendW,
      height: totalH,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: DIVIDER,
      borderWidth: 0.5,
    });

    let ly = legendTop - 16;
    if (rooms.length > 0) {
      page.drawText("Room Legend", {
        x: legendX + 8,
        y: ly,
        size: 8,
        font: bold,
        color: TEXT_MAIN,
      });

      ly -= 14;
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

        const lidarTag = room.captureAdapter === "roomplan" ? " · LiDAR" : "";
        const safeLabel = safe(room.label);
        const maxLen = lidarTag ? 10 : 14;
        const truncated =
          safeLabel.length > maxLen
            ? safeLabel.slice(0, maxLen - 1) + "…"
            : safeLabel;
        page.drawText(`${truncated}${lidarTag}`, {
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

    if (damageLegend.length > 0) {
      if (rooms.length > 0) ly -= 6;
      page.drawText("Affected Areas", {
        x: legendX + 8,
        y: ly,
        size: 8,
        font: bold,
        color: TEXT_MAIN,
      });
      ly -= 14;
      for (const entry of damageLegend) {
        const hex = entry.swatch.replace("#", "");
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
        page.drawText(safe(entry.label), {
          x: legendX + 20,
          y: ly + 2,
          size: 7.5,
          font: helvetica,
          color: TEXT_MAIN,
        });
        ly -= 14;
      }
    }

    if (equipmentLegend.length > 0) {
      if (rooms.length > 0 || damageLegend.length > 0) ly -= 6;
      page.drawText("Equipment", {
        x: legendX + 8,
        y: ly,
        size: 8,
        font: bold,
        color: TEXT_MAIN,
      });
      ly -= 14;
      for (const entry of equipmentLegend) {
        const hex = entry.swatch.replace("#", "");
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        page.drawCircle({
          x: legendX + 12,
          y: ly + 5,
          size: 4,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(r, g, b),
          borderWidth: 1,
        });
        page.drawText(safe(`${entry.short} ${entry.label}`), {
          x: legendX + 20,
          y: ly + 2,
          size: 7,
          font: helvetica,
          color: TEXT_MAIN,
        });
        ly -= 14;
      }
    }
  }

  // ── Sketch image ──
  // Content-cropped PNGs are often smaller than the page box; allow upscale so
  // the plan fills the frame (Encircle-style) instead of sitting in empty void.
  const pngBytes = dataUrlToBytes(floor.pngDataUrl);
  const pngImg = await doc.embedPng(pngBytes);
  const { width: imgW, height: imgH } = pngImg.scale(1);

  const availW = CONTENT_W - legendW - (legendW > 0 ? 8 : 0);
  const { drawW, drawH } = fitSketchImageInBox(
    imgW,
    imgH,
    availW,
    CONTENT_H,
  );
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

  // ── North arrow + graphic scale bar (inspection-grade report chrome) ──
  {
    const arrow = northArrowGeometry(
      { x: imgX + drawW - 18, y: imgY + drawH - 36 },
      20,
    );
    page.drawLine({
      start: arrow.stemEnd,
      end: arrow.tip,
      thickness: 1.25,
      color: BRAND_DARK,
    });
    page.drawLine({
      start: arrow.baseLeft,
      end: arrow.tip,
      thickness: 1.25,
      color: BRAND_DARK,
    });
    page.drawLine({
      start: arrow.baseRight,
      end: arrow.tip,
      thickness: 1.25,
      color: BRAND_DARK,
    });
    const nLabel = arrow.label.text;
    const nW = bold.widthOfTextAtSize(nLabel, 8);
    page.drawText(nLabel, {
      x: arrow.label.x - nW / 2,
      y: arrow.label.y,
      size: 8,
      font: bold,
      color: BRAND_DARK,
    });

    const bar = scaleBarLayout(pxPerMetre, drawW, imgW, 110);
    if (bar) {
      // Bottom-right so moisture legend (bottom-left) never overlaps.
      const barX = imgX + Math.max(10, drawW - bar.barLengthPt - 12);
      const barY = imgY + 14;
      page.drawLine({
        start: { x: barX, y: barY },
        end: { x: barX + bar.barLengthPt, y: barY },
        thickness: 1.5,
        color: BRAND_DARK,
      });
      for (const t of bar.ticks) {
        const tx = barX + t * bar.barLengthPt;
        page.drawLine({
          start: { x: tx, y: barY - 3 },
          end: { x: tx, y: barY + 3 },
          thickness: 1,
          color: BRAND_DARK,
        });
      }
      page.drawText("0", {
        x: barX - 2,
        y: barY + 5,
        size: 6.5,
        font: helvetica,
        color: TEXT_MUTED,
      });
      const endLabel = safe(bar.label);
      const endW = helvetica.widthOfTextAtSize(endLabel, 6.5);
      page.drawText(endLabel, {
        x: barX + bar.barLengthPt - endW / 2,
        y: barY + 5,
        size: 6.5,
        font: helvetica,
        color: TEXT_MUTED,
      });
    }
  }

  // ── Moisture map overlay (RA-120 acceptance §3) ──
  // The moisture pins are a client DOM overlay that never bakes into the
  // rasterised sketch PNG, so the structural sketch alone reached the PDF. Draw
  // them here on the same image — colour + class per IICRC S500:2021 §8.1 — so
  // the structural sketch AND the moisture map are both present on the page.
  const pins = floor.moisturePins ?? [];
  if (pins.length > 0) {
    const placed = placeMoisturePins(pins, {
      x: imgX,
      y: imgY,
      width: drawW,
      height: drawH,
    });
    const PIN_R = 7;
    for (const p of placed) {
      const c = parseHexColor(p.color);
      const fill = c ? rgb(c.r, c.g, c.b) : BRAND_CYAN;
      page.drawCircle({
        x: p.cx,
        y: p.cy,
        size: PIN_R,
        color: fill,
        borderColor: rgb(1, 1, 1),
        borderWidth: 1,
      });
      const label = String(Math.round(p.wme));
      const labelW = bold.widthOfTextAtSize(label, 6);
      page.drawText(label, {
        x: p.cx - labelW / 2,
        y: p.cy - 2.5,
        size: 6,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }

    // Moisture legend — only the classes actually present, so a reader can
    // decode the pin colours. Sits at the bottom-left of the drawn image.
    const legend = moistureLegendClasses(pins);
    let lx = imgX + 4;
    const lyRow = imgY + 6;
    page.drawText("Moisture (WME %):", {
      x: lx,
      y: lyRow,
      size: 7,
      font: bold,
      color: TEXT_MAIN,
    });
    lx += bold.widthOfTextAtSize("Moisture (WME %):", 7) + 8;
    for (const info of legend) {
      const c = parseHexColor(info.color);
      page.drawCircle({
        x: lx + 3,
        y: lyRow + 2,
        size: 3,
        color: c ? rgb(c.r, c.g, c.b) : BRAND_CYAN,
        borderColor: rgb(1, 1, 1),
        borderWidth: 0.5,
      });
      const text = `${info.label} (${info.thresholdMin}${info.thresholdMax === Infinity ? "+" : `-${info.thresholdMax}`}%)`;
      page.drawText(text, {
        x: lx + 9,
        y: lyRow,
        size: 7,
        font: helvetica,
        color: TEXT_MUTED,
      });
      lx += 9 + helvetica.widthOfTextAtSize(text, 7) + 12;
    }
  }

  const evidencePins = placeEvidencePins(floor.evidencePins ?? [], {
    x: imgX,
    y: imgY,
    width: drawW,
    height: drawH,
  });
  for (const pin of evidencePins) {
    const radius = 8;
    page.drawCircle({
      x: pin.cx,
      y: pin.cy,
      size: radius,
      color: rgb(0.83, 0.65, 0.45),
      borderColor: rgb(1, 1, 1),
      borderWidth: 1,
    });
    const labelWidth = bold.widthOfTextAtSize(pin.label, 5.5);
    page.drawText(pin.label, {
      x: pin.cx - labelWidth / 2,
      y: pin.cy - 2,
      size: 5.5,
      font: bold,
      color: BRAND_DARK,
    });
    const caption = safe(pin.caption).slice(0, 32);
    if (caption) {
      const captionWidth = helvetica.widthOfTextAtSize(caption, 6.5);
      const captionX = pin.cx + radius + 3;
      page.drawRectangle({
        x: captionX - 2,
        y: pin.cy - 4,
        width: captionWidth + 4,
        height: 10,
        color: rgb(1, 1, 1),
        opacity: 0.88,
      });
      page.drawText(caption, {
        x: captionX,
        y: pin.cy - 1.5,
        size: 6.5,
        font: helvetica,
        color: TEXT_MAIN,
      });
    }
  }

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
    y: footerY + 20,
    size: 8,
    font: helvetica,
    color: TEXT_MUTED,
  });

  const provenanceLine = formatProvenanceLegend(
    summarizeSketchProvenance(floor.fabricJson),
  );
  if (provenanceLine) {
    page.drawText(safe(provenanceLine), {
      x: MARGIN,
      y: footerY + 8,
      size: 7.5,
      font: helvetica,
      color: TEXT_MUTED,
    });
  }
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
    /**
     * RA-7005 phased plan, not three numbers off an area division. The annex
     * has to render the mould gate and the circuit budget, because a technician
     * works from this page: printing a bare air-mover count on a mould job is
     * the S520 failure the planner exists to prevent.
     */
    dryingPlan?: ScopeDryingPlan | null;
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

  // Drying equipment - RA-7005 phased plan, mould-gated and power-bounded.
  // The lines are built by dryingPlanLines() rather than assembled inline here,
  // so what lands on the page a technician works from is assertable in a test.
  // PDF text is not extractable from the saved bytes, so inline draw calls were
  // only ever verifiable as "two exports differ".
  const TONE_SIZE: Record<string, number> = {
    heading: 12,
    body: 10,
    warn: 8,
    muted: 8,
  };
  const TONE_COLOR = {
    heading: BRAND_DARK,
    body: TEXT_MAIN,
    warn: ACM_RED,
    muted: TEXT_MUTED,
  } as const;
  const planLines = dryingPlanLines(shared.dryingPlan ?? null);
  if (planLines.length) y -= 10;
  for (const pl of planLines) {
    // Stop before the footer rather than drawing over it.
    if (y < MARGIN) break;
    page.drawText(safe(pl.text), {
      x: MARGIN,
      y,
      size: TONE_SIZE[pl.tone],
      font: pl.tone === "heading" ? bold : helvetica,
      color: TONE_COLOR[pl.tone],
    });
    y -= pl.tone === "heading" ? 16 : pl.tone === "body" ? 13 : 11;
  }

  page.drawText(
    "Generated by RestoreAssist · Compliance annex is indicative — confirm against current standards",
    { x: MARGIN, y: MARGIN / 2, size: 7, font: helvetica, color: TEXT_MUTED },
  );
}

// ── Public API ─────────────────────────────────────────────

export interface SketchFloor {
  label: string;
  /** Content-cropped PNG from exportSketchPng (typically multiplier: 3). */
  pngDataUrl: string;
  /** Fabric.js toJSON() output (for room area extraction) */
  fabricJson?: Record<string, unknown> | null;
  /**
   * Moisture pins for this floor (RA-120 §3). Overlaid on the sketch image so
   * the moisture map rides the same page as the structural sketch. Parsed from
   * `ClaimSketch.moisturePoints` via `parseMoisturePins`.
   */
  moisturePins?: MoistureMapPin[] | null;
  /** Evidence photos linked to stable normalized positions on this floor. */
  evidencePins?: EvidenceMapPin[] | null;
  /** Room moisture crop meta — expands to an extra report page when set. */
  roomMoistureCrop?: import("@/lib/sketch/room-moisture-crop").RoomMoistureCropMeta | null;
  /** True when this page is the room-scoped moisture companion page. */
  isRoomMoisturePage?: boolean;
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
  /**
   * White-label branding (RA-6851 [A8]) — resolved server-side from the
   * inspection owner's business identity. Omit for the RestoreAssist default.
   */
  branding?: SketchBrandingInput;
  /**
   * Active mould on the job (RA-7005). Drives the S520 sequence: while true the
   * annex's Phase 1 carries NO air movers. Derive it with `deriveMouldActive`
   * via `lib/restoration/fetch-plan-inputs.ts`, the same signals the report
   * reads — a caller that computes it its own way puts the PDF and the report in
   * contradiction on one job.
   */
  mouldActive?: boolean;
  /**
   * On-site power assessment. Omitted means the plan is built on the assumed
   * 2x20A budget and the annex prints it as ASSUMED.
   */
  powerAssessment?: PowerAssessment;
}

/**
 * Fetch + embed a workspace logo into `doc`, reusing the report-PDF pattern:
 * https-only, content-type sniff for PNG vs JPG, and a silent fallback so a
 * broken brand asset can never block the export.
 */
async function embedBrandLogo(
  doc: PDFDocument,
  logoUrl: string | null,
): Promise<Awaited<ReturnType<PDFDocument["embedPng"]>> | null> {
  if (!logoUrl) return null;
  // SSRF guard: require https and a host that resolves to a public address
  // (defeats DNS rebinding to loopback / RFC1918 / 169.254.169.254 metadata)
  // before any server-side fetch of this tenant-controlled URL.
  if (!(await isSafePublicHttpsUrl(logoUrl))) return null;
  // Bound the fetch: a tenant-controlled URL must not hang the export or pull an
  // oversized asset. Cap wall-clock at 5s and payload at 5 MB.
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_LOGO_BYTES) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return ct.includes("png")
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
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
    mouldActive,
    powerAssessment,
  } = options;

  if (!floors.length) throw new Error("At least one floor is required");

  const hasAnnex = Boolean(materials && materials.length);

  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // White-label branding — resolved once, logo fetched once (RA-6851 [A8]).
  const branding = resolveSketchBranding(options.branding);
  const logoImage = await embedBrandLogo(doc, branding.logoUrl);

  const shared = {
    helvetica,
    bold,
    propertyAddress,
    reportNumber,
    totalPages: floors.length + (hasAnnex ? 1 : 0),
    pageNum: 0,
    branding,
    logoImage,
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
      dryingPlan: buildScopeDryingPlan({
        totalAreaM2,
        mouldActive: mouldActive ?? false,
        powerAssessment,
      }),
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
  options: {
    propertyAddress?: string;
    reportNumber?: string;
    branding?: SketchBrandingInput;
  } = {},
): Promise<void> {
  if (!floors.length) return;

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const branding = resolveSketchBranding(options.branding);
  const logoImage = await embedBrandLogo(doc, branding.logoUrl);

  const shared = {
    helvetica,
    bold,
    propertyAddress: options.propertyAddress ?? "",
    reportNumber: options.reportNumber ?? "",
    totalPages: floors.length,
    pageNum: 0,
    branding,
    logoImage,
  };

  for (const floor of floors) {
    shared.pageNum++;
    await addSketchPage(doc, floor, shared);
  }
}
