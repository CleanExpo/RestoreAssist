/**
 * Read the two `planDrying` inputs off an inspection.
 *
 * `plan-inputs.ts` derives them; this fetches them. It exists because four
 * export routes (`sketches/pdf`, `sketches/scope-export`, `sketches/scope-report`,
 * `sketches/scope-narrative`) each need the same two values, and the mould
 * signals are the exact thing that has now drifted twice: they live on `Report`
 * rather than `Inspection`, so a route that forgets to join gets
 * `mouldActive: false` and a scope carrying air movers over live growth. A
 * hand-written select per route is how that happens a third time.
 *
 * Fails open on the POWER side and closed on the MOULD side, which is the only
 * safe asymmetry: no power assessment means an assumed budget clearly labelled
 * as assumed, while a job with no Report row genuinely has no mould signal.
 */
import { prisma } from "@/lib/prisma";
import type { PowerAssessment } from "./equipment-planner";
import { deriveMouldActive, powerAssessmentFromInspection } from "./plan-inputs";

export interface InspectionPlanInputs {
  mouldActive: boolean;
  /** Undefined when the site was never assessed — callers must label the fallback. */
  powerAssessment?: PowerAssessment;
}

/** The select every caller shares, so none of them can quietly narrow it. */
export const PLAN_INPUT_SELECT = {
  powerCircuits: true,
  powerCircuitRatingA: true,
  powerDeratePct: true,
  report: {
    select: {
      biologicalMouldDetected: true,
      biologicalMouldCategory: true,
      hazardType: true,
      technicianFieldReport: true,
      tier1Responses: true,
    },
  },
} as const;

/** Shape of a row selected with `PLAN_INPUT_SELECT`. */
export interface PlanInputRow {
  powerCircuits?: number | null;
  powerCircuitRatingA?: number | null;
  powerDeratePct?: number | null;
  report?: {
    biologicalMouldDetected?: boolean | null;
    biologicalMouldCategory?: string | null;
    hazardType?: string | null;
    technicianFieldReport?: string | null;
    tier1Responses?: unknown;
  } | null;
}

/** Derive both inputs from an already-fetched row. */
export function planInputsFromRow(
  row: PlanInputRow | null | undefined,
): InspectionPlanInputs {
  return {
    mouldActive: deriveMouldActive({
      biologicalMouldDetected: row?.report?.biologicalMouldDetected,
      biologicalMouldCategory: row?.report?.biologicalMouldCategory,
      hazardType: row?.report?.hazardType,
      technicianFieldReport: row?.report?.technicianFieldReport,
      tier1: row?.report?.tier1Responses,
    }),
    powerAssessment: powerAssessmentFromInspection(row),
  };
}

/** Fetch and derive in one call, for routes that have only the inspection id. */
export async function fetchPlanInputs(
  inspectionId: string,
): Promise<InspectionPlanInputs> {
  const row = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: PLAN_INPUT_SELECT,
  });
  return planInputsFromRow(row as PlanInputRow | null);
}
