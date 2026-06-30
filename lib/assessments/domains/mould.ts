/**
 * MOULD domain plug-in — RA-1717.
 *
 * Second concrete domain. Reads an Inspection plus a domain-options
 * payload (`condition` + optional `ambientRelativeHumidity` and
 * `containment` override) and produces:
 *
 *   - report  — IICRC S520:2024 §12 grounded sections (situation,
 *               classification, containment rationale, equipment,
 *               clearance criteria, post-remediation verification)
 *   - scope   — ScopeItem[] from lib/equipment-calculator-mould +
 *               lib/equipment-hepa-negative-air, with IICRC clause
 *               refs inline
 *   - estimate — equipment line-rates × estimated days × 10% GST
 *
 * Rule-based + deterministic — no AI required for V1. AI prose
 * enhancement is wired in later under the same RA-1717 epic.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import {
  calculateMouldEquipment,
  type ContainmentLevel,
  type MouldCondition,
  type MouldEquipmentLineItem,
} from "@/lib/equipment-calculator-mould";
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

// ─── Pricing defaults (per-day equipment hire, AU mid-2026 ex GST) ──────────

const DAILY_RATES_AUD: Record<MouldEquipmentLineItem["type"], number> = {
  negative_air_machine: 95,
  air_scrubber_hepa: 85,
  hepa_vacuum: 35,
  dehumidifier_lgr: 110,
};

/**
 * Estimated remediation duration (days). S520:2024 doesn't prescribe a
 * fixed schedule — duration is condition × area driven. Conservative
 * mid-points used for pilot defaults; pilots can supply `days` via
 * options to override.
 */
function estimatedDaysFromCondition(
  condition: MouldCondition,
  areaM2: number,
): number {
  if (condition === "CONDITION_3") {
    if (areaM2 >= 30) return 14;
    if (areaM2 >= 9) return 10;
    return 7;
  }
  // Condition 2 — settled / limited amplification
  if (areaM2 >= 30) return 7;
  if (areaM2 >= 9) return 5;
  return 4;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function equipmentToScopeItem(
  it: MouldEquipmentLineItem,
  days: number,
): ScopeItem {
  return {
    description: `${it.label} — ${days}-day hire`,
    category: "EQUIPMENT" satisfies ScopeCategory,
    quantity: it.quantity * days,
    unit: "unit·day",
    iicrcRef: it.iicrcReference,
    notes: it.justification,
  };
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

interface MouldOptions {
  condition: MouldCondition;
  ambientRelativeHumidity: number;
  /** Optional explicit containment override. Auto-selected when absent. */
  containment?: ContainmentLevel;
  /** Optional explicit duration override in days. */
  days?: number;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): MouldOptions | null {
  if (!options || typeof options !== "object") return null;
  const cond = options.condition;
  if (cond !== "CONDITION_2" && cond !== "CONDITION_3") return null;
  const rh = options.ambientRelativeHumidity;
  const ambientRelativeHumidity =
    typeof rh === "number" && Number.isFinite(rh) && rh >= 0 && rh <= 100
      ? rh
      : 60;
  const containment =
    options.containment === "SOURCE_CONTROL" ||
    options.containment === "LIMITED" ||
    options.containment === "FULL"
      ? (options.containment as ContainmentLevel)
      : undefined;
  const days =
    typeof options.days === "number" &&
    Number.isFinite(options.days) &&
    options.days > 0 &&
    options.days <= 60
      ? options.days
      : undefined;
  return {
    condition: cond,
    ambientRelativeHumidity,
    containment,
    days,
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

function buildReport(args: {
  propertyAddress: string;
  affectedAreaM2: number;
  condition: MouldCondition;
  containmentLevel: ContainmentLevel;
  ambientRH: number;
  days: number;
  totalEstimatedAmps: number;
  recommendedCircuits: number;
  iicrcClassification: string;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cite = (section: string, note?: string): StandardCitation => ({
    standard: "IICRC S520:2024",
    section,
    note,
  });

  const sections: ReportSection[] = [];

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified ` +
      `${args.iicrcClassification} mould contamination across ` +
      `${args.affectedAreaM2.toFixed(1)} m². Condition assessment per ` +
      `IICRC S520:2024 §3 sets the regulatory pathway for remediation: ` +
      `Condition 2 (settled spores / traces of amplification) requires ` +
      `LIMITED containment; Condition 3 (active fungal growth) requires ` +
      `negative-pressure FULL containment with HEPA filtration whenever ` +
      `affected area exceeds approximately 1 m² (10 ft²).`,
    citations: [cite("§3"), cite("§12")],
  });

  sections.push({
    heading: "Containment classification",
    body:
      `Containment level: ${args.containmentLevel}. ` +
      (args.containmentLevel === "FULL"
        ? "Full 6-sided containment with negative-air machine and " +
          "decontamination chamber per S520 §12.2 + AIHA Z9.11. "
        : args.containmentLevel === "LIMITED"
          ? "Limited containment (poly sheeting + single-entry flap) " +
            "per S520 §12.2.2 — applicable to Condition 3 areas under " +
            "approximately 1 m² and Condition 2 areas. "
          : "Source-control enclosure (bagged at source) per S520 §12.2.1 " +
            "— applicable to small isolated items only. ") +
      `Negative-pressure containment must achieve at least 4 air changes ` +
      `per hour and a measurable pressure differential across the ` +
      `barrier (S520 §12.3).`,
    citations: [
      cite("§12.2"),
      cite("§12.3"),
      { standard: "AIHA Z9.11", section: "Negative pressure verification" },
    ],
  });

  sections.push({
    heading: "Equipment rationale",
    body:
      `Equipment quantities are ratio-driven, not estimated. Negative-air ` +
      `machines and air scrubbers are sized from S520 §12.3 / §12.4 ratios ` +
      `against affected area. HEPA vacuums are sized for spore collection ` +
      `(S520 §8.4.3). LGR dehumidification is included when ambient RH ` +
      `exceeds 60% (recorded: ${args.ambientRH}%) to prevent re-amplification ` +
      `(S520 §7.2). Estimated electrical load: ${args.totalEstimatedAmps.toFixed(1)} A ` +
      `across ${args.recommendedCircuits} circuit(s) — verify against the ` +
      `property's circuit availability before deployment.`,
    citations: [cite("§12.3"), cite("§12.4"), cite("§8.4.3"), cite("§7.2")],
  });

  sections.push({
    heading: "Estimated duration",
    body:
      `Expected remediation duration: ${args.days} days for ` +
      `${args.iicrcClassification} contamination over ` +
      `${args.affectedAreaM2.toFixed(1)} m². Actual duration is governed ` +
      `by post-remediation verification (PRV) — clearance is met when ` +
      `the indoor mycoflora normalises against an outdoor baseline ` +
      `(S520 §13.4).`,
    citations: [cite("§13.4")],
  });

  sections.push({
    heading: "Clearance criteria",
    body:
      `Post-remediation verification (PRV) per S520 §13: ` +
      `(1) visible inspection — no mould growth, water staining, or ` +
      `excessive dust; (2) moisture content of remaining materials at ` +
      `or below the IICRC dry-standard for the material type; (3) ` +
      `airborne spore counts comparable to the outdoor baseline taken ` +
      `at the start of the work. Where the assessment classification ` +
      `is Condition 3 or where occupants are immunocompromised, an ` +
      `Indoor Environmental Professional (IEP) should perform clearance.`,
    citations: [cite("§13"), cite("§13.4"), cite("§13.5")],
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

export const mouldDomain: DomainPlugin = {
  domain: "MOULD",
  label: "Mould remediation (IICRC S520)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "MOULD generation requires options: { condition: 'CONDITION_2' | 'CONDITION_3', ambientRelativeHumidity?: 0-100, containment?: 'SOURCE_CONTROL' | 'LIMITED' | 'FULL', days?: number }",
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
            "Inspection has no affected-area data. Capture at least one AffectedArea row (with affectedSquareFootage > 0) before generating.",
        };
      }

      const calc = calculateMouldEquipment({
        affectedAreaM2,
        condition: opts.condition,
        containment: opts.containment,
        ambientRelativeHumidity: opts.ambientRelativeHumidity,
      });

      const days =
        opts.days ?? estimatedDaysFromCondition(opts.condition, affectedAreaM2);

      const scope: ScopeItem[] = calc.equipmentList.map((it) =>
        equipmentToScopeItem(it, days),
      );

      // Build a description-keyed rate map for the estimate. Same description
      // shape used in equipmentToScopeItem above.
      const rateByDescription = new Map<string, number>(
        calc.equipmentList.map((it) => [
          `${it.label} — ${days}-day hire`,
          DAILY_RATES_AUD[it.type],
        ]),
      );
      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, rateByDescription, gst);

      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        affectedAreaM2,
        condition: opts.condition,
        containmentLevel: calc.containmentLevel,
        ambientRH: opts.ambientRelativeHumidity,
        days,
        totalEstimatedAmps: calc.totalEstimatedAmps,
        recommendedCircuits: calc.recommendedCircuits,
        iicrcClassification: calc.iicrcClassification,
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
      console.error("[assessments.mould] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Mould assessment generation failed",
      };
    }
  },
};
