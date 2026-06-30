/**
 * FIRE_SMOKE domain plug-in — RA-1717.
 *
 * Fourth concrete domain. Reads an Inspection plus a domain-options
 * payload (`smokeType` + `charLevel`) and produces:
 *
 *   - report  — IICRC S700:2025 grounded sections (situation,
 *               smoke classification, structural assessment,
 *               cleaning protocol, odour control, clearance)
 *   - scope   — ScopeItem[] from lib/scope-fire::generateFireScope
 *               (smoke-type-specific cleaning items + char-level
 *               structural items, all with S700 clause refs inline)
 *   - estimate — line items × default AU rates × 10% GST
 *
 * Rule-based + deterministic; AI prose is a follow-up under same ticket.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import { generateFireScope, type SmokeType } from "@/lib/scope-fire";
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

// ─── Pricing defaults (AU mid-2026 ex GST) ────────────────────────────────────

const DEFAULT_AU_PRICING = {
  masterQualifiedNormalHours: 125,
  qualifiedTechnicianNormalHours: 100,
  labourerNormalHours: 70,
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
  administrationFee: 195,
  callOutFee: 250,
  thermalCameraUseCostPerAssessment: 95,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryFromItemType(itemType: string): ScopeCategory {
  const t = itemType.toLowerCase();
  if (t.includes("ppe") || t.includes("protective")) return "PROTECTIVE";
  if (
    t.includes("disposal") ||
    t.includes("waste") ||
    t.includes("debris") ||
    t.includes("demolition")
  ) {
    return "DISPOSAL";
  }
  if (
    t.includes("test") ||
    t.includes("verification") ||
    t.includes("monitor") ||
    t.includes("clearance")
  ) {
    return "TESTING";
  }
  if (t.includes("hours") || t.includes("labour") || t.includes("technician")) {
    return "LABOUR";
  }
  if (
    t.includes("equipment") ||
    t.includes("hepa_vacuum") ||
    t.includes("scrubber") ||
    t.includes("ozone") ||
    t.includes("hydroxyl") ||
    t.includes("thermal_fog")
  ) {
    return "EQUIPMENT";
  }
  if (t.includes("admin") || t.includes("call_out")) return "ADMIN";
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

const VALID_SMOKE_TYPES: readonly SmokeType[] = [
  "wet",
  "dry",
  "protein",
  "fuel_oil",
];

interface FireSmokeOptions {
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): FireSmokeOptions | null {
  if (!options || typeof options !== "object") return null;
  const s = options.smokeType;
  if (typeof s !== "string" || !VALID_SMOKE_TYPES.includes(s as SmokeType)) {
    return null;
  }
  const c = options.charLevel;
  if (typeof c !== "number" || ![1, 2, 3, 4].includes(c)) return null;
  return { smokeType: s as SmokeType, charLevel: c as 1 | 2 | 3 | 4 };
}

// ─── Report ──────────────────────────────────────────────────────────────────

const SMOKE_LABEL: Record<SmokeType, string> = {
  wet: "Wet smoke (low-temp slow-burn — oily residue, strong odour)",
  dry: "Dry smoke (high-temp fast-burn — fine powder residue)",
  protein:
    "Protein smoke (kitchen / organic combustion — invisible film, strong odour)",
  fuel_oil: "Fuel-oil smoke (puffback / heating-system — petroleum residue)",
};

const CHAR_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Char 1 — surface scorching, no structural impact",
  2: "Char 2 — superficial burn, minor coating loss",
  3: "Char 3 — significant burn, structural review required",
  4: "Char 4 — heavy structural damage, demolition pathway",
};

function buildReport(args: {
  propertyAddress: string;
  affectedAreaM2: number;
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cite = (section: string, note?: string): StandardCitation => ({
    standard: "IICRC S700:2025",
    section,
    note,
  });
  const sections: ReportSection[] = [];

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified ` +
      `${SMOKE_LABEL[args.smokeType]} affecting ` +
      `${args.affectedAreaM2.toFixed(1)} m². Smoke classification per IICRC ` +
      `S700:2025 §4.3 governs the cleaning pathway: wet residues require ` +
      `degreaser + HEPA + odour neutralisation; dry residues require ` +
      `mechanical removal first to avoid smearing; protein films require ` +
      `enzymatic cleaners; fuel-oil residues require petroleum-specific ` +
      `solvents.`,
    citations: [cite("§4.3")],
  });

  sections.push({
    heading: "Structural assessment",
    body:
      `${CHAR_LABEL[args.charLevel]}. Char-level classification under ` +
      `S700:2025 §5 drives structural removal/replacement decisions: ` +
      `Char 1-2 are typically restorable; Char 3 requires engineer ` +
      `assessment of load-bearing elements; Char 4 frames the demolition ` +
      `pathway and typically triggers builder involvement under the ` +
      `insurer's reinstatement policy.`,
    citations: [cite("§5")],
  });

  const cleaningBody =
    args.smokeType === "wet"
      ? `Wet residue protocol per S700 §6.4: degreaser application → ` +
        `HEPA vacuum extraction → ozone treatment for oxidative odour ` +
        `neutralisation (S700 §7.1). Where ozone is contraindicated ` +
        `(e.g. occupied building, sensitive electronics) substitute ` +
        `hydroxyl generation.`
      : args.smokeType === "dry"
        ? `Dry residue protocol per S700 §6.2: dry chemical sponge ` +
          `removal → HEPA vacuum → hydroxyl odour control (S700 §7.1). ` +
          `Wet cleaning before mechanical removal smears dry residue ` +
          `into porous surfaces and is contraindicated.`
        : args.smokeType === "protein"
          ? `Protein residue protocol per S700 §6.5: enzymatic cleaner ` +
            `to break down organic film → wipe → thermal fog with ` +
            `odour-counteracting agent. Protein smoke is invisible — ` +
            `walls and ceilings appear clean but odour persists; ` +
            `cleaning extent is governed by olfactory verification ` +
            `not visual.`
          : `Fuel-oil residue protocol per S700 §6.6: petroleum-specific ` +
            `solvent application → multiple HEPA passes → activated-` +
            `carbon filtration during work. Surfaces typically require ` +
            `multiple passes and may need refinishing where residue ` +
            `has penetrated porous substrates.`;

  sections.push({
    heading: "Cleaning + decontamination protocol",
    body: cleaningBody,
    citations: [cite("§6"), cite("§7.1")],
  });

  sections.push({
    heading: "Odour control",
    body:
      `Odour neutralisation per S700:2025 §7. Method selection follows ` +
      `the smoke type: oxidising agents (ozone, hydroxyl) for ` +
      `combustion-byproduct VOCs; thermal fogging with odour-counteractant ` +
      `for protein; encapsulant sealers on substrates that cannot be ` +
      `replaced. Verification is olfactory (post-airing) plus, where ` +
      `disputed, GC-MS sampling against an outdoor baseline.`,
    citations: [cite("§7"), cite("§7.1"), cite("§7.3")],
  });

  sections.push({
    heading: "Clearance criteria",
    body:
      `Clearance per S700 §8: (1) visual inspection — no visible residue ` +
      `on cleaned surfaces; (2) UV-fluorescence sweep for residual ` +
      `protein where applicable; (3) olfactory verification by an ` +
      `independent assessor 24 hours after the last odour treatment; ` +
      `(4) where occupants are returning, post-restoration airborne ` +
      `particulate count comparable to a pre-loss / outdoor baseline.`,
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

export const fireSmokeDomain: DomainPlugin = {
  domain: "FIRE_SMOKE",
  label: "Fire + smoke restoration (IICRC S700)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "FIRE_SMOKE generation requires options: { smokeType: 'wet'|'dry'|'protein'|'fuel_oil', charLevel: 1|2|3|4 }",
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

      const drafts = generateFireScope({
        smokeType: opts.smokeType,
        charLevel: opts.charLevel,
        affectedAreaM2,
        pricingConfig: DEFAULT_AU_PRICING,
      });

      const scope: ScopeItem[] = drafts.map((d) => ({
        description: d.description,
        category: categoryFromItemType(d.itemType),
        quantity: d.quantity ?? 1,
        unit: d.unit ?? "ea",
        iicrcRef: d.iicrcReference?.trim() || "IICRC S700:2025",
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
        smokeType: opts.smokeType,
        charLevel: opts.charLevel,
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
      console.error("[assessments.fire-smoke] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Fire/smoke assessment generation failed",
      };
    }
  },
};
