/**
 * Shared inputs for `planDrying()` — the power assessment and the mould flag.
 *
 * RA-7005 makes both non-negotiable: no air movers while mould is active, and
 * every plan packed onto a derated power budget. Whether those rules bite
 * depends entirely on the two values fed in, so how they are derived matters as
 * much as the planner itself.
 *
 * Before this module the 2x20A fallback was written out at three call sites
 * (`app/api/reports/generate-inspection-report/route.ts`,
 * `lib/reports/build-structured-report.ts`,
 * `lib/restoration/reconcile-pricing-safety.ts`) and the four-signal mould check
 * at one. Adding a fourth and a second copy for the Margot co-pilot is how those
 * quietly diverge — and a surface that derives `mouldActive` differently from
 * the report will contradict it on the same job, which is the failure this
 * module exists to stop.
 */
import type { PowerAssessment } from "./equipment-planner";

/**
 * What to assume when nobody has done the on-site power assessment yet.
 *
 * Two 20A circuits is the ordinary AU domestic case. It is an ASSUMPTION, not a
 * measurement: `resolvePowerAssessment` reports which one you got, and every
 * caller must label an assumed budget as such in anything a technician or
 * insurer reads. RA-7005 treats the real assessment as mandatory before
 * equipment goes in.
 */
export const ASSUMED_POWER_ASSESSMENT: PowerAssessment = {
  circuits: 2,
  circuitRatingA: 20,
};

/** The RA-7005 power columns, as they sit on `Inspection`. */
export interface PowerAssessmentColumns {
  powerCircuits?: number | null;
  powerCircuitRatingA?: number | null;
  powerDeratePct?: number | null;
}

/**
 * Read a captured power assessment off an inspection, or undefined when the
 * site has not been assessed.
 *
 * Both circuit count and rating must be present. A row carrying one without the
 * other is a half-finished assessment, and inventing the missing half would
 * produce a budget that reads as measured.
 */
export function powerAssessmentFromInspection(
  inspection: PowerAssessmentColumns | null | undefined,
): PowerAssessment | undefined {
  if (!inspection?.powerCircuits || !inspection.powerCircuitRatingA) {
    return undefined;
  }
  return {
    circuits: inspection.powerCircuits,
    circuitRatingA: inspection.powerCircuitRatingA,
    deratePct: inspection.powerDeratePct ?? 0.8,
  };
}

/**
 * Apply the assumed budget when there is no assessment, and say which you got.
 *
 * The `assumed` flag is the point. Callers that drop it produce a plan
 * indistinguishable from one built on a real electrician's numbers.
 */
export function resolvePowerAssessment(
  assessment: PowerAssessment | undefined,
): { assessment: PowerAssessment; assumed: boolean } {
  return assessment
    ? { assessment, assumed: false }
    : { assessment: ASSUMED_POWER_ASSESSMENT, assumed: true };
}

/** The mould signals, spread across Report columns and the tier-1 answers. */
export interface MouldSignals {
  biologicalMouldDetected?: boolean | null;
  biologicalMouldCategory?: string | null;
  hazardType?: string | null;
  /** Tier-1 hazard checklist answers (`T1_Q7_hazards`). */
  hazards?: readonly string[] | null;
}

/**
 * Is mould active on this job?
 *
 * Deliberately generous — ANY signal counts. The two outcomes are not
 * symmetric: a false positive costs a phased plan the job did not strictly need,
 * while a false negative puts air movers over live growth and blows spores
 * through an occupied building. `reconcile-pricing-safety.ts` calls that
 * "remediation negligence (S520)".
 *
 * `hazardType` and the tier-1 list are free text, so both spellings are matched.
 */
export function deriveMouldActive(signals: MouldSignals | null | undefined): boolean {
  if (!signals) return false;
  return (
    Boolean(signals.biologicalMouldDetected) ||
    Boolean(signals.biologicalMouldCategory) ||
    /mou?ld/i.test(String(signals.hazardType ?? "")) ||
    (signals.hazards ?? []).some((h) => /mou?ld/i.test(String(h)))
  );
}
