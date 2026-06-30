/**
 * STORM domain plug-in — RA-1717.
 *
 * Fifth concrete domain. Reads an Inspection plus a domain-options
 * payload (`entryType` + `waterCategory`) and produces:
 *
 *   - report  — IICRC S500:2021 + AU NCC weatherproofing grounded
 *               sections (situation, entry-pathway analysis, water
 *               classification, scope rationale, drying targets,
 *               make-safe recommendations)
 *   - scope   — ScopeItem[] from lib/scope-storm::generateStormScope
 *               (extraction → drying → containment → rebuild prep,
 *               with S500 clause refs inline)
 *   - estimate — line items × default AU rates × 10% GST
 *
 * Storm-specific behaviour: flash_flood + stormwater_ingress
 * automatically elevate to Category 3 inside generateStormScope
 * (municipal/contaminated runoff). The plug-in surfaces the elevated
 * category in the report so the pilot sees the rationale.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import {
  generateStormScope,
  type StormEntryType,
  type StormWaterCategory,
} from "@/lib/scope-storm";
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

// ─── Pricing defaults ─────────────────────────────────────────────────────────

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
  antimicrobialTreatmentRate: 4.5,
  mouldRemediationTreatmentRate: 28,
  biohazardTreatmentRate: 65,
  administrationFee: 175,
  callOutFee: 240, // storm jobs typically after-hours / out-of-area
  thermalCameraUseCostPerAssessment: 95,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryFromItemType(itemType: string): ScopeCategory {
  const t = itemType.toLowerCase();
  if (t.includes("ppe") || t.includes("protective")) return "PROTECTIVE";
  if (
    t.includes("waste") ||
    t.includes("debris") ||
    t.includes("disposal") ||
    t.includes("removal")
  ) {
    return "DISPOSAL";
  }
  if (
    t.includes("test") ||
    t.includes("monitor") ||
    t.includes("verify") ||
    t.includes("thermal")
  ) {
    return "TESTING";
  }
  if (t.includes("hours") || t.includes("labour") || t.includes("technician")) {
    return "LABOUR";
  }
  if (
    t.includes("extraction") ||
    t.includes("dehu") ||
    t.includes("air_mover") ||
    t.includes("hepa") ||
    t.includes("scrubber") ||
    t.includes("equipment")
  ) {
    return "EQUIPMENT";
  }
  if (
    t.includes("admin") ||
    t.includes("call_out") ||
    t.includes("mobilisation")
  )
    return "ADMIN";
  return "MATERIALS";
}

function buildEstimate(
  scope: ScopeItem[],
  rateByDescription: Map<string, number>,
  gst: GstTreatment,
): AssessmentEstimate {
  const lines: EstimateLine[] = scope.map((item) => {
    const rate = rateByDescription.get(item.description) ?? 0;
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

// ─── Options narrowing ──────────────────────────────────────────────────────

const VALID_ENTRY_TYPES: readonly StormEntryType[] = [
  "roof_penetration",
  "stormwater_ingress",
  "wind_driven_rain",
  "flash_flood",
];

interface StormOptions {
  entryType: StormEntryType;
  waterCategory: StormWaterCategory;
  /** Optional override; otherwise derived from class+area defaults. */
  days?: number;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): StormOptions | null {
  if (!options || typeof options !== "object") return null;
  const t = options.entryType;
  if (
    typeof t !== "string" ||
    !VALID_ENTRY_TYPES.includes(t as StormEntryType)
  ) {
    return null;
  }
  const c = options.waterCategory;
  if (typeof c !== "number" || ![1, 2, 3].includes(c)) return null;
  const days =
    typeof options.days === "number" &&
    Number.isFinite(options.days) &&
    options.days > 0 &&
    options.days <= 60
      ? options.days
      : undefined;
  return {
    entryType: t as StormEntryType,
    waterCategory: c as StormWaterCategory,
    days,
  };
}

/**
 * Storm jobs run longer than typical Cat-1 water work because of
 * structural make-safe time + Cat-3 contamination protocols.
 * Conservative defaults; pilots can override via `days`.
 */
function estimatedDaysForStorm(
  entryType: StormEntryType,
  effectiveCategory: 1 | 2 | 3,
  affectedAreaM2: number,
): number {
  if (entryType === "flash_flood") {
    return affectedAreaM2 >= 50 ? 14 : 10;
  }
  if (entryType === "stormwater_ingress") {
    return affectedAreaM2 >= 30 ? 10 : 7;
  }
  if (effectiveCategory === 3) return 8;
  if (effectiveCategory === 2) return 6;
  return 5;
}

// ─── Report ──────────────────────────────────────────────────────────────────

const ENTRY_LABEL: Record<StormEntryType, string> = {
  roof_penetration:
    "Roof penetration (compromised tile/sheet, dislodged ridge cap, hail)",
  stormwater_ingress:
    "Stormwater ingress (drainage backflow / municipal stormwater overflow)",
  wind_driven_rain:
    "Wind-driven rain (lateral water under doors / through compromised seals)",
  flash_flood: "Flash flood (rapid surface-water inundation)",
};

function effectiveCategoryFor(
  entryType: StormEntryType,
  declared: StormWaterCategory,
): 1 | 2 | 3 {
  if (entryType === "flash_flood" || entryType === "stormwater_ingress") {
    return 3;
  }
  return declared;
}

function buildReport(args: {
  propertyAddress: string;
  affectedAreaM2: number;
  entryType: StormEntryType;
  declaredCategory: StormWaterCategory;
  effectiveCategory: 1 | 2 | 3;
  days: number;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cite = (section: string, note?: string): StandardCitation => ({
    standard: "IICRC S500:2021",
    section,
    note,
  });
  const ncc: StandardCitation = {
    standard: "NCC Volume 2",
    section: "Part 3.5 (Roof + wall weatherproofing)",
  };
  const sections: ReportSection[] = [];

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified storm damage via ` +
      `${ENTRY_LABEL[args.entryType]} affecting ` +
      `${args.affectedAreaM2.toFixed(1)} m². Restoration pathway is governed ` +
      `by IICRC S500:2021 plus AU National Construction Code Volume 2 ` +
      `Part 3.5 weatherproofing requirements for the make-safe and ` +
      `reinstatement phases.`,
    citations: [cite("§3.1"), ncc],
  });

  const elevated = args.effectiveCategory > args.declaredCategory;
  sections.push({
    heading: "Water classification",
    body:
      `Declared water category: ${args.declaredCategory}. Effective ` +
      `category for treatment: ${args.effectiveCategory}.` +
      (elevated
        ? ` Elevation rationale: ${args.entryType === "flash_flood" ? "flash-flood inundation carries surface contaminants and is treated as Cat-3" : "stormwater-ingress water mixes with municipal drainage and is treated as Cat-3"} ` +
          `per S500:2021 §3.1. All porous materials in contact with the ` +
          `Cat-3 water must be removed or evaluated against §6.3 treatment ` +
          `criteria; antimicrobial application is included as a default.`
        : ` Treatment follows S500:2021 §3.1 thresholds for the declared ` +
          `category — extraction, drying, monitoring; restorability of ` +
          `porous materials is decided per §6.`),
    citations: [cite("§3.1"), cite("§6"), cite("§6.3")],
  });

  sections.push({
    heading: "Make-safe + entry-pathway",
    body:
      args.entryType === "roof_penetration"
        ? `Roof penetration requires immediate make-safe to prevent ongoing ` +
          `ingress: emergency tarp, batten capping, or temporary patch per ` +
          `NCC Vol 2 Part 3.5 weatherproofing. Final reinstatement is a ` +
          `builder scope (typically out of restorer's professional limit); ` +
          `restorer documents the temporary works for the rebuild quote.`
        : args.entryType === "stormwater_ingress"
          ? `Stormwater ingress typically requires drainage clearance + ` +
            `barrier installation. Source identification is critical — ` +
            `where the ingress path is municipal infrastructure (council ` +
            `drains), the claim may transfer liability to council and the ` +
            `restorer should preserve evidence (photos, water samples) for ` +
            `the assessor.`
          : args.entryType === "wind_driven_rain"
            ? `Wind-driven rain typically enters via compromised seals ` +
              `(door / window frames, weep holes, ridge caps). Restorer ` +
              `should document the entry path with photos for the rebuild ` +
              `quote; weatherproofing reinstatement to NCC Vol 2 Part 3.5.`
            : `Flash-flood inundation requires structural inspection before ` +
              `re-entry — verify no foundation undermining, no raw sewage ` +
              `intrusion, no electrical hazard. Local authority may issue a ` +
              `make-safe directive that overrides the restorer's planned ` +
              `sequence.`,
    citations: [ncc],
  });

  sections.push({
    heading: "Scope rationale",
    body:
      `Scope items are generated from the storm pathway in S500:2021: ` +
      `extraction (§5.2) → moisture mapping (§7.3) → drying (§8.1) → ` +
      `category-specific treatment (§6 / §6.3 if Cat-3). Equipment ` +
      `quantities are ratio-driven, not estimated. Where the effective ` +
      `category is 3, antimicrobial treatment applies before drying ` +
      `restoration begins.`,
    citations: [cite("§5.2"), cite("§7.3"), cite("§8.1"), cite("§6")],
  });

  sections.push({
    heading: "Estimated duration",
    body:
      `Expected duration: ${args.days} days. Driven by entry type, ` +
      `effective Cat-${args.effectiveCategory} contamination protocol, ` +
      `and drying time under nominal conditions. Actual duration is ` +
      `governed by daily psychrometric monitoring per S500 §8 — equipment ` +
      `is removed only when the dry-standard is met for every monitored ` +
      `material.`,
    citations: [cite("§8")],
  });

  const citations: StandardCitation[] = sections
    .flatMap((s) => s.citations ?? [])
    .filter(
      (c, i, arr) =>
        arr.findIndex(
          (d) => d.standard === c.standard && d.section === c.section,
        ) === i,
    );

  return { report: { sections }, citations };
}

// ─── Plug-in ─────────────────────────────────────────────────────────────────

export const stormDomain: DomainPlugin = {
  domain: "STORM",
  label: "Storm damage (IICRC S500 + NCC Part 3.5)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "STORM generation requires options: { entryType: 'roof_penetration'|'stormwater_ingress'|'wind_driven_rain'|'flash_flood', waterCategory: 1|2|3, days?: number }",
        };
      }

      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: {
          id: true,
          propertyAddress: true,
          affectedAreas: { select: { affectedSquareFootage: true } },
        },
      });
      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      const affectedAreaM2 = inspection.affectedAreas.reduce(
        (sum, a) => sum + (a.affectedSquareFootage ?? 0),
        0,
      );
      if (affectedAreaM2 <= 0) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "Inspection has no affected-area data. Capture at least one AffectedArea row before generating.",
        };
      }

      const effectiveCategory = effectiveCategoryFor(
        opts.entryType,
        opts.waterCategory,
      );
      const days =
        opts.days ??
        estimatedDaysForStorm(
          opts.entryType,
          effectiveCategory,
          affectedAreaM2,
        );

      const drafts = generateStormScope({
        entryType: opts.entryType,
        waterCategory: opts.waterCategory,
        affectedAreaM2,
        estimatedDays: days,
        pricingConfig: DEFAULT_AU_PRICING,
      });

      const scope: ScopeItem[] = drafts.map((d) => ({
        description: d.description,
        category: categoryFromItemType(d.itemType),
        quantity: d.quantity ?? 1,
        unit: d.unit ?? "ea",
        iicrcRef: d.iicrcReference?.trim() || "IICRC S500:2021",
        notes: d.justification,
      }));

      const rateByDescription = new Map<string, number>(
        drafts
          .filter((d) => typeof d.unitCostAud === "number")
          .map((d) => [d.description, d.unitCostAud as number]),
      );
      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, rateByDescription, gst);

      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        affectedAreaM2,
        entryType: opts.entryType,
        declaredCategory: opts.waterCategory,
        effectiveCategory,
        days,
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
      console.error("[assessments.storm] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Storm assessment generation failed",
      };
    }
  },
};
