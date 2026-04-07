/**
 * Dispute Defence Pack PDF Generator
 *
 * Generates a professionally formatted PDF containing all evidence for a
 * completed inspection with IICRC S500:2025 citations. Used when an insurer
 * disputes a claim and the contractor needs a single consolidated evidence pack.
 *
 * Follows existing pdf-lib patterns from generate-enhanced-report-pdf.ts.
 */

import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFFont,
  PDFPage,
  RGB,
} from "pdf-lib";
import { PrismaClient } from "@prisma/client";

// ── Brand colours ──────────────────────────────────────────────────────────────
const NAVY = rgb(0.11, 0.18, 0.28); // #1C2E47
const WARM_ACCENT = rgb(0.54, 0.42, 0.31); // #8A6B4E
const LIGHT_ACCENT = rgb(0.83, 0.65, 0.45); // #D4A574
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const SECONDARY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95);
const WHITE = rgb(1, 1, 1);
const DIVIDER = rgb(0.8, 0.8, 0.8);
const GREEN = rgb(0.13, 0.55, 0.13);
const RED = rgb(0.7, 0.15, 0.15);
const AMBER = rgb(0.8, 0.6, 0.0);

// ── Page constants ─────────────────────────────────────────────────────────────
const PAGE_W = 595; // A4 width
const PAGE_H = 842; // A4 height
const MARGIN = 50;
const LINE_HEIGHT = 14;
const CONTENT_WIDTH = PAGE_W - MARGIN * 2;

// ── Types ──────────────────────────────────────────────────────────────────────
interface DisputePackData {
  inspection: {
    id: string;
    inspectionNumber: string;
    propertyAddress: string;
    propertyPostcode: string;
    technicianName: string | null;
    inspectionDate: Date;
    status: string;
    createdAt: Date;
    submittedAt: Date | null;
    processedAt: Date | null;
  };
  classifications: {
    category: string;
    class: string;
    justification: string;
    standardReference: string;
    confidence: number | null;
  }[];
  affectedAreas: {
    roomZoneId: string;
    affectedSquareFootage: number;
    waterSource: string;
    timeSinceLoss: number | null;
    category: string | null;
    class: string | null;
    description: string | null;
  }[];
  moistureReadings: {
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: string;
    notes: string | null;
    recordedAt: Date;
  }[];
  scopeItems: {
    itemType: string;
    description: string;
    quantity: number | null;
    unit: string | null;
    justification: string | null;
    isSelected: boolean;
  }[];
  costEstimates: {
    category: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    subtotal: number;
    total: number;
  }[];
  evidenceItems: {
    evidenceClass: string;
    title: string;
    description: string | null;
    capturedByName: string;
    capturedAt: Date;
    capturedLat: number | null;
    capturedLng: number | null;
    hashSha256: string | null;
    structuredData: string | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Sanitize text for WinAnsi encoding (matches existing pattern) */
function sanitize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Format date to Australian locale */
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "N/A";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Format date with time */
function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "N/A";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Format currency (AUD) */
function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** First 8 chars of a SHA-256 hash or "N/A" */
function shortHash(hash: string | null | undefined): string {
  if (!hash) return "N/A";
  return hash.substring(0, 8);
}

/** Map evidence class enum to human label */
function evidenceClassLabel(cls: string): string {
  const labels: Record<string, string> = {
    MOISTURE_READING: "Moisture Reading",
    THERMAL_IMAGE: "Thermal Image",
    AMBIENT_ENVIRONMENTAL: "Environmental",
    PHOTO_DAMAGE: "Damage Photo",
    PHOTO_EQUIPMENT: "Equipment Photo",
    PHOTO_PROGRESS: "Progress Photo",
    PHOTO_COMPLETION: "Completion Photo",
    VIDEO_WALKTHROUGH: "Video Walkthrough",
    FLOOR_PLAN: "Floor Plan",
    SCOPE_DOCUMENT: "Scope Document",
    LAB_RESULT: "Lab Result",
    AUTHORITY_FORM: "Authority Form",
    EQUIPMENT_LOG: "Equipment Log",
    TECHNICIAN_NOTE: "Technician Note",
    VOICE_MEMO: "Voice Memo",
  };
  return labels[cls] ?? cls;
}

/** S500 section reference for evidence class */
function s500SectionForEvidenceClass(cls: string): string {
  const refs: Record<string, string> = {
    MOISTURE_READING: "IICRC S500:2025 \u00A77.2",
    THERMAL_IMAGE: "IICRC S500:2025 \u00A77.3",
    AMBIENT_ENVIRONMENTAL: "IICRC S500:2025 \u00A77.1",
    PHOTO_DAMAGE: "IICRC S500:2025 \u00A710.2",
    PHOTO_EQUIPMENT: "IICRC S500:2025 \u00A712.4",
    PHOTO_PROGRESS: "IICRC S500:2025 \u00A710.3",
    PHOTO_COMPLETION: "IICRC S500:2025 \u00A710.4",
    VIDEO_WALKTHROUGH: "IICRC S500:2025 \u00A710.2",
    FLOOR_PLAN: "IICRC S500:2025 \u00A710.1",
    SCOPE_DOCUMENT: "IICRC S500:2025 \u00A711.1",
    LAB_RESULT: "IICRC S500:2025 \u00A78.5",
    AUTHORITY_FORM: "IICRC S500:2025 \u00A79.1",
    EQUIPMENT_LOG: "IICRC S500:2025 \u00A712.3",
    TECHNICIAN_NOTE: "IICRC S500:2025 \u00A710.5",
    VOICE_MEMO: "IICRC S500:2025 \u00A710.5",
  };
  return refs[cls] ?? "IICRC S500:2025";
}

/** Moisture standard target for a surface type */
function moistureTarget(surfaceType: string): number {
  const targets: Record<string, number> = {
    drywall: 12,
    wood: 14,
    carpet: 12,
    concrete: 14,
    tile: 10,
    plaster: 12,
    hardwood: 12,
    laminate: 12,
  };
  return targets[surfaceType.toLowerCase()] ?? 15;
}

/** Format GPS coords or "N/A" */
function fmtGps(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "N/A";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// ── PDF Drawing Context ────────────────────────────────────────────────────────

class PDFWriter {
  private pdfDoc: PDFDocument;
  private currentPage: PDFPage;
  private y: number;
  private helvetica!: PDFFont;
  private helveticaBold!: PDFFont;

  constructor(pdfDoc: PDFDocument) {
    this.pdfDoc = pdfDoc;
    this.currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  async init(): Promise<void> {
    this.helvetica = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.helveticaBold = await this.pdfDoc.embedFont(
      StandardFonts.HelveticaBold,
    );
  }

  /** Add new page and reset cursor */
  newPage(): void {
    this.currentPage = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.drawFooter();
  }

  /** Check if we need a new page; if so, add one */
  ensureSpace(needed: number): void {
    if (this.y - needed < MARGIN + 30) {
      this.newPage();
    }
  }

  /** Draw page footer with branding */
  private drawFooter(): void {
    this.currentPage.drawLine({
      start: { x: MARGIN, y: 35 },
      end: { x: PAGE_W - MARGIN, y: 35 },
      thickness: 0.5,
      color: DIVIDER,
    });
    this.currentPage.drawText("RestoreAssist Dispute Defence Pack", {
      x: MARGIN,
      y: 22,
      size: 7,
      font: this.helvetica,
      color: SECONDARY,
    });
    const pageNum = this.pdfDoc.getPageCount();
    const pageText = `Page ${pageNum}`;
    const pageTextWidth = this.helvetica.widthOfTextAtSize(pageText, 7);
    this.currentPage.drawText(pageText, {
      x: PAGE_W - MARGIN - pageTextWidth,
      y: 22,
      size: 7,
      font: this.helvetica,
      color: SECONDARY,
    });
  }

  /** Draw text at current y position with word-wrap */
  drawText(
    text: string,
    opts: {
      x?: number;
      size?: number;
      font?: PDFFont;
      color?: RGB;
      maxWidth?: number;
    } = {},
  ): void {
    const x = opts.x ?? MARGIN;
    const size = opts.size ?? 9;
    const font = opts.font ?? this.helvetica;
    const color = opts.color ?? TEXT_COLOR;
    const maxWidth = opts.maxWidth ?? CONTENT_WIDTH;

    const safe = sanitize(text);
    if (!safe) return;

    const words = safe.split(" ");
    let line = "";

    for (const word of words) {
      if (!word) continue;
      const testLine = line + (line ? " " : "") + word;
      const w = font.widthOfTextAtSize(testLine, size);
      if (w > maxWidth && line.length > 0) {
        this.ensureSpace(LINE_HEIGHT);
        this.currentPage.drawText(line, { x, y: this.y, size, font, color });
        this.y -= LINE_HEIGHT;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line.length > 0) {
      this.ensureSpace(LINE_HEIGHT);
      this.currentPage.drawText(line, { x, y: this.y, size, font, color });
      this.y -= LINE_HEIGHT;
    }
  }

  /** Draw a section heading */
  heading(text: string): void {
    this.ensureSpace(40);
    this.y -= 10;
    this.currentPage.drawRectangle({
      x: MARGIN,
      y: this.y - 4,
      width: CONTENT_WIDTH,
      height: 20,
      color: NAVY,
    });
    this.currentPage.drawText(sanitize(text).toUpperCase(), {
      x: MARGIN + 8,
      y: this.y,
      size: 10,
      font: this.helveticaBold,
      color: WHITE,
    });
    this.y -= 28;
  }

  /** Draw a sub-heading */
  subHeading(text: string): void {
    this.ensureSpace(24);
    this.y -= 6;
    this.currentPage.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y,
      size: 10,
      font: this.helveticaBold,
      color: NAVY,
    });
    this.y -= 16;
  }

  /** Draw a simple table header row */
  tableHeaderRow(columns: { label: string; x: number; width: number }[]): void {
    this.ensureSpace(20);
    this.currentPage.drawRectangle({
      x: MARGIN,
      y: this.y - 4,
      width: CONTENT_WIDTH,
      height: 16,
      color: LIGHT_GRAY,
    });
    for (const col of columns) {
      this.currentPage.drawText(sanitize(col.label), {
        x: col.x,
        y: this.y,
        size: 7,
        font: this.helveticaBold,
        color: NAVY,
      });
    }
    this.y -= 18;
  }

  /** Draw a table data row */
  tableRow(
    cells: { text: string; x: number; width: number; color?: RGB }[],
    opts?: { bold?: boolean },
  ): void {
    this.ensureSpace(16);
    for (const cell of cells) {
      const font = opts?.bold ? this.helveticaBold : this.helvetica;
      const cellText = sanitize(cell.text);
      // Truncate if text is wider than column
      let display = cellText;
      while (
        display.length > 0 &&
        font.widthOfTextAtSize(display, 7) > cell.width
      ) {
        display = display.slice(0, -1);
      }
      if (display.length < cellText.length && display.length > 3) {
        display = display.slice(0, -3) + "...";
      }
      this.currentPage.drawText(display, {
        x: cell.x,
        y: this.y,
        size: 7,
        font,
        color: cell.color ?? TEXT_COLOR,
      });
    }
    this.y -= 14;
  }

  /** Draw a key-value pair */
  kvPair(key: string, value: string, opts?: { x?: number }): void {
    const x = opts?.x ?? MARGIN;
    this.ensureSpace(LINE_HEIGHT);
    const keyStr = sanitize(key) + ": ";
    const keyWidth = this.helveticaBold.widthOfTextAtSize(keyStr, 9);
    this.currentPage.drawText(keyStr, {
      x,
      y: this.y,
      size: 9,
      font: this.helveticaBold,
      color: TEXT_COLOR,
    });
    this.currentPage.drawText(sanitize(value), {
      x: x + keyWidth,
      y: this.y,
      size: 9,
      font: this.helvetica,
      color: TEXT_COLOR,
    });
    this.y -= LINE_HEIGHT + 2;
  }

  /** Skip vertical space */
  skip(pts: number): void {
    this.y -= pts;
  }

  /** Draw a horizontal rule */
  hr(): void {
    this.ensureSpace(8);
    this.currentPage.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: DIVIDER,
    });
    this.y -= 8;
  }

  /** Current y position getter */
  getY(): number {
    return this.y;
  }

  /** Current page getter */
  getPage(): PDFPage {
    return this.currentPage;
  }

  /** Font getters */
  getBoldFont(): PDFFont {
    return this.helveticaBold;
  }

  getFont(): PDFFont {
    return this.helvetica;
  }
}

// ── Main Generation Function ───────────────────────────────────────────────────

export async function generateDisputePack(
  inspectionId: string,
  userId: string,
  prisma: PrismaClient,
): Promise<Uint8Array> {
  // ── Fetch all data in a single query with select ─────────────────────────
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      technicianName: true,
      inspectionDate: true,
      status: true,
      createdAt: true,
      submittedAt: true,
      processedAt: true,
      userId: true,
      classifications: {
        select: {
          category: true,
          class: true,
          justification: true,
          standardReference: true,
          confidence: true,
        },
        orderBy: { createdAt: "desc" as const },
        take: 10,
      },
      affectedAreas: {
        select: {
          roomZoneId: true,
          affectedSquareFootage: true,
          waterSource: true,
          timeSinceLoss: true,
          category: true,
          class: true,
          description: true,
        },
      },
      moistureReadings: {
        select: {
          location: true,
          surfaceType: true,
          moistureLevel: true,
          depth: true,
          notes: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: "asc" as const },
      },
      scopeItems: {
        select: {
          itemType: true,
          description: true,
          quantity: true,
          unit: true,
          justification: true,
          isSelected: true,
        },
        where: { isSelected: true },
      },
      costEstimates: {
        select: {
          category: true,
          description: true,
          quantity: true,
          unit: true,
          rate: true,
          subtotal: true,
          total: true,
        },
        orderBy: { category: "asc" as const },
      },
      evidenceItems: {
        select: {
          evidenceClass: true,
          title: true,
          description: true,
          capturedByName: true,
          capturedAt: true,
          capturedLat: true,
          capturedLng: true,
          hashSha256: true,
          structuredData: true,
        },
        orderBy: { capturedAt: "asc" as const },
      },
    },
  });

  if (!inspection) {
    throw new Error("Inspection not found");
  }

  if (inspection.userId !== userId) {
    throw new Error("Unauthorised: not the owner of this inspection");
  }

  const data: DisputePackData = {
    inspection: {
      id: inspection.id,
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      propertyPostcode: inspection.propertyPostcode,
      technicianName: inspection.technicianName,
      inspectionDate: inspection.inspectionDate,
      status: inspection.status,
      createdAt: inspection.createdAt,
      submittedAt: inspection.submittedAt,
      processedAt: inspection.processedAt,
    },
    classifications: inspection.classifications,
    affectedAreas: inspection.affectedAreas,
    moistureReadings: inspection.moistureReadings,
    scopeItems: inspection.scopeItems,
    costEstimates: inspection.costEstimates,
    evidenceItems: inspection.evidenceItems,
  };

  // ── Build the PDF ────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Dispute Defence Pack - ${data.inspection.inspectionNumber}`);
  pdfDoc.setSubject("IICRC S500:2025 Compliant Dispute Evidence Package");
  pdfDoc.setCreator("RestoreAssist");
  pdfDoc.setProducer("RestoreAssist (pdf-lib)");

  const w = new PDFWriter(pdfDoc);
  await w.init();

  // ────────────────────────────────────────────────────────────────────────
  // 1. COVER PAGE
  // ────────────────────────────────────────────────────────────────────────
  drawCoverPage(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 2. EXECUTIVE SUMMARY
  // ────────────────────────────────────────────────────────────────────────
  w.newPage();
  drawExecutiveSummary(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 3. EVIDENCE TIMELINE
  // ────────────────────────────────────────────────────────────────────────
  drawEvidenceTimeline(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 4. MOISTURE READING PROGRESSION
  // ────────────────────────────────────────────────────────────────────────
  drawMoistureProgression(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 5. SCOPE OF WORKS
  // ────────────────────────────────────────────────────────────────────────
  drawScopeOfWorks(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 6. STANDARDS ATTESTATION
  // ────────────────────────────────────────────────────────────────────────
  drawStandardsAttestation(w, data);

  // ────────────────────────────────────────────────────────────────────────
  // 7. CHAIN OF CUSTODY APPENDIX
  // ────────────────────────────────────────────────────────────────────────
  drawChainOfCustody(w, data);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// ── Section Renderers ──────────────────────────────────────────────────────────

function drawCoverPage(w: PDFWriter, data: DisputePackData): void {
  const page = w.getPage();
  const boldFont = w.getBoldFont();
  const font = w.getFont();

  // Navy header bar
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 80,
    width: PAGE_W,
    height: 80,
    color: NAVY,
  });

  page.drawText("RestoreAssist", {
    x: MARGIN,
    y: PAGE_H - 35,
    size: 22,
    font: boldFont,
    color: WHITE,
  });

  page.drawText("DISPUTE DEFENCE PACK", {
    x: MARGIN,
    y: PAGE_H - 60,
    size: 14,
    font: font,
    color: LIGHT_ACCENT,
  });

  // Accent stripe
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 84,
    width: PAGE_W,
    height: 4,
    color: WARM_ACCENT,
  });

  // Main content area
  w.skip(120);

  // Inspection reference box
  w.getPage().drawRectangle({
    x: MARGIN,
    y: w.getY() - 4,
    width: CONTENT_WIDTH,
    height: 40,
    color: LIGHT_GRAY,
  });
  w.getPage().drawText("INSPECTION REFERENCE", {
    x: MARGIN + 10,
    y: w.getY() + 16,
    size: 8,
    font: font,
    color: SECONDARY,
  });
  w.getPage().drawText(sanitize(data.inspection.inspectionNumber), {
    x: MARGIN + 10,
    y: w.getY(),
    size: 16,
    font: boldFont,
    color: NAVY,
  });
  w.skip(52);

  // Key details
  w.kvPair("Property Address", data.inspection.propertyAddress);
  w.kvPair("Postcode", data.inspection.propertyPostcode);
  w.kvPair("Technician", data.inspection.technicianName ?? "Not specified");
  w.kvPair("Inspection Date", fmtDate(data.inspection.inspectionDate));
  w.kvPair("Submitted", fmtDate(data.inspection.submittedAt));
  w.kvPair("Processed", fmtDate(data.inspection.processedAt));
  w.kvPair("Status", data.inspection.status);

  w.skip(20);

  // Classification summary if available
  if (data.classifications.length > 0) {
    const primary = data.classifications[0];
    w.subHeading("Primary Classification");
    w.kvPair("Category", `${primary.category} (${primary.standardReference})`);
    w.kvPair("Class", primary.class);
    if (primary.confidence != null) {
      w.kvPair("Confidence", `${primary.confidence.toFixed(0)}%`);
    }
  }

  w.skip(30);
  w.hr();
  w.skip(10);

  w.drawText(`Generated: ${fmtDateTime(new Date())}`, {
    size: 8,
    color: SECONDARY,
  });
  w.drawText(
    "Prepared in accordance with IICRC S500:2025 Standard and Reference Guide for Professional Water Damage Restoration",
    { size: 8, color: SECONDARY },
  );
  w.drawText(
    "This document is intended for dispute resolution and insurance claim adjudication purposes.",
    { size: 8, color: SECONDARY },
  );
}

function drawExecutiveSummary(w: PDFWriter, data: DisputePackData): void {
  w.heading("Executive Summary");

  // Classification details
  if (data.classifications.length > 0) {
    const primary = data.classifications[0];
    w.subHeading("Damage Classification (IICRC S500:2025)");

    const catDesc: Record<string, string> = {
      "1": "Category 1 - Clean Water (IICRC S500:2025 \u00A76.1.1)",
      "2": "Category 2 - Grey Water (IICRC S500:2025 \u00A76.1.2)",
      "3": "Category 3 - Black Water (IICRC S500:2025 \u00A76.1.3)",
    };
    const classDesc: Record<string, string> = {
      "1": "Class 1 - Least amount of water absorption (IICRC S500:2025 \u00A76.2.1)",
      "2": "Class 2 - Significant water absorption (IICRC S500:2025 \u00A76.2.2)",
      "3": "Class 3 - Greatest amount of water absorption (IICRC S500:2025 \u00A76.2.3)",
      "4": "Class 4 - Specialty drying situations (IICRC S500:2025 \u00A76.2.4)",
    };

    w.kvPair(
      "Water Category",
      catDesc[primary.category] ?? `Category ${primary.category}`,
    );
    w.kvPair(
      "Damage Class",
      classDesc[primary.class] ?? `Class ${primary.class}`,
    );
    w.skip(4);
    w.drawText(primary.justification, { size: 8, color: SECONDARY });
    w.skip(8);
  }

  // Affected areas summary
  if (data.affectedAreas.length > 0) {
    w.subHeading("Affected Areas");
    const totalSqFt = data.affectedAreas.reduce(
      (sum, a) => sum + a.affectedSquareFootage,
      0,
    );
    w.kvPair("Total Affected Areas", String(data.affectedAreas.length));
    w.kvPair("Total Affected Area", `${totalSqFt.toFixed(1)} sq ft`);
    w.skip(4);

    for (const area of data.affectedAreas) {
      w.drawText(
        `- ${area.roomZoneId}: ${area.affectedSquareFootage} sq ft | Source: ${area.waterSource}${area.category ? ` | Cat ${area.category}` : ""}${area.class ? ` / Class ${area.class}` : ""}`,
        { size: 8 },
      );
    }
    w.skip(8);
  }

  // Scope summary
  if (data.scopeItems.length > 0) {
    w.subHeading("Scope Summary");
    w.kvPair("Selected Scope Items", String(data.scopeItems.length));
  }

  // Cost summary
  if (data.costEstimates.length > 0) {
    const totalValue = data.costEstimates.reduce((s, c) => s + c.total, 0);
    const gst = totalValue * 0.1;
    w.subHeading("Estimated Value");
    w.kvPair("Subtotal (ex GST)", fmtCurrency(totalValue));
    w.kvPair("GST (10%)", fmtCurrency(gst));
    w.kvPair("Total (inc GST)", fmtCurrency(totalValue + gst));
  }

  // Evidence count summary
  w.skip(10);
  w.subHeading("Evidence Overview");
  w.kvPair("Total Evidence Items", String(data.evidenceItems.length));
  w.kvPair("Moisture Readings", String(data.moistureReadings.length));

  const verified = data.evidenceItems.filter((e) => e.hashSha256).length;
  w.kvPair("Items with Chain-of-Custody Hash", String(verified));
}

function drawEvidenceTimeline(w: PDFWriter, data: DisputePackData): void {
  if (data.evidenceItems.length === 0) return;

  w.heading("Evidence Timeline");
  w.drawText(
    "All evidence items captured during the inspection, ordered chronologically. Each item includes IICRC S500:2025 section references and chain-of-custody hash.",
    { size: 8, color: SECONDARY },
  );
  w.skip(8);

  // Table columns
  const cols = [
    { label: "Timestamp", x: MARGIN, width: 80 },
    { label: "Evidence Class", x: MARGIN + 82, width: 70 },
    { label: "Description", x: MARGIN + 154, width: 130 },
    { label: "S500 Section", x: MARGIN + 286, width: 75 },
    { label: "GPS", x: MARGIN + 363, width: 80 },
    { label: "Custody Hash", x: MARGIN + 445, width: 50 },
  ];

  w.tableHeaderRow(cols);

  for (const item of data.evidenceItems) {
    w.tableRow([
      {
        text: fmtDateTime(item.capturedAt),
        x: cols[0].x,
        width: cols[0].width,
      },
      {
        text: evidenceClassLabel(item.evidenceClass),
        x: cols[1].x,
        width: cols[1].width,
      },
      { text: item.title, x: cols[2].x, width: cols[2].width },
      {
        text: s500SectionForEvidenceClass(item.evidenceClass),
        x: cols[3].x,
        width: cols[3].width,
      },
      {
        text: fmtGps(item.capturedLat, item.capturedLng),
        x: cols[4].x,
        width: cols[4].width,
      },
      {
        text: shortHash(item.hashSha256),
        x: cols[5].x,
        width: cols[5].width,
        color: item.hashSha256 ? GREEN : RED,
      },
    ]);
  }
}

function drawMoistureProgression(w: PDFWriter, data: DisputePackData): void {
  if (data.moistureReadings.length === 0) return;

  w.heading("Moisture Reading Progression");
  w.drawText(
    "Moisture readings grouped by location/room, showing progression over time against IICRC S500:2025 target levels (S500:2025 \u00A77.2).",
    { size: 8, color: SECONDARY },
  );
  w.skip(8);

  // Group readings by location
  const byLocation = new Map<string, typeof data.moistureReadings>();
  for (const reading of data.moistureReadings) {
    const key = reading.location;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key)!.push(reading);
  }

  const cols = [
    { label: "Date", x: MARGIN, width: 90 },
    { label: "Location", x: MARGIN + 92, width: 80 },
    { label: "Material", x: MARGIN + 174, width: 70 },
    { label: "Reading (%)", x: MARGIN + 246, width: 55 },
    { label: "Target (%)", x: MARGIN + 303, width: 55 },
    { label: "Status", x: MARGIN + 360, width: 60 },
  ];

  const entries = Array.from(byLocation.entries());
  for (let ei = 0; ei < entries.length; ei++) {
    const [location, readings] = [entries[ei][0], entries[ei][1]];
    w.subHeading(location);
    w.tableHeaderRow(cols);

    for (const r of readings) {
      const target = moistureTarget(r.surfaceType);
      const isAbove = r.moistureLevel > target;
      const status = isAbove ? "Above Target" : "Within Target";
      const statusColor = isAbove ? RED : GREEN;

      w.tableRow([
        { text: fmtDateTime(r.recordedAt), x: cols[0].x, width: cols[0].width },
        { text: r.location, x: cols[1].x, width: cols[1].width },
        { text: r.surfaceType, x: cols[2].x, width: cols[2].width },
        {
          text: r.moistureLevel.toFixed(1),
          x: cols[3].x,
          width: cols[3].width,
          color: isAbove ? RED : GREEN,
        },
        { text: target.toFixed(1), x: cols[4].x, width: cols[4].width },
        {
          text: status,
          x: cols[5].x,
          width: cols[5].width,
          color: statusColor,
        },
      ]);
    }
    w.skip(8);
  }
}

function drawScopeOfWorks(w: PDFWriter, data: DisputePackData): void {
  if (data.costEstimates.length === 0 && data.scopeItems.length === 0) return;

  w.heading("Scope of Works");
  w.drawText(
    "All selected scope items with quantities, rates, and IICRC S500:2025 references. Rates sourced from cost library or manual entry.",
    { size: 8, color: SECONDARY },
  );
  w.skip(8);

  // If we have cost estimates, show the costed table
  if (data.costEstimates.length > 0) {
    const cols = [
      { label: "Item", x: MARGIN, width: 150 },
      { label: "Qty", x: MARGIN + 152, width: 35 },
      { label: "Unit", x: MARGIN + 189, width: 40 },
      { label: "Rate", x: MARGIN + 231, width: 55 },
      { label: "Total", x: MARGIN + 288, width: 60 },
      { label: "S500 Reference", x: MARGIN + 350, width: 145 },
    ];

    w.tableHeaderRow(cols);

    for (const item of data.costEstimates) {
      // Try to find matching scope item for justification/S500 ref
      const scopeMatch = data.scopeItems.find(
        (s) =>
          s.description
            .toLowerCase()
            .includes(item.description.toLowerCase().slice(0, 20)) ||
          item.description
            .toLowerCase()
            .includes(s.description.toLowerCase().slice(0, 20)),
      );

      w.tableRow([
        { text: item.description, x: cols[0].x, width: cols[0].width },
        { text: item.quantity.toString(), x: cols[1].x, width: cols[1].width },
        { text: item.unit, x: cols[2].x, width: cols[2].width },
        { text: fmtCurrency(item.rate), x: cols[3].x, width: cols[3].width },
        { text: fmtCurrency(item.total), x: cols[4].x, width: cols[4].width },
        {
          text: scopeMatch?.justification ?? "IICRC S500:2025",
          x: cols[5].x,
          width: cols[5].width,
        },
      ]);
    }

    // Totals
    w.skip(4);
    w.hr();
    const total = data.costEstimates.reduce((s, c) => s + c.total, 0);
    const gst = total * 0.1;
    w.tableRow(
      [
        { text: "Subtotal (ex GST)", x: MARGIN, width: 280 },
        { text: "", x: MARGIN + 152, width: 35 },
        { text: "", x: MARGIN + 189, width: 40 },
        { text: "", x: MARGIN + 231, width: 55 },
        { text: fmtCurrency(total), x: MARGIN + 288, width: 60 },
        { text: "", x: MARGIN + 350, width: 145 },
      ],
      { bold: true },
    );
    w.tableRow(
      [
        { text: "GST (10%)", x: MARGIN, width: 280 },
        { text: "", x: MARGIN + 152, width: 35 },
        { text: "", x: MARGIN + 189, width: 40 },
        { text: "", x: MARGIN + 231, width: 55 },
        { text: fmtCurrency(gst), x: MARGIN + 288, width: 60 },
        { text: "", x: MARGIN + 350, width: 145 },
      ],
      { bold: true },
    );
    w.tableRow(
      [
        { text: "Total (inc GST)", x: MARGIN, width: 280 },
        { text: "", x: MARGIN + 152, width: 35 },
        { text: "", x: MARGIN + 189, width: 40 },
        { text: "", x: MARGIN + 231, width: 55 },
        { text: fmtCurrency(total + gst), x: MARGIN + 288, width: 60 },
        { text: "", x: MARGIN + 350, width: 145 },
      ],
      { bold: true },
    );
  } else {
    // Fallback: scope items without cost breakdown
    for (const item of data.scopeItems) {
      w.drawText(
        `- ${item.description}${item.quantity ? ` (${item.quantity} ${item.unit ?? ""})` : ""}`,
        { size: 8 },
      );
      if (item.justification) {
        w.drawText(`  Justification: ${item.justification}`, {
          size: 7,
          color: SECONDARY,
        });
      }
    }
  }
}

function drawStandardsAttestation(w: PDFWriter, data: DisputePackData): void {
  w.heading("Standards Attestation");
  w.skip(8);

  const attestation =
    "This report was prepared in accordance with IICRC S500:2025 Standard and Reference Guide " +
    "for Professional Water Damage Restoration. All evidence items are time-stamped, GPS-tagged " +
    "where device capabilities permit, and cryptographically hashed (SHA-256) for chain-of-custody " +
    "integrity. The inspection methodology follows the procedures outlined in IICRC S500:2025 " +
    "\u00A710 (Documentation) and \u00A77 (Monitoring and Evaluation).";

  w.drawText(attestation, { size: 9, color: TEXT_COLOR });
  w.skip(12);

  w.subHeading("Applicable Standards");
  w.drawText(
    "- IICRC S500:2025 Standard and Reference Guide for Professional Water Damage Restoration",
    { size: 8 },
  );
  w.drawText(
    "- IICRC S520:2015 Standard for Professional Mould Remediation (where applicable)",
    { size: 8 },
  );
  w.drawText(
    "- Australian Building Codes Board — National Construction Code 2022 (jurisdiction-specific requirements)",
    { size: 8 },
  );
  w.skip(12);

  w.subHeading("Technician Declaration");
  w.drawText(
    `I, ${sanitize(data.inspection.technicianName) || "[Technician Name]"}, declare that the information ` +
      "contained in this Dispute Defence Pack is true and correct to the best of my knowledge. " +
      "All measurements were taken using calibrated instruments in accordance with manufacturer " +
      "specifications and IICRC S500:2025 \u00A77 guidelines.",
    { size: 9 },
  );

  w.skip(30);
  w.drawText("Signature: ____________________________", { size: 9 });
  w.skip(6);
  w.drawText(
    `Name: ${sanitize(data.inspection.technicianName) || "____________________________"}`,
    { size: 9 },
  );
  w.skip(6);
  w.drawText(`Date: ${fmtDate(new Date())}`, { size: 9 });
}

function drawChainOfCustody(w: PDFWriter, data: DisputePackData): void {
  const hashItems = data.evidenceItems.filter((e) => e.hashSha256);
  if (hashItems.length === 0) return;

  w.heading("Appendix: Chain of Custody — SHA-256 Hashes");
  w.drawText(
    "Full cryptographic hashes for all evidence items. These hashes can be used to verify " +
      "that evidence has not been modified since capture (IICRC S500:2025 \u00A710.6).",
    { size: 8, color: SECONDARY },
  );
  w.skip(8);

  const cols = [
    { label: "Evidence Item", x: MARGIN, width: 180 },
    { label: "SHA-256 Hash", x: MARGIN + 182, width: 315 },
  ];

  w.tableHeaderRow(cols);

  for (const item of hashItems) {
    w.tableRow([
      { text: item.title, x: cols[0].x, width: cols[0].width },
      { text: item.hashSha256 ?? "", x: cols[1].x, width: cols[1].width },
    ]);
  }

  w.skip(12);
  w.drawText("End of Dispute Defence Pack", { size: 8, color: SECONDARY });
}
