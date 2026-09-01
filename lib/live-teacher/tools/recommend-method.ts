import { z } from "zod";

import { standardCite } from "@/lib/nir-standards-mapping";
import { prisma } from "@/lib/prisma";
import { planDrying } from "@/lib/restoration/equipment-planner";
import {
  deriveMouldActive,
  powerAssessmentFromInspection,
  resolvePowerAssessment,
} from "@/lib/restoration/plan-inputs";

export const recommendMethodSchema = z.object({
  inspectionId: z.string(),
});

export type RecommendMethodArgs = z.infer<typeof recommendMethodSchema>;

const SQFT_TO_SQM = 0.09290304;

export interface MethodCaution {
  text: string;
  citation: string;
}

export interface MethodEquipmentPhase {
  phase: 1 | 2;
  label: string;
  airMoversAllowed: boolean;
  units: Array<{ kind: string; quantity: number; ampsTotal: number }>;
  totalA: number;
  fitsSupply: boolean;
}

export type RecommendMethodResult =
  | {
      available: true;
      classification: { category: string; class: string };
      method: { summary: string; citation: string };
      equipment: {
        totalAreaM2: number;
        mouldActive: boolean;
        power: {
          circuits: number;
          circuitRatingA: number;
          deratePct: number;
          siteUsableA: number;
          /** True when nobody has done the on-site assessment — say so out loud. */
          assumed: boolean;
        };
        powerConstrained: boolean;
        phases: MethodEquipmentPhase[];
        advisories: string[];
        citation: string;
      };
      cautions: MethodCaution[];
    }
  | { available: false; reason: string };

/**
 * Recommend a drying method and a phased, power-constrained equipment plan.
 *
 * WHY THIS CALLS planDrying() AND NOT recommendedEquipment().
 *
 * This tool used to size equipment with `recommendedEquipment(totalM2)` from
 * lib/sketch/iicrc-utils — three lines of `Math.ceil(area / ratio)`, with no
 * mould check and no electrical limit. lib/restoration/equipment-planner.ts
 * (RA-7005) exists specifically to replace that approach; its header calls the
 * output of area-division "an UNSAFE, unbuildable plan (air movers over active
 * mould -> spore dispersal; more machines than the supply can power)".
 *
 * The report generator, the structured report builder and the pricing-safety
 * reconciler all already use `planDrying`. This tool did not — so Margot, asked
 * the same question out loud on site, would hand a technician an air-mover count
 * for a job with live mould growth, contradicting the report for the same job.
 * `reconcile-pricing-safety.ts` calls a priced Phase-1 air mover on a mould job
 * "remediation negligence (S520)".
 *
 * Read-only: it recommends, it never writes. The technician commits any
 * resulting scope or equipment changes through the normal editable surfaces.
 */
export async function recommendMethod(
  args: RecommendMethodArgs,
): Promise<RecommendMethodResult> {
  const { inspectionId } = recommendMethodSchema.parse(args);

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      // RA-7005 power columns — an on-site assessment when it exists.
      powerCircuits: true,
      powerCircuitRatingA: true,
      powerDeratePct: true,
      classifications: {
        take: 1,
        // Latest classification wins — a re-classified job (Cat 1 → Cat 3)
        // accumulates rows and an unordered take(1) is nondeterministic.
        // Same ordering as the portal PDF route.
        orderBy: { createdAt: "desc" },
        select: { category: true, class: true },
      },
      affectedAreas: {
        take: 100,
        select: { affectedAreaSqm: true, affectedSquareFootage: true },
      },
      // The mould signals live on Report, not Inspection — which is why this
      // tool could not see them at all before.
      report: {
        select: {
          biologicalMouldDetected: true,
          biologicalMouldCategory: true,
          hazardType: true,
        },
      },
    },
  });

  if (!inspection) {
    return { available: false, reason: `Inspection ${inspectionId} not found` };
  }

  const cls = inspection.classifications[0];
  if (!cls?.category || !cls.class) {
    return {
      available: false,
      reason:
        "No IICRC classification recorded yet — determine water category and class first (S500:2021 §10.4), then ask again",
    };
  }

  const totalAreaM2 = inspection.affectedAreas.reduce(
    (sum, a) => sum + (a.affectedAreaSqm ?? a.affectedSquareFootage * SQFT_TO_SQM),
    0,
  );

  if (totalAreaM2 <= 0) {
    return {
      available: false,
      reason:
        "No affected areas recorded yet — capture the affected areas first so equipment can be sized (S500:2021 §6), then ask again",
    };
  }

  const mouldActive = deriveMouldActive(inspection.report);
  const { assessment, assumed } = resolvePowerAssessment(
    powerAssessmentFromInspection(inspection),
  );
  const plan = planDrying(
    { affectedAreaM2: Math.round(totalAreaM2 * 10) / 10, mouldActive },
    assessment,
  );

  const classSummaries: Record<string, string> = {
    "1": "Class 1 (least water): targeted airflow and dehumidification on the affected materials only",
    "2": "Class 2 (significant absorption): full-room airflow with dehumidification sized to the wet-material load",
    "3": "Class 3 (greatest absorption, water from overhead): aggressive whole-room drying — airflow across all wet surfaces plus high-capacity dehumidification",
    "4": "Class 4 (specialty drying / bound water): extended drying with desiccant or low-grain refrigerant dehumidification and vapour-pressure differentials",
  };

  const cautions: MethodCaution[] = [];
  // Stated first: it changes the whole sequence, not just a precaution within it.
  if (mouldActive) {
    cautions.push({
      text: "Active mould: NO air movers until post-remediation verification clears the area to Condition 1. Phase 1 dries with dehumidifiers and AFD/HEPA scrubbers under negative-pressure containment — air movers would aerosolise spores through the building",
      citation: standardCite("S520"),
    });
  }
  if (cls.category === "2" || cls.category === "3") {
    cautions.push({
      text: `Category ${cls.category} water: evaluate antimicrobial (biocide) application and PPE before drying in place`,
      citation: standardCite("S500", "7.1"),
    });
  }
  if (cls.category === "3") {
    cautions.push({
      text: "Category 3 water: porous materials in the wetted zone generally require removal rather than drying in place",
      citation: standardCite("S500", "10.4.1"),
    });
  }
  if (assumed) {
    cautions.push({
      text: `No site power assessment recorded — this plan ASSUMES ${assessment.circuits}× ${assessment.circuitRatingA}A/230V. Confirm the available circuits on site before placing equipment`,
      citation: standardCite("S500", "6"),
    });
  }

  return {
    available: true,
    classification: { category: cls.category, class: cls.class },
    method: {
      summary:
        classSummaries[cls.class] ??
        `Class ${cls.class}: dry per the evaporation-load assessment`,
      citation: standardCite("S500", "10.4.3"),
    },
    equipment: {
      totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
      mouldActive,
      power: {
        circuits: plan.budget.circuits,
        circuitRatingA: plan.budget.circuitRatingA,
        deratePct: plan.budget.deratePct,
        siteUsableA: plan.budget.siteUsableA,
        assumed,
      },
      powerConstrained: plan.powerConstrained,
      phases: plan.phases.map((ph) => ({
        phase: ph.phase,
        label: ph.label,
        airMoversAllowed: ph.airMoversAllowed,
        units: ph.lines.map((l) => ({
          kind: l.kind,
          quantity: l.quantity,
          ampsTotal: l.ampsTotal,
        })),
        totalA: ph.packing.totalA,
        fitsSupply: ph.packing.fits,
      })),
      advisories: plan.advisories,
      citation: standardCite("S500", "6"),
    },
    cautions,
  };
}

export const recommendMethodDefinition = {
  name: "recommend_method",
  description:
    "Recommend a drying method and a PHASED, power-constrained equipment plan for this inspection, from its recorded IICRC classification, affected areas, mould status and site power assessment. Equipment comes from the RA-7005 safety planner: while mould is active NO air movers are allowed until post-remediation verification clears the area, and every phase is packed onto the derated circuit supply, so counts may be lower than floor area alone suggests. Relay the phases in order and never merge them. Read-only — the technician reviews and commits any changes. Returns cited recommendations, or an explicit reason when classification or affected areas are missing.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
    },
    required: ["inspectionId"],
  },
};
