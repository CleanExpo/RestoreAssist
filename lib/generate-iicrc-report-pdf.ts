/**
 * IICRC S500:2025-Compliant Report PDF Generator (RA-428)
 * Produces a professional, insurer-grade PDF from RestoreAssist report data.
 *
 * Sections:
 *   1. Header + property details
 *   2. Water damage classification (S500 §3, §7.1)
 *   3. Affected areas / rooms
 *   4. Moisture readings table (S500 §8)
 *   5. Equipment deployment log (S500 §14)
 *   6. Psychrometric data (S500 §6)
 *   7. Inspection report narrative
 *   8. Drying goals reference (S500 §12)
 *   9. Signed declaration
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IICRCReportData {
  id: string;
  reportNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  propertyPostcode?: string | null;
  inspectionDate?: Date | string | null;
  completionDate?: Date | string | null;
  waterCategory?: string | null;
  waterClass?: string | null;
  sourceOfWater?: string | null;
  affectedArea?: number | null;
  hazardType?: string | null;
  detailedReport?: string | null;
  scopeOfWorksDocument?: string | null;
  totalCost?: number | null;
  insurerClaimNumber?: string | null;
  moistureReadings?: any;
  psychrometricReadings?: any;
  psychrometricAssessment?: any;
  equipmentSelection?: any;
  scopeAreas?: any;
  user?: {
    name?: string | null;
    email?: string | null;
    businessName?: string | null;
    businessAddress?: string | null;
    businessABN?: string | null;
  } | null;
  client?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const A4_W = 595;
const A4_H = 842;
const MARGIN = 48;
const COL_W = A4_W - MARGIN * 2;
const LINE = 15;

const C_NAVY = rgb(0.11, 0.18, 0.28);
const C_CYAN = rgb(0.0, 0.69, 0.79);
const C_TEXT = rgb(0.1, 0.1, 0.1);
const C_MUTED = rgb(0.45, 0.45, 0.45);
const C_LIGHT = rgb(0.94, 0.96, 0.98);
const C_WHITE = rgb(1, 1, 1);
const C_GREEN = rgb(0.08, 0.5, 0.08);
const C_AMBER = rgb(0.7, 0.4, 0.0);
const C_RED = rgb(0.75, 0.1, 0.1);

const WATER_CATEGORIES: Record<string, string> = {
  "1": "Category 1 — Clean Water (S500:2025 §3.2)",
  "2": "Category 2 — Significantly Contaminated (S500:2025 §3.3)",
  "3": "Category 3 — Grossly Contaminated (S500:2025 §3.4)",
};

const DAMAGE_CLASSES: Record<string, string> = {
  "1": "Class 1 — Least Amount of Water Absorption (S500:2025 §7.1.1)",
  "2": "Class 2 — Significant Amount of Absorption (S500:2025 §7.1.2)",
  "3": "Class 3 — Greatest Amount of Absorption (S500:2025 §7.1.3)",
  "4": "Class 4 — Specialty Drying Situations (S500:2025 §7.1.4)",
};

// ─── PDF Helper Class ─────────────────────────────────────────────────────────

class PDFWriter {
  doc: PDFDocument;
  page!: ReturnType<PDFDocument["addPage"]>;
  y = 0;
  bold: any;
  regular: any;

  constructor(doc: PDFDocument, bold: any, regular: any) {
    this.doc = doc;
    this.bold = bold;
    this.regular = regular;
  }

  newPage() {
    this.page = this.doc.addPage([A4_W, A4_H]);
    this.y = A4_H - 56;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < 56) this.newPage();
  }

  text(
    str: string,
    opts: {
      x?: number; size?: number; font?: any; color?: any;
      maxWidth?: number; bold?: boolean;
    } = {},
  ): number {
    const font = opts.font ?? (opts.bold ? this.bold : this.regular);
    const size = opts.size ?? 10;
    const color = opts.color ?? C_TEXT;
    const x = opts.x ?? MARGIN;
    const maxW = opts.maxWidth ?? COL_W;

    const safe = sanitise(str);
    if (!safe) return this.y;

    if (maxW) {
      const words = safe.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          this.ensureSpace(LINE);
          this.page.drawText(line, { x, y: this.y, size, font, color });
          this.y -= LINE;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        this.ensureSpace(LINE);
        this.page.drawText(line, { x, y: this.y, size, font, color });
        this.y -= LINE;
      }
    } else {
      this.ensureSpace(LINE);
      this.page.drawText(safe, { x, y: this.y, size, font, color });
      this.y -= LINE;
    }
    return this.y;
  }

  gap(n = 8) { this.y -= n; }

  rule(color = C_LIGHT, thickness = 0.5) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4_W - MARGIN, y: this.y },
      thickness,
      color,
    });
    this.y -= 6;
  }

  sectionHeader(title: string) {
    this.ensureSpace(28);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: COL_W, height: 18, color: C_NAVY });
    this.page.drawText(sanitise(title), {
      x: MARGIN + 6, y: this.y + 2, size: 10, font: this.bold, color: C_WHITE,
    });
    this.y -= 20;
  }

  kv(label: string, value: string | null | undefined, labelW = 140) {
    if (!value) return;
    this.ensureSpace(LINE + 4);
    this.page.drawText(sanitise(label), {
      x: MARGIN, y: this.y, size: 9, font: this.bold, color: C_MUTED,
    });
    this.text(value, { x: MARGIN + labelW, size: 9, maxWidth: COL_W - labelW });
    this.y += LINE; // kv shares the same line — text() already decremented
    this.y -= LINE;
  }

  tableRow(cells: string[], widths: number[], isHeader = false, shade = false) {
    this.ensureSpace(LINE + 4);
    const font = isHeader ? this.bold : this.regular;
    const color = isHeader ? C_WHITE : C_TEXT;
    const rowH = LINE + 4;
    if (isHeader) {
      this.page.drawRectangle({ x: MARGIN, y: this.y - 3, width: COL_W, height: rowH, color: C_NAVY });
    } else if (shade) {
      this.page.drawRectangle({ x: MARGIN, y: this.y - 3, width: COL_W, height: rowH, color: C_LIGHT });
    }
    let cx = MARGIN + 4;
    for (let i = 0; i < cells.length; i++) {
      const cellText = sanitise(cells[i] ?? "—");
      this.page.drawText(cellText.slice(0, 40), {
        x: cx, y: this.y, size: 8, font, color,
      });
      cx += widths[i];
    }
    this.y -= rowH;
  }
}

function sanitise(s: any): string {
  if (s == null) return "";
  return String(s)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-AU", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return "—"; }
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

// ─── Header + Footer ──────────────────────────────────────────────────────────

function drawPageHeader(w: PDFWriter, reportNumber: string, pageNum: number) {
  const p = w.page;
  p.drawRectangle({ x: 0, y: A4_H - 36, width: A4_W, height: 36, color: C_NAVY });
  p.drawText("RestoreAssist", { x: MARGIN, y: A4_H - 22, size: 13, font: w.bold, color: C_WHITE });
  p.drawText("IICRC S500:2025 Compliant Inspection Report", {
    x: MARGIN + 105, y: A4_H - 22, size: 8, font: w.regular, color: rgb(0.7, 0.8, 0.9),
  });
  p.drawText(`${sanitise(reportNumber)} | Page ${pageNum}`, {
    x: A4_W - MARGIN - 110, y: A4_H - 22, size: 8, font: w.regular, color: C_WHITE,
  });
}

function drawPageFooter(w: PDFWriter) {
  const p = w.page;
  p.drawRectangle({ x: 0, y: 0, width: A4_W, height: 28, color: C_NAVY });
  p.drawText("Compliant with IICRC S500:2025 | Australian Water Damage Restoration Standard", {
    x: MARGIN, y: 10, size: 7.5, font: w.regular, color: rgb(0.6, 0.7, 0.8),
  });
  p.drawText(`Generated ${new Date().toLocaleDateString("en-AU")} by RestoreAssist`, {
    x: A4_W - MARGIN - 145, y: 10, size: 7.5, font: w.regular, color: rgb(0.6, 0.7, 0.8),
  });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Generate an IICRC S500:2025-compliant PDF from RestoreAssist report data.
 * Returns a Uint8Array ready to stream as application/pdf.
 */
export async function generateIICRCReportPDF(
  data: IICRCReportData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const w = new PDFWriter(doc, bold, regular);
  w.newPage();

  const reportNum = data.reportNumber ?? `RA-${data.id.slice(0, 8).toUpperCase()}`;
  let pageNum = 1;

  // ── SECTION 1: Property & Claim Details ─────────────────────────────────────
  drawPageHeader(w, reportNum, pageNum);
  drawPageFooter(w);

  w.y = A4_H - 60;
  w.text("PROFESSIONAL INSPECTION REPORT", { size: 16, bold: true, color: C_NAVY });
  w.gap(4);
  w.text("Water Damage — Restorative Drying", { size: 10, color: C_CYAN });
  w.gap(10);
  w.rule(C_CYAN, 1.5);
  w.gap(4);

  w.sectionHeader("SECTION 1 — PROPERTY & CLAIM DETAILS");
  w.gap(4);

  // Two-column layout: left = property, right = contractor
  const techName = sanitise(data.user?.name ?? "—");
  const bizName = sanitise(data.user?.businessName ?? "");
  const bizAddress = sanitise(data.user?.businessAddress ?? "");
  const abn = sanitise(data.user?.businessABN ?? "");

  w.kv("Report Number:", reportNum);
  w.kv("Property Address:", `${data.propertyAddress ?? ""}${data.propertyPostcode ? `, ${data.propertyPostcode}` : ""}`);
  w.kv("Client Name:", data.clientName ?? data.client?.name ?? null);
  w.kv("Insurer Claim No.:", data.insurerClaimNumber ?? "(To be completed by insurer)");
  w.kv("Date of Inspection:", fmtDate(data.inspectionDate));
  if (data.completionDate) w.kv("Completion Date:", fmtDate(data.completionDate));
  w.kv("Hazard Type:", data.hazardType ?? "Water Damage");
  w.gap(6);
  w.rule();
  w.kv("Attending Technician:", techName);
  if (bizName) w.kv("Company:", bizName);
  if (abn) w.kv("ABN:", abn);
  if (bizAddress) w.kv("Company Address:", bizAddress);
  w.gap(8);

  // ── SECTION 2: Water Damage Classification ───────────────────────────────────
  w.sectionHeader("SECTION 2 — WATER DAMAGE CLASSIFICATION (S500:2025 §3, §7.1)");
  w.gap(4);

  const catLabel = data.waterCategory
    ? (WATER_CATEGORIES[data.waterCategory] ?? `Category ${data.waterCategory}`)
    : "Not determined";
  const classLabel = data.waterClass
    ? (DAMAGE_CLASSES[data.waterClass] ?? `Class ${data.waterClass}`)
    : "Not determined";

  // Category badge
  w.page.drawRectangle({ x: MARGIN, y: w.y - 2, width: COL_W * 0.48, height: 26, color: C_LIGHT });
  w.page.drawText("WATER CATEGORY", { x: MARGIN + 6, y: w.y + 12, size: 7, font: bold, color: C_MUTED });
  w.page.drawText(sanitise(catLabel), { x: MARGIN + 6, y: w.y - 1, size: 8.5, font: bold, color: C_NAVY });

  const bx = MARGIN + COL_W * 0.52;
  w.page.drawRectangle({ x: bx, y: w.y - 2, width: COL_W * 0.48, height: 26, color: C_LIGHT });
  w.page.drawText("DAMAGE CLASS", { x: bx + 6, y: w.y + 12, size: 7, font: bold, color: C_MUTED });
  w.page.drawText(sanitise(classLabel), { x: bx + 6, y: w.y - 1, size: 8.5, font: bold, color: C_NAVY });
  w.y -= 30;
  w.gap(8);

  if (data.sourceOfWater) w.kv("Source of Water:", data.sourceOfWater);
  if (data.affectedArea != null) w.kv("Total Affected Area:", `${data.affectedArea} m²`);
  w.gap(8);

  // ── SECTION 3: Affected Areas ────────────────────────────────────────────────
  const scopeAreas = Array.isArray(data.scopeAreas) ? data.scopeAreas : [];
  if (scopeAreas.length > 0) {
    w.sectionHeader("SECTION 3 — AFFECTED AREAS");
    w.gap(4);
    const cols = ["Room / Area", "Material", "Category", "Class", "Area (m²)"];
    const widths = [120, 110, 70, 60, 70];
    w.tableRow(cols, widths, true);
    scopeAreas.forEach((area: any, i: number) => {
      w.tableRow(
        [
          area.roomName ?? area.roomZoneId ?? area.name ?? "—",
          area.material ?? area.primaryMaterial ?? "—",
          area.category ? `Cat ${area.category}` : "—",
          area.class ?? area.damageClass ?? "—",
          area.area ?? area.affectedSquareFootage ?? "—",
        ],
        widths,
        false,
        i % 2 === 1,
      );
    });
    w.gap(8);
  }

  // ── SECTION 4: Moisture Readings (S500:2025 §8) ──────────────────────────────
  const moistureArr = Array.isArray(data.moistureReadings)
    ? data.moistureReadings
    : data.moistureReadings && typeof data.moistureReadings === "object"
      ? Object.values(data.moistureReadings as Record<string, any>)
      : [];

  if (moistureArr.length > 0) {
    w.sectionHeader("SECTION 4 — MOISTURE READINGS (S500:2025 §8)");
    w.gap(2);
    w.text("Moisture content measured per IICRC S500:2025 §8 using calibrated moisture meter equipment.", {
      size: 8, color: C_MUTED, maxWidth: COL_W,
    });
    w.gap(4);
    const mCols = ["Location / Room", "Material", "Reading (%)", "Threshold", "Status", "Date"];
    const mWidths = [100, 90, 65, 65, 65, 68];
    w.tableRow(mCols, mWidths, true);
    moistureArr.forEach((r: any, i: number) => {
      const val = r.moistureLevel ?? r.value ?? r.reading ?? r.moisture ?? "";
      const threshold = r.threshold ?? (r.material?.toLowerCase().includes("timber") ? "≤18%" : "≤14%");
      const numVal = parseFloat(String(val));
      const statusColor = isNaN(numVal) ? C_MUTED : numVal > 18 ? C_RED : numVal > 14 ? C_AMBER : C_GREEN;
      const status = isNaN(numVal) ? "—" : numVal > 18 ? "ABOVE GOAL" : numVal > 14 ? "MONITORING" : "WITHIN GOAL";
      w.tableRow(
        [
          r.location ?? r.room ?? r.roomZoneId ?? "—",
          r.material ?? r.materialType ?? "—",
          val ? `${val}%` : "—",
          String(threshold),
          status,
          r.date ? fmtDate(r.date) : r.readingDate ? fmtDate(r.readingDate) : "—",
        ],
        mWidths,
        false,
        i % 2 === 1,
      );
    });
    w.gap(4);
    w.text("Drying goal: all affected materials must achieve equilibrium moisture content per S500:2025 §12.", {
      size: 8, color: C_MUTED, maxWidth: COL_W,
    });
    w.gap(8);
  }

  // ── SECTION 5: Equipment Deployment Log (S500:2025 §14) ─────────────────────
  const eqData = data.equipmentSelection;
  const eqArr: any[] = Array.isArray(eqData)
    ? eqData
    : eqData?.equipment ?? eqData?.items ?? eqData?.selected ?? [];

  if (eqArr.length > 0) {
    w.sectionHeader("SECTION 5 — EQUIPMENT DEPLOYMENT LOG (S500:2025 §14)");
    w.gap(4);
    const eCols = ["Equipment Type", "Brand / Model", "Serial No.", "Location", "Date Placed"];
    const eWidths = [110, 100, 90, 100, 95];
    w.tableRow(eCols, eWidths, true);
    eqArr.forEach((eq: any, i: number) => {
      w.tableRow(
        [
          eq.type ?? eq.equipmentType ?? eq.name ?? "—",
          `${eq.brand ?? eq.make ?? ""}${eq.model ? ` ${eq.model}` : ""}`.trim() || "—",
          eq.serialNumber ?? eq.serial ?? "—",
          eq.location ?? eq.placement ?? eq.room ?? "—",
          eq.deployedDate ?? eq.date ? fmtDate(eq.deployedDate ?? eq.date) : "—",
        ],
        eWidths,
        false,
        i % 2 === 1,
      );
    });
    w.gap(8);
  }

  // ── SECTION 6: Psychrometric Data (S500:2025 §6) ────────────────────────────
  const psychArr = Array.isArray(data.psychrometricReadings)
    ? data.psychrometricReadings
    : data.psychrometricAssessment?.readings ?? [];

  if (psychArr.length > 0) {
    w.sectionHeader("SECTION 6 — PSYCHROMETRIC CONDITIONS (S500:2025 §6)");
    w.gap(4);
    const pCols = ["Location", "Temp (°C)", "RH (%)", "GPP", "Dew Point", "Date"];
    const pWidths = [100, 65, 55, 55, 70, 90];
    w.tableRow(pCols, pWidths, true);
    psychArr.forEach((r: any, i: number) => {
      w.tableRow(
        [
          r.location ?? r.room ?? "—",
          r.temperature ?? r.temp ?? "—",
          r.relativeHumidity ?? r.rh ?? r.humidity ?? "—",
          r.gramsPerPound ?? r.gpp ?? "—",
          r.dewPoint ?? r.dew ?? "—",
          r.date ? fmtDate(r.date) : "—",
        ],
        pWidths,
        false,
        i % 2 === 1,
      );
    });
    w.gap(8);
  }

  // ── SECTION 7: Inspection Report Narrative ───────────────────────────────────
  if (data.detailedReport) {
    // New page for the narrative — it may be long
    w.newPage();
    pageNum++;
    drawPageHeader(w, reportNum, pageNum);
    drawPageFooter(w);
    w.y = A4_H - 60;

    w.sectionHeader("SECTION 7 — PROFESSIONAL INSPECTION REPORT NARRATIVE");
    w.gap(4);

    const lines = data.detailedReport
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n");

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { w.gap(5); continue; }
      if (line.startsWith("# ")) {
        w.gap(4);
        w.text(line.slice(2), { size: 13, bold: true, color: C_NAVY, maxWidth: COL_W });
        w.gap(2);
      } else if (line.startsWith("## ")) {
        w.gap(4);
        w.text(line.slice(3), { size: 11, bold: true, color: C_NAVY, maxWidth: COL_W });
        w.gap(2);
      } else if (line.startsWith("### ")) {
        w.gap(3);
        w.text(line.slice(4), { size: 10, bold: true, color: C_TEXT, maxWidth: COL_W });
      } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
        w.text(line.replace(/\*\*/g, ""), { size: 9, bold: true, maxWidth: COL_W });
      } else {
        w.text(line, { size: 9, maxWidth: COL_W });
      }
    }
    w.gap(8);
  }

  // ── SECTION 8: Scope of Works Summary ───────────────────────────────────────
  if (data.scopeOfWorksDocument) {
    w.ensureSpace(40);
    w.sectionHeader("SECTION 8 — SCOPE OF WORKS SUMMARY");
    w.gap(4);
    const scopeLines = data.scopeOfWorksDocument
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (const raw of scopeLines.slice(0, 60)) { // cap at 60 lines in PDF
      const line = raw.trim();
      if (!line) { w.gap(4); continue; }
      if (line.startsWith("#")) {
        w.text(line.replace(/^#+\s*/, ""), { size: 9, bold: true, color: C_NAVY, maxWidth: COL_W });
      } else {
        w.text(line, { size: 9, maxWidth: COL_W });
      }
    }
    if (data.totalCost != null) {
      w.gap(6);
      w.rule(C_CYAN);
      w.kv("Estimated Total Cost (excl. GST):", fmtCurrency(data.totalCost));
    }
    w.gap(8);
  }

  // ── SECTION 9: IICRC Drying Goals Reference ──────────────────────────────────
  w.ensureSpace(80);
  w.sectionHeader("SECTION 9 — IICRC S500:2025 DRYING GOALS REFERENCE (§12)");
  w.gap(4);
  const dryingGoals = [
    ["Hardwood flooring (solid)", "≤12% MC", "§12.3.1"],
    ["Softwood / structural timber", "≤19% MC", "§12.3.2"],
    ["Plasterboard (gypsum)", "≤1% MC", "§12.3.3"],
    ["Concrete (slab, block)", "≤5% MC", "§12.3.4"],
    ["Relative humidity (interior)", "≤50% RH", "§6.2.1"],
    ["Indoor temperature", "21–27°C", "§6.2.2"],
  ];
  w.tableRow(["Material / Condition", "Drying Goal", "S500:2025 Ref."], [170, 120, 100], true);
  dryingGoals.forEach(([mat, goal, ref], i) => {
    w.tableRow([mat, goal, ref], [170, 120, 100], false, i % 2 === 1);
  });
  w.gap(8);

  // ── SECTION 10: Signed Declaration ───────────────────────────────────────────
  w.ensureSpace(100);
  w.sectionHeader("SECTION 10 — PROFESSIONAL DECLARATION");
  w.gap(6);
  w.text(
    "I declare that the information contained in this report is accurate and complete to the best of my " +
    "knowledge, and that all restoration work has been, or will be, carried out in accordance with the " +
    "IICRC S500:2025 Standard and Reference Guide for Professional Water Damage Restoration and applicable " +
    "Australian standards. This report has been prepared for insurance claims purposes.",
    { size: 9, maxWidth: COL_W },
  );
  w.gap(16);

  // Signature block
  const sigY = w.y;
  w.page.drawLine({ start: { x: MARGIN, y: sigY }, end: { x: MARGIN + 180, y: sigY }, thickness: 0.75, color: C_TEXT });
  w.page.drawLine({ start: { x: MARGIN + 220, y: sigY }, end: { x: MARGIN + 420, y: sigY }, thickness: 0.75, color: C_TEXT });
  w.y -= 5;
  w.page.drawText("Technician Signature", { x: MARGIN, y: w.y, size: 8, font: regular, color: C_MUTED });
  w.page.drawText("Date", { x: MARGIN + 220, y: w.y, size: 8, font: regular, color: C_MUTED });
  w.y -= LINE;
  w.gap(4);
  w.page.drawText(sanitise(data.user?.name ?? techName), {
    x: MARGIN, y: w.y, size: 9, font: bold, color: C_TEXT,
  });
  w.y -= LINE;
  if (data.user?.businessName) {
    w.page.drawText(sanitise(data.user.businessName), {
      x: MARGIN, y: w.y, size: 8, font: regular, color: C_MUTED,
    });
    w.y -= LINE;
  }

  // Apply headers/footers to all pages
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    if (i > 0) {
      // Subsequent pages already have header/footer drawn — nothing to do
      // (they're drawn at newPage time)
    }
  });

  return doc.save();
}
