/**
 * WATER domain plug-in — RA-1717.
 *
 * First concrete domain. Reads an Inspection with its classifications,
 * affected areas, and moisture readings, and produces:
 *
 *   - report  — IICRC S500 grounded sections (situation, evidence,
 *               classification, scope rationale, drying targets)
 *   - scope   — ScopeItem[] from lib/scope-dispatcher (prelims +
 *               water pathway, with IICRC clause refs inline)
 *   - estimate — line items × default AU rates × 10% GST
 *
 * Output is **rule-based and deterministic** — no AI required for V1.
 * AI prose enhancement is a follow-up wired through the budget guard.
 *
 * Reference: IICRC S500:2021 (Standard for Professional Water Damage
 * Restoration) Categories 1–3, Classes 1–4, dry-standards table.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import {
  generateScopeItems,
  type DamageType,
  type WaterCategory,
  type WaterClass,
} from "@/lib/scope-dispatcher";
import { IICRC_DRY_STANDARDS } from "@/lib/iicrc-dry-standards";
import type {
  AssessmentEstimate,
  AssessmentReport,
  DomainGenerateInput,
  DomainGenerateResult,
  DomainPlugin,
  EstimateLine,
  ReportSection,
  ScopeCategory,
  ScopeItem,
  StandardCitation,
} from "../types";

// ─── Pricing defaults ────────────────────────────────────────────────────────
// Conservative AU mid-2026 rates (ex GST). Workspaces with their own
// CostLibrary override these by passing `pricing` through; for V1 we
// fall back to baselines so the plug-in is usable out-of-the-box.

const DEFAULT_AU_PRICING = {
  masterQualifiedNormalHours: 120,
  qualifiedTechnicianNormalHours: 95,
  labourerNormalHours: 65,
  airMoverAxialDailyRate: 35,
  airMoverCentrifugalDailyRate: 45,
  dehumidifierLGRDailyRate: 110,
  dehumidifierDesiccantDailyRate: 250,
  afdUnitLargeDailyRate: 95,
  extractionTruckMountedHourlyRate: 220,
  extractionElectricHourlyRate: 90,
  injectionDryingSystemDailyRate: 180,
  antimicrobialTreatmentRate: 4.5, // per m²
  mouldRemediationTreatmentRate: 28, // per m²
  biohazardTreatmentRate: 65, // per m²
  administrationFee: 165,
  callOutFee: 220,
  thermalCameraUseCostPerAssessment: 95,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryFromClassification(c: {
  category?: string | null;
}): WaterCategory | null {
  // Classification.category is stored as e.g. "1", "2", "3" or "Cat 1".
  const raw = (c.category ?? "").toString().match(/[123]/);
  return raw ? (raw[0] as WaterCategory) : null;
}

function classFromClassification(c: {
  class?: string | null;
}): WaterClass | null {
  // Classification.class — single field, stored as "1"–"4" or "Class 1".
  const raw = (c.class ?? "").toString().match(/[1234]/);
  return raw ? (raw[0] as WaterClass) : null;
}

/**
 * S500 §12.5: drying days expected from class. Class 1 typically 3–5 days,
 * class 4 specialty up to 14+. We use upper-conservative midpoints so
 * the estimate doesn't under-call labour.
 */
function estimatedDaysForClass(c: WaterClass): number {
  switch (c) {
    case "1":
      return 4;
    case "2":
      return 5;
    case "3":
      return 7;
    case "4":
      return 10;
  }
}

function categoryToScopeCategory(itemType: string): ScopeCategory {
  const t = itemType.toLowerCase();
  if (
    t.includes("equipment") ||
    t.includes("dehu") ||
    t.includes("air_mover") ||
    t.includes("hepa") ||
    t.includes("scrubber") ||
    t.includes("extraction")
  ) {
    return "EQUIPMENT";
  }
  if (t.includes("labour") || t.includes("technician") || t.includes("hours")) {
    return "LABOUR";
  }
  if (t.includes("disposal") || t.includes("waste") || t.includes("debris")) {
    return "DISPOSAL";
  }
  if (t.includes("ppe") || t.includes("protective")) return "PROTECTIVE";
  if (t.includes("test") || t.includes("monitor") || t.includes("thermal"))
    return "TESTING";
  if (
    t.includes("admin") ||
    t.includes("call_out") ||
    t.includes("mobilisation")
  ) {
    return "ADMIN";
  }
  return "MATERIALS";
}

function buildEstimate(
  scope: ScopeItem[],
  unitCostByItem: Map<string, number>,
  gst: GstTreatment,
): AssessmentEstimate {
  const lines: EstimateLine[] = scope.map((item) => {
    const rate = unitCostByItem.get(item.description) ?? 0;
    const lineTotalExGst = +(item.quantity * rate).toFixed(2);
    const gstAmount = +(lineTotalExGst * gst.rate).toFixed(2);
    const lineTotalIncGst = +(lineTotalExGst + gstAmount).toFixed(2);
    return {
      description: item.description,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      rate,
      lineTotalExGst,
      gstAmount,
      lineTotalIncGst,
    };
  });
  const subtotalExGst = +lines
    .reduce((s, l) => s + l.lineTotalExGst, 0)
    .toFixed(2);
  const gstTotal = +lines.reduce((s, l) => s + l.gstAmount, 0).toFixed(2);
  const totalIncGst = +(subtotalExGst + gstTotal).toFixed(2);
  return {
    lines,
    totals: {
      subtotalExGst,
      gstTotal,
      totalIncGst,
      gstRate: gst.rate,
      currency: gst.currency,
    },
  };
}

function buildReport(args: {
  propertyAddress: string;
  category: WaterCategory;
  damageClass: WaterClass;
  affectedAreaM2: number;
  estimatedDays: number;
  moistureSummary: { wet: number; drying: number; dry: number; total: number };
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cite = (section: string, note?: string): StandardCitation => ({
    standard: "IICRC S500:2021",
    section,
    note,
  });

  const sections: ReportSection[] = [];

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified water-damage of ` +
      `Category ${args.category} (S500 §10.4.1) and Class ${args.damageClass} ` +
      `(S500 §10.4.3) over an affected area of ${args.affectedAreaM2.toFixed(1)} m². ` +
      `The classification drives the scope of works under the IICRC S500 ` +
      `Standard for Professional Water Damage Restoration.`,
    citations: [cite("§10.4.1"), cite("§10.4.3")],
  });

  sections.push({
    heading: "Evidence — moisture mapping",
    body:
      args.moistureSummary.total === 0
        ? `No moisture readings have been logged for this inspection. ` +
          `Per S500 §5 baseline psychrometric readings must be taken on ` +
          `entry and at least daily until the dry-standard is reached.`
        : `${args.moistureSummary.total} moisture readings logged: ` +
          `${args.moistureSummary.wet} above wet-standard, ` +
          `${args.moistureSummary.drying} in drying band, ` +
          `${args.moistureSummary.dry} at or below the IICRC dry-standard. ` +
          `Drying continues until all monitored materials are at or below ` +
          `the dry-standard for the material type (S500 §12.5.7).`,
    citations: [cite("§5"), cite("§12.5.7")],
  });

  sections.push({
    heading: "Scope rationale",
    body:
      `Scope items are generated from the IICRC S500 ${args.damageClass}-class ` +
      `pathway. Equipment quantities are ratio-driven, not estimated: ` +
      `air-mover and dehumidifier counts derive from affected area and ` +
      `psychrometric load. Antimicrobial application is included for ` +
      `Category 2/3 events (S500 §10.4.1 / §10.4.1) where biological ` +
      `contamination is presumed.`,
    citations: [cite("§10.4.1"), cite("§10.4.1"), cite("§12.5")],
  });

  sections.push({
    heading: "Estimated duration",
    body:
      `Expected dry-time for Class ${args.damageClass} damage is ` +
      `${args.estimatedDays} days under nominal conditions ` +
      `(ambient ~24 °C / 50% RH). Actual duration is governed by daily ` +
      `psychrometric monitoring; equipment is removed only when the ` +
      `dry-standard is met for every monitored material.`,
    citations: [cite("§12.5")],
  });

  // Dry-standard reference table (S500 baseline).
  const drySnippet = IICRC_DRY_STANDARDS.slice(0, 5)
    .map((d) => `${d.label} ≤ ${d.dryThreshold}%`)
    .join("; ");
  sections.push({
    heading: "Dry-standard reference",
    body:
      `Material targets used for verification: ${drySnippet}. ` +
      `Full table mirrored from lib/iicrc-dry-standards.ts.`,
    citations: [cite("§12.5.7", "Material-specific dry standards")],
  });

  const citations: StandardCitation[] = sections
    .flatMap((s) => s.citations ?? [])
    // Dedupe by section identity.
    .filter(
      (c, i, arr) =>
        arr.findIndex(
          (d) => d.standard === c.standard && d.section === c.section,
        ) === i,
    );

  return { report: { sections }, citations };
}

// ─── Plug-in ─────────────────────────────────────────────────────────────────

export const waterDomain: DomainPlugin = {
  domain: "WATER",
  label: "Water damage (IICRC S500)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: {
          id: true,
          propertyAddress: true,
          classifications: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { category: true, class: true },
          },
          affectedAreas: {
            select: { affectedSquareFootage: true },
          },
          moistureReadings: {
            select: { surfaceType: true, moistureLevel: true },
          },
        },
      });

      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      const cls = inspection.classifications[0];
      const cat = cls ? categoryFromClassification(cls) : null;
      const dc = cls ? classFromClassification(cls) : null;
      if (!cat || !dc) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "Inspection has no IICRC S500 classification. Capture category (1–3) and class (1–4) before generating.",
        };
      }

      // Note: AffectedArea.affectedSquareFootage is the canonical numeric
      // area on the model (legacy field name; treated as the inspection's
      // working area unit — kept consistent with the rest of the app).
      const affectedAreaM2 = inspection.affectedAreas.reduce(
        (sum, a) => sum + (a.affectedSquareFootage ?? 0),
        0,
      );
      const days = estimatedDaysForClass(dc);

      // Hand to the existing scope-dispatcher pathway.
      const drafts = generateScopeItems({
        damageType: "WATER" as DamageType,
        affectedAreaM2: Math.max(affectedAreaM2, 1),
        estimatedDays: days,
        pricingConfig: DEFAULT_AU_PRICING,
        waterCategory: cat,
        waterClass: dc,
      });

      const scope: ScopeItem[] = drafts.map((d) => ({
        description: d.description,
        category: categoryToScopeCategory(d.itemType),
        quantity: d.quantity ?? 1,
        unit: d.unit ?? "ea",
        // Some prelims items don't carry a clause ref upstream — for audit
        // we fall back to S500 §12.5 (general drying / restoration) so every
        // line on the scope has a defensible standard reference.
        iicrcRef: d.iicrcReference?.trim()
          ? d.iicrcReference
          : "IICRC S500:2021 §12.5",
        notes: d.justification,
      }));

      const unitCostByDescription = new Map(
        drafts
          .filter((d) => typeof d.unitCostAud === "number")
          .map((d) => [d.description, d.unitCostAud as number]),
      );

      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, unitCostByDescription, gst);

      // Moisture summary — classify each reading against the IICRC dry
      // standard for its surface type. Unknown materials count toward
      // total only.
      const moistureSummary = inspection.moistureReadings.reduce(
        (acc, r) => {
          acc.total += 1;
          const std = IICRC_DRY_STANDARDS.find(
            (s) =>
              s.material.toLowerCase() ===
              (r.surfaceType ?? "").toLowerCase().trim(),
          );
          if (!std) return acc;
          const lvl = r.moistureLevel ?? 0;
          if (lvl > std.wetThreshold) acc.wet += 1;
          else if (lvl > std.dryThreshold) acc.drying += 1;
          else acc.dry += 1;
          return acc;
        },
        { wet: 0, drying: 0, dry: 0, total: 0 },
      );

      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        category: cat,
        damageClass: dc,
        affectedAreaM2,
        estimatedDays: days,
        moistureSummary,
      });

      return {
        ok: true,
        data: {
          report,
          scope: { items: scope },
          estimate,
          citations,
          meta: {
            modelUsed: null,
            latencyMs: Date.now() - start,
            costEstimateUsd: 0,
            workspaceId: input.workspaceId,
          },
        },
      };
    } catch (err) {
      console.error("[assessments.water] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Water assessment generation failed",
      };
    }
  },
};
