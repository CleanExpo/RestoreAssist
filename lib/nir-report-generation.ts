/**
 * NIR Report Generation
 *
 * Generates PDF reports for NIR inspections.
 *
 * Changes from v1:
 *   - All `any` types replaced with NirReportInspectionData interface
 *   - Temperature units corrected: °F → °C (Australian standard)
 *   - Area units corrected: sq ft → m² (Australian metric standard)
 *   - Date formatting: en-AU locale (DD/MM/YYYY)
 *   - Standards Citations section added to PDF (for insurer audit trail)
 *   - passesMinimumStandard banner shown prominently in checklist section
 *   - Supplementary warnings surfaced in dedicated PDF section
 *   - Checklist items now show clauseRef and tier indicator
 */

import jsPDF from "jspdf";
import {
  generateVerificationChecklist,
  type InspectionForChecklist,
  type VerificationChecklistItem,
} from "./nir-verification-checklist";
import { resolveAreaSqm } from "./units";
import { reportStandardsFooterLine } from "./nir-standards-mapping";
import { stateFromPostcode } from "@/lib/anz/postcode-state";

// ─── SHARED TYPED INTERFACE ───────────────────────────────────────────────────
//
// Exported so report/route.ts can type the Prisma result against it.
// All field names match the Prisma schema — do not rename without a migration.
//
// Unit conventions (Australian):
//   Temperature — °C  (ambientTemperatureCelsius, dewPointCelsius)
//   Area        — m²  (affectedSquareMetres — preferred going forward;
//                       affectedSquareFootage preserved for backward compat)
//   Currency    — AUD

export interface NirEnvironmentalData {
  /** Celsius — required for drying target calculation (S500 §12.4) */
  ambientTemperatureCelsius: number;
  humidityPercent: number;
  dewPointCelsius?: number | null;
  airCirculation?: boolean | null;
}

export interface NirMoistureReading {
  id: string;
  location: string;
  surfaceType?: string | null;
  moistureLevel: number;
  depth?: string | null;
  recordedAt?: Date | string | null;
}

export interface NirAffectedArea {
  id: string;
  roomZoneId: string;
  /** Canonical affected area in m² (RA-7001). Null on un-backfilled legacy rows. */
  affectedAreaSqm?: number | null;
  /** @deprecated Legacy sq-ft value; kept for the fallback path via resolveAreaSqm. */
  affectedSquareFootage: number;
  waterSource?: string | null;
  timeSinceLoss?: number | null;
  category?: string | null;
  class?: string | null;
}

export interface NirClassification {
  id: string;
  category: string;
  class: string;
  justification: string;
  /** Legacy single-string reference e.g. "IICRC S500 §7.1" */
  standardReference: string;
  /** Typed clause refs from v2.0 classification engine */
  clauseRefs?: string[] | null;
  confidence?: number | null;
}

export interface NirScopeItem {
  id: string;
  itemType?: string | null;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  justification?: string | null;
  standardReference?: string | null;
  isRequired?: boolean | null;
  isSelected?: boolean | null;
}

export interface NirCostEstimateItem {
  id: string;
  category?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  rate: number;
  subtotal: number;
  contingency?: number | null;
  total: number;
}

export interface NirPhoto {
  id: string;
  url?: string | null;
  location?: string | null;
  timestamp?: Date | string | null;
  category?: string | null;
}

export interface NirBusinessInfo {
  businessName?: string | null;
  businessABN?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
}

export interface NirFloorPlanStatus {
  label: string;
  source: "rendered_sketch" | "uploaded_floor_plan";
  status: "included" | "unavailable";
  reason?: string;
}

export interface NirClaimSketch {
  floorNumber: number;
  floorLabel: string;
  renderedPngUrl: string | null;
  sketchData?: unknown;
  moisturePoints?: unknown;
}

export function describeNirFloorPlans(
  floorPlans: NirFloorPlanStatus[] | null | undefined,
): string[] {
  if (!floorPlans?.length) {
    return ["No floor plan was supplied for this inspection."];
  }

  return floorPlans.map((floorPlan) => {
    if (floorPlan.status === "included") {
      return `${floorPlan.label}: included as a floor-plan page.`;
    }

    return `${floorPlan.label}: unavailable${floorPlan.reason ? ` — ${floorPlan.reason}` : "."}`;
  });
}

/**
 * The full typed shape of an inspection as fetched by the report route.
 * Matches the Prisma query in app/api/inspections/[id]/report/route.ts.
 */
export interface NirReportInspectionData {
  id: string;
  inspectionNumber?: string | null;
  propertyAddress?: string | null;
  propertyPostcode?: string | null;
  /** "AU" | "NZ" — Inspection.propertyCountry, default "AU" (RA-6996). */
  propertyCountry?: string | null;
  inspectionDate?: Date | string | null;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  technicianName?: string | null;
  status: string;
  environmentalData?: NirEnvironmentalData | null;
  moistureReadings: NirMoistureReading[];
  affectedAreas: NirAffectedArea[];
  classifications: NirClassification[];
  scopeItems: NirScopeItem[];
  costEstimates: NirCostEstimateItem[];
  photos: NirPhoto[];
  floorPlanImageUrl?: string | null;
  claimSketches?: NirClaimSketch[];
  floorPlans?: NirFloorPlanStatus[];
  report?: { user?: NirBusinessInfo | null } | null;
}

// ─── PDF LAYOUT HELPERS ───────────────────────────────────────────────────────

const AU_DATE = (date: Date | string | null | undefined): string =>
  date ? new Date(date).toLocaleDateString("en-AU") : "—";

const AUD = (amount: number): string => `$${amount.toFixed(2)} AUD`;

const TIER_PREFIX: Record<VerificationChecklistItem["tier"], string> = {
  critical: "● ", // filled circle — must pass
  supplementary: "○ ", // open circle   — flagged if absent
  quality: "◆ ", // diamond       — advisory
};

// ─── PDF GENERATION ───────────────────────────────────────────────────────────

export async function generateNIRPDF(
  inspection: NirReportInspectionData,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = 20;
  const pageH = doc.internal.pageSize.height;
  const pageW = doc.internal.pageSize.width;
  const margin = 20;
  const contentW = pageW - 2 * margin;

  const newPageIfNeeded = (space = 7) => {
    if (y + space > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const text = (
    content: string,
    size = 11,
    bold = false,
    align: "left" | "center" | "right" = "left",
  ) => {
    newPageIfNeeded();
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(content, contentW);
    doc.text(lines, align === "center" ? pageW / 2 : margin, y, { align });
    y += lines.length * (size * 0.4) + 2;
  };

  const rule = () => {
    newPageIfNeeded(4);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const section = (title: string) => {
    y += 4;
    rule();
    text(title, 13, true);
    y += 2;
  };

  // ── Header ─────────────────────────────────────────────────────────────────

  text("National Inspection Report (NIR)", 20, true, "center");
  y += 3;
  text(
    `Inspection No: ${inspection.inspectionNumber ?? inspection.id}`,
    11,
    false,
    "center",
  );

  const business = inspection.report?.user;
  if (business?.businessName) {
    y += 2;
    text(business.businessName, 10, false, "center");
    if (business.businessABN)
      text(`ABN: ${business.businessABN}`, 9, false, "center");
    if (business.businessPhone)
      text(business.businessPhone, 9, false, "center");
    if (business.businessEmail)
      text(business.businessEmail, 9, false, "center");
  }

  y += 6;

  // ── Property Information ───────────────────────────────────────────────────

  section("Property Information");
  text(`Address:         ${inspection.propertyAddress ?? "—"}`, 11);
  text(`Postcode:        ${inspection.propertyPostcode ?? "—"}`, 11);
  text(`Inspection date: ${AU_DATE(inspection.inspectionDate)}`, 11);
  if (inspection.technicianName) {
    text(`Technician:      ${inspection.technicianName}`, 11);
  }

  // ── Environmental Data (°C) ────────────────────────────────────────────────

  if (inspection.environmentalData) {
    const env = inspection.environmentalData;
    section("Environmental Conditions  (IICRC S500 §12.4)");
    text(`Ambient temperature: ${env.ambientTemperatureCelsius}°C`, 11);
    text(`Relative humidity:   ${env.humidityPercent}%`, 11);
    if (env.dewPointCelsius != null) {
      text(`Dew point:           ${env.dewPointCelsius}°C`, 11);
    }
    if (env.airCirculation != null) {
      text(`Air circulation:     ${env.airCirculation ? "Yes" : "No"}`, 11);
    }
  }

  // ── IICRC Classification ───────────────────────────────────────────────────

  if (inspection.classifications.length > 0) {
    const cls = inspection.classifications[0];
    const clauses = cls.clauseRefs?.join("; ") ?? cls.standardReference;

    section("IICRC Classification");
    text(`Category: ${cls.category}`, 11, true);
    text(`Class:    ${cls.class}`, 11, true);
    y += 2;
    text("Justification:", 10, true);
    text(cls.justification, 9);
    text(`Standards reference: ${clauses}`, 9);
    if (cls.confidence != null) {
      text(
        `Classification confidence: ${Math.round(cls.confidence * 100)}%`,
        9,
      );
    }
  }

  // ── Moisture Readings ──────────────────────────────────────────────────────

  if (inspection.moistureReadings.length > 0) {
    section(
      `Moisture Readings  (IICRC S500 §12.3)  — ${inspection.moistureReadings.length} reading(s)`,
    );
    inspection.moistureReadings.forEach((r, i) => {
      text(
        `${i + 1}. ${r.location} — ${r.surfaceType ?? "unknown material"}: ${r.moistureLevel}%${r.depth ? ` (${r.depth})` : ""}`,
        10,
      );
    });
  }

  // ── Affected Areas (m²) ────────────────────────────────────────────────────

  if (inspection.affectedAreas.length > 0) {
    section("Affected Areas");
    inspection.affectedAreas.forEach((area, i) => {
      text(
        `${i + 1}. ${area.roomZoneId}: ${resolveAreaSqm(area).toFixed(1)} m²`,
        10,
      );
      text(`   Water source: ${area.waterSource ?? "—"}`, 10);
      if (area.timeSinceLoss != null) {
        text(`   Time since loss: ${area.timeSinceLoss} hrs`, 10);
      }
      if (area.category && area.class) {
        text(
          `   Classification: Category ${area.category}, Class ${area.class}`,
          10,
        );
      }
      y += 1;
    });
  }

  // ── Floor Plans ───────────────────────────────────────────────────────────

  section("Floor Plans");
  describeNirFloorPlans(inspection.floorPlans).forEach((line) =>
    text(line, 10),
  );

  // ── Scope of Works ─────────────────────────────────────────────────────────

  if (inspection.scopeItems.length > 0) {
    section("Scope of Works");
    inspection.scopeItems.forEach((item, i) => {
      // Append IICRC clause reference inline so it's visible on every line item
      // Source: ScopeItem.justification carries the standards citation (IICRC S500, S520, etc.)
      const iicrcRef = item.justification ? ` [${item.justification}]` : "";
      text(`${i + 1}. ${item.description}${iicrcRef}`, 10);
      if (item.quantity != null && item.unit) {
        text(`   Quantity: ${item.quantity} ${item.unit}`, 10);
      }
      if (item.standardReference) {
        text(`   Standard ref: ${item.standardReference}`, 9);
      }
      y += 1;
    });
  }

  // ── Cost Estimate (AUD) ────────────────────────────────────────────────────

  if (inspection.costEstimates.length > 0) {
    const subtotal = inspection.costEstimates.reduce(
      (s, i) => s + i.subtotal,
      0,
    );
    const contingency = inspection.costEstimates.reduce(
      (s, i) => s + (i.contingency ?? 0),
      0,
    );
    const total = inspection.costEstimates.reduce((s, i) => s + i.total, 0);

    section("Cost Estimate");
    inspection.costEstimates.forEach((item) => {
      text(
        `${item.description}: ${item.quantity} ${item.unit ?? ""} @ ${AUD(item.rate)} = ${AUD(item.subtotal)}`,
        10,
      );
    });
    y += 3;
    text(`Subtotal:    ${AUD(subtotal)}`, 11);
    text(`Contingency: ${AUD(contingency)}`, 11);
    text(`Total:       ${AUD(total)}`, 12, true);
  }

  // ── Verification Checklist ────────────────────────────────────────────────
  //
  // Cast to InspectionForChecklist — all fields are compatible.
  // The checklist produces passesMinimumStandard, standardsCitations,
  // supplementaryWarnings, and per-item clauseRef + tier.

  const checklistInput: InspectionForChecklist = {
    id: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    status: inspection.status,
    propertyAddress: inspection.propertyAddress,
    propertyPostcode: inspection.propertyPostcode,
    inspectionDate: inspection.inspectionDate,
    completedAt: inspection.completedAt,
    updatedAt: inspection.updatedAt,
    technicianName: inspection.technicianName,
    environmentalData: inspection.environmentalData
      ? {
          ambientTemperatureCelsius:
            inspection.environmentalData.ambientTemperatureCelsius,
          humidityPercent: inspection.environmentalData.humidityPercent,
          // null → undefined: EnvironmentalDataForChecklist.dewPointCelsius is number | undefined
          dewPointCelsius:
            inspection.environmentalData.dewPointCelsius ?? undefined,
        }
      : null,
    moistureReadings: inspection.moistureReadings,
    affectedAreas: inspection.affectedAreas,
    // Map null fields → undefined to satisfy ClassificationForChecklist / ScopeItemForChecklist
    classifications: inspection.classifications.map((c) => ({
      category: c.category,
      class: c.class,
      justification: c.justification,
      standardReference: c.standardReference,
      clauseRefs: c.clauseRefs ?? undefined,
      confidence: c.confidence ?? undefined,
    })),
    scopeItems: inspection.scopeItems.map((s) => ({
      description: s.description,
      itemType: s.itemType ?? undefined,
      isRequired: s.isRequired ?? undefined,
    })),
    costEstimates: inspection.costEstimates.map((c) => ({
      total: c.total,
      category: c.category ?? undefined,
    })),
    photos: inspection.photos,
  };

  const checklist = generateVerificationChecklist(checklistInput);

  section("Verification Checklist — For Adjuster / Insurer Review");

  // Pass/fail banner
  const bannerText = checklist.passesMinimumStandard
    ? "✓ MEETS MINIMUM NIR STANDARD"
    : "✗ DOES NOT YET MEET MINIMUM NIR STANDARD — see critical items below";
  newPageIfNeeded(12);
  doc.setFillColor(
    checklist.passesMinimumStandard ? 220 : 255,
    checklist.passesMinimumStandard ? 255 : 220,
    220,
  );
  doc.rect(margin, y - 2, contentW, 10, "F");
  text(bannerText, 11, true, "center");
  y += 4;

  text("Legend: ● Critical  ○ Supplementary  ◆ Quality advisory", 8);
  y += 3;

  checklist.items.forEach((item) => {
    const mark = item.verified ? "✓" : "□";
    const prefix = TIER_PREFIX[item.tier];
    text(
      `${mark} ${prefix}${item.item}`,
      10,
      item.tier === "critical" && !item.verified,
    );
    if (item.clauseRef) {
      text(`   Ref: ${item.clauseRef}`, 8);
    }
    if (item.notes) {
      text(`   ${item.notes}`, 8);
    }
    y += 1;
  });

  // Supplementary warnings
  if (checklist.supplementaryWarnings.length > 0) {
    y += 3;
    text("Follow-up required before final report:", 10, true);
    checklist.supplementaryWarnings.forEach((w) => {
      text(`  • ${w}`, 9);
    });
  }

  // ── IICRC Standards Citations ─────────────────────────────────────────────

  section("IICRC Standards Referenced");
  text(
    "This report cites the following IICRC clauses. All references are to current editions.",
    9,
  );
  y += 2;

  const cited = checklist.standardsCitations.filter(
    (c) => c.status === "CITED",
  );
  const missing = checklist.standardsCitations.filter(
    (c) => c.status === "MISSING",
  );

  if (cited.length > 0) {
    text("Cited:", 10, true);
    cited.forEach((c) => {
      text(`  ${c.standard} ${c.clauseRef} — ${c.field}`, 9);
    });
  }

  if (missing.length > 0) {
    y += 2;
    text("Missing (data not recorded at submission):", 10, true);
    missing.forEach((c) => {
      text(`  ${c.standard} ${c.clauseRef} — ${c.field}`, 9);
    });
  }

  // ── Signature Block ────────────────────────────────────────────────────────

  newPageIfNeeded(40);
  section("Signatures");

  text("Technician:", 11, true);
  text("_______________________________", 11);
  text(inspection.technicianName ?? "", 10);
  text(`Date: ${AU_DATE(inspection.inspectionDate)}`, 10);
  y += 5;

  text("Reviewer:", 11, true);
  text("_______________________________", 11);
  text(`Date: ${AU_DATE(new Date())}`, 10);

  // ── Footer ─────────────────────────────────────────────────────────────────

  newPageIfNeeded(12);
  y += 5;
  rule();
  text(
    `Report generated: ${new Date().toLocaleString("en-AU")}`,
    8,
    false,
    "center",
  );
  // Jurisdiction, state and date all come off the Inspection.
  //
  // An earlier revision of this comment said `propertyCountry` was not on the
  // Inspection model and cited RA-1120. That was wrong: the field landed in
  // RA-6996 (prisma/schema.prisma, "schema-drift reconciliation, verified against
  // prod 2026-07-05") and RA-1120's TODO in lib/compliance/nzbs-compliance-gate.ts
  // is stale. No migration is needed to make this footer correct.
  //
  // The state falls back to null rather than a guess when the postcode cannot be
  // resolved; reportStandardsFooterLine then uses the edition in force in every
  // Australian jurisdiction, which understates rather than overstates.
  const footerJurisdiction =
    inspection.propertyCountry === "NZ" ? "NZ" : "AU";
  const footerState = stateFromPostcode(inspection.propertyPostcode);
  const footerAsAt = inspection.inspectionDate
    ? new Date(inspection.inspectionDate).toISOString().slice(0, 10)
    : undefined;

  text(
    `Generated by RestoreAssist. Standards: ${reportStandardsFooterLine(footerJurisdiction, footerState, footerAsAt)}.`,
    8,
    false,
    "center",
  );

  const pdfBlob = doc.output("blob");
  return Buffer.from(await pdfBlob.arrayBuffer());
}
