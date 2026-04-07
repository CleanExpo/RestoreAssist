/**
 * NIR Pilot Measurement Engine
 *
 * Collects, evaluates, and reports on Phase 2 pilot observations.
 * Determines when HYPOTHESIS claims in nir-evidence-architecture.ts are
 * ready to be promoted to VALIDATED via a code PR.
 *
 * Architecture:
 *   - PilotObservation rows are the raw data (recorded via /api/pilot/observations)
 *   - PILOT_CRITERIA defines the success threshold for each HYPOTHESIS claim
 *   - evaluateClaimReadiness() checks observed data against the threshold
 *   - generatePilotReport() produces the full readiness report for the product lead
 *   - deriveCycleTimeObservations() auto-builds CLAIM-007 data from existing inspections
 *
 * Promotion is ALWAYS manual:
 *   When the report shows a claim is ready, the product lead:
 *     1. Reviews the underlying observations (sanity check)
 *     2. Updates lib/nir-evidence-architecture.ts:  status: 'VALIDATED'
 *     3. Records validatedBy, validatedAt, validationNotes
 *     4. Opens a PR — the PR diff IS the audit trail
 *   This creates a version-controlled, reviewer-approved record that cannot
 *   be silently reverted without a further code change.
 *
 * Source: EVIDENCE_REGISTER in lib/nir-evidence-architecture.ts
 */

import {
  EVIDENCE_REGISTER,
  type EvidenceClaim,
} from "@/lib/nir-evidence-architecture";

// ─── OBSERVATION TYPES ────────────────────────────────────────────────────────

/** The set of observation types the pilot collects. One per claim's measurement method. */
export type ObservationType =
  | "cost_impact" // CLAIM-002: per-claim cost differential (AUD)
  | "reinspection_event" // CLAIM-003: 1 = re-inspection required, 0 = not required
  | "adjuster_session" // CLAIM-004: adjuster review time in minutes
  | "technician_survey" // CLAIM-005: ease-of-use rating 1–5
  | "cycle_time"; // CLAIM-007: claim open→scope-approval in business days

export type PilotGroup = "nir" | "control";

/** A single pilot observation — mirrors the PilotObservation Prisma model */
export interface PilotObservation {
  id: string;
  claimId: string;
  observationType: ObservationType;
  value: number;
  group: PilotGroup;
  inspectionId?: string | null;
  recordedByUserId: string;
  context?: Record<string, unknown> | null;
  notes?: string | null;
  createdAt: Date;
}

/** Input shape for creating a new observation (no id/createdAt) */
export interface NewPilotObservation {
  claimId: string;
  observationType: ObservationType;
  value: number;
  group?: PilotGroup;
  inspectionId?: string;
  recordedByUserId: string;
  context?: Record<string, unknown>;
  notes?: string;
}

// ─── SUCCESS CRITERIA ─────────────────────────────────────────────────────────

/**
 * Per-claim promotion criteria.
 * When all criteria for a claim are met, the claim is ready to promote to VALIDATED.
 */
export interface ClaimCriteria {
  claimId: string;
  /** Human-readable description of what needs to be measured */
  description: string;
  /** The observation type that contributes evidence for this claim */
  observationType: ObservationType;
  /** Minimum number of NIR-group observations required before evaluation is valid */
  minNirSampleSize: number;
  /** Minimum number of control-group observations (0 if control not required) */
  minControlSampleSize: number;
  /** The statistical/threshold test to apply to the observations */
  evaluate: (
    nirObs: PilotObservation[],
    controlObs: PilotObservation[],
  ) => ClaimEvaluation;
}

export interface ClaimEvaluation {
  /** Whether the success criteria is met */
  met: boolean;
  /** Human-readable summary of the evaluation */
  summary: string;
  /** Computed metric value (e.g. median, mean, rate) */
  metricValue: number | null;
  /** The threshold the metric is evaluated against */
  threshold: number | string;
  /** Whether there is sufficient data to make a determination */
  sufficientData: boolean;
  /** How many more observations are needed before evaluation becomes valid */
  observationsNeeded: number;
}

// ─── CLAIM CRITERIA DEFINITIONS ───────────────────────────────────────────────

const PILOT_CRITERIA: ClaimCriteria[] = [
  // CLAIM-002: Per-claim cost impact from report format fragmentation
  // Success: measured cost difference is statistically significant (p<0.05)
  // Practical: measure per-claim total cost NIR vs control; need ≥50 each
  {
    claimId: "CLAIM-002",
    description:
      "Per-claim cost differential (AUD): NIR vs. existing-format claims",
    observationType: "cost_impact",
    minNirSampleSize: 50,
    minControlSampleSize: 50,
    evaluate(nir, control) {
      if (nir.length < 50 || control.length < 50) {
        return {
          met: false,
          summary: `Insufficient data: ${nir.length}/50 NIR, ${control.length}/50 control cost observations`,
          metricValue: null,
          threshold: "NIR median cost < control median cost; p < 0.05",
          sufficientData: false,
          observationsNeeded:
            Math.max(0, 50 - nir.length) + Math.max(0, 50 - control.length),
        };
      }
      const nirMedian = median(nir.map((o) => o.value));
      const ctrlMedian = median(control.map((o) => o.value));
      const difference = ctrlMedian - nirMedian;
      const met =
        difference > 0 &&
        welchTTest(
          nir.map((o) => o.value),
          control.map((o) => o.value),
        ) < 0.05;
      return {
        met,
        summary: met
          ? `NIR median $${nirMedian.toFixed(0)} vs control $${ctrlMedian.toFixed(0)} — saving $${difference.toFixed(0)} per claim (p<0.05)`
          : `NIR $${nirMedian.toFixed(0)} vs control $${ctrlMedian.toFixed(0)} — cost difference not yet statistically significant`,
        metricValue: difference,
        threshold: "cost reduction p < 0.05",
        sufficientData: true,
        observationsNeeded: 0,
      };
    },
  },

  // CLAIM-003: Re-inspection rate for non-standardised reports
  // Success: NIR re-inspection rate < 10%, control measured for baseline
  {
    claimId: "CLAIM-003",
    description:
      "Re-inspection rate: proportion of claims requiring a second inspection",
    observationType: "reinspection_event",
    minNirSampleSize: 50,
    minControlSampleSize: 50,
    evaluate(nir, control) {
      if (nir.length < 50) {
        return {
          met: false,
          summary: `Insufficient NIR re-inspection observations: ${nir.length}/50`,
          metricValue: null,
          threshold: "NIR re-inspection rate < 10%",
          sufficientData: false,
          observationsNeeded: 50 - nir.length,
        };
      }
      // value = 1 means re-inspection was required, 0 = not required
      const nirRate = mean(nir.map((o) => o.value)) * 100;
      const ctrlRate =
        control.length >= 50 ? mean(control.map((o) => o.value)) * 100 : null;
      const met = nirRate < 10;
      const ctrlSummary =
        ctrlRate !== null
          ? `; control rate ${ctrlRate.toFixed(1)}%`
          : " (control baseline pending)";
      return {
        met,
        summary: met
          ? `NIR re-inspection rate ${nirRate.toFixed(1)}% < 10% target${ctrlSummary}`
          : `NIR re-inspection rate ${nirRate.toFixed(1)}% — target <10%${ctrlSummary}`,
        metricValue: nirRate,
        threshold: "< 10%",
        sufficientData: true,
        observationsNeeded: Math.max(0, 50 - control.length),
      };
    },
  },

  // CLAIM-004: Insurance adjuster time to decode non-standardised report
  // Success: NIR average review time <45 minutes; >30% reduction vs control
  {
    claimId: "CLAIM-004",
    description:
      "Adjuster report review time (minutes): NIR vs. non-standardised formats",
    observationType: "adjuster_session",
    minNirSampleSize: 60, // 6 adjusters × 10 NIR reports each
    minControlSampleSize: 60,
    evaluate(nir, control) {
      const needNir = Math.max(0, 60 - nir.length);
      const needCtrl = Math.max(0, 60 - control.length);
      if (needNir > 0 || needCtrl > 0) {
        return {
          met: false,
          summary: `Insufficient adjuster sessions: ${nir.length}/60 NIR, ${control.length}/60 control`,
          metricValue: null,
          threshold: "NIR mean < 45 min and >30% reduction vs control",
          sufficientData: false,
          observationsNeeded: needNir + needCtrl,
        };
      }
      const nirMean = mean(nir.map((o) => o.value));
      const ctrlMean = mean(control.map((o) => o.value));
      const reduction =
        ctrlMean > 0 ? ((ctrlMean - nirMean) / ctrlMean) * 100 : 0;
      const met = nirMean < 45 && reduction >= 30;
      return {
        met,
        summary: met
          ? `NIR mean ${nirMean.toFixed(1)} min vs control ${ctrlMean.toFixed(1)} min — ${reduction.toFixed(0)}% reduction (target: <45 min, >30% reduction)`
          : `NIR mean ${nirMean.toFixed(1)} min vs control ${ctrlMean.toFixed(1)} min — ${reduction.toFixed(0)}% reduction (need <45 min AND >30% reduction)`,
        metricValue: nirMean,
        threshold: "< 45 min and > 30% reduction vs control",
        sufficientData: true,
        observationsNeeded: 0,
      };
    },
  },

  // CLAIM-005: Technician ease-of-use rating
  // Success: ≥85% of respondents rate ease of use 4 or 5 out of 5
  {
    claimId: "CLAIM-005",
    description:
      "Technician ease-of-use rating (1–5 scale): proportion rating ≥4",
    observationType: "technician_survey",
    minNirSampleSize: 20,
    minControlSampleSize: 0, // No control group required
    evaluate(nir) {
      if (nir.length < 20) {
        return {
          met: false,
          summary: `${nir.length}/20 technician survey responses collected`,
          metricValue: null,
          threshold: "≥85% rating 4 or 5",
          sufficientData: false,
          observationsNeeded: 20 - nir.length,
        };
      }
      const highRatings = nir.filter((o) => o.value >= 4).length;
      const rate = (highRatings / nir.length) * 100;
      const met = rate >= 85;
      return {
        met,
        summary: met
          ? `${rate.toFixed(0)}% of ${nir.length} technicians rated ≥4/5 (target ≥85%)`
          : `${rate.toFixed(0)}% rated ≥4/5 across ${nir.length} respondents — target ≥85%`,
        metricValue: rate,
        threshold: "≥85%",
        sufficientData: true,
        observationsNeeded: 0,
      };
    },
  },

  // CLAIM-007: Claims cycle time reduction
  // Success: median scope approval time <5 business days for NIR
  {
    claimId: "CLAIM-007",
    description:
      "Claim cycle time (business days from open to scope approval): NIR vs baseline",
    observationType: "cycle_time",
    minNirSampleSize: 50,
    minControlSampleSize: 0, // Historical baseline is a stated figure, not new observations
    evaluate(nir) {
      if (nir.length < 50) {
        return {
          met: false,
          summary: `${nir.length}/50 NIR cycle time observations (need ≥50 completed pilot inspections across ≥3 companies)`,
          metricValue: null,
          threshold: "median < 5 business days",
          sufficientData: false,
          observationsNeeded: 50 - nir.length,
        };
      }
      const nirMedian = median(nir.map((o) => o.value));
      const met = nirMedian < 5;
      const companies = new Set(
        nir.map((o) => o.context?.["companyId"]).filter(Boolean),
      ).size;
      return {
        met: met && companies >= 3,
        summary:
          met && companies >= 3
            ? `NIR median cycle time ${nirMedian.toFixed(1)} business days across ${companies} companies (target <5 days)`
            : met
              ? `NIR median ${nirMedian.toFixed(1)} days — but only ${companies}/3 required companies represented`
              : `NIR median ${nirMedian.toFixed(1)} days — target <5 business days (${companies} companies)`,
        metricValue: nirMedian,
        threshold: "< 5 business days across ≥3 companies",
        sufficientData: true,
        observationsNeeded: 0,
      };
    },
  },
];

// ─── STATISTICS HELPERS ───────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Welch's t-test — returns approximate p-value for two-sided test.
 * Uses Student's t CDF approximation suitable for large samples (n≥30).
 * For smaller samples, actual statistical software should be used.
 */
function welchTTest(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 1;
  const meanA = mean(a),
    varA = variance(a),
    nA = a.length;
  const meanB = mean(b),
    varB = variance(b),
    nB = b.length;
  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return meanA === meanB ? 1 : 0;
  const t = Math.abs((meanA - meanB) / se);
  // Approximate p-value using normal distribution for large samples
  // p ≈ 2 * (1 - Φ(|t|)) where Φ is the standard normal CDF
  return 2 * (1 - normalCDF(t));
}

/** Cumulative distribution function for standard normal — Abramowitz & Stegun approximation */
function normalCDF(x: number): number {
  const p = 0.2316419;
  const b = [0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const t = 1 / (1 + p * x);
  const poly = b.reduce((acc, coef, i) => acc + coef * t ** (i + 1), 0);
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
}

// ─── DERIVED OBSERVATIONS ─────────────────────────────────────────────────────

export interface InspectionForCycleTime {
  id: string;
  inspectionDate: Date | string | null;
  completedAt: Date | string | null;
  userId: string;
  status: string;
}

/**
 * Auto-derive CLAIM-007 cycle time observations from existing inspection data.
 *
 * Converts the gap between `inspectionDate` and `completedAt` to business days.
 * Only COMPLETED inspections are included.
 *
 * @param inspections - Fetched from Prisma (COMPLETED status, with dates)
 * @param companyId   - The company/org these inspections belong to (for ≥3 company check)
 * @returns Array of PilotObservation-shaped objects (without DB id/createdAt)
 */
export function deriveCycleTimeObservations(
  inspections: InspectionForCycleTime[],
  companyId: string,
): Omit<PilotObservation, "id" | "createdAt">[] {
  return inspections
    .filter(
      (i) => i.status === "COMPLETED" && i.inspectionDate && i.completedAt,
    )
    .map((i) => {
      const start = new Date(i.inspectionDate!);
      const end = new Date(i.completedAt!);
      const businessDays = calcBusinessDays(start, end);
      return {
        claimId: "CLAIM-007",
        observationType: "cycle_time" as ObservationType,
        value: businessDays,
        group: "nir" as PilotGroup,
        inspectionId: i.id,
        recordedByUserId: i.userId,
        context: { companyId, derivedFrom: "inspection_timestamps" },
        notes: `Auto-derived: ${start.toLocaleDateString("en-AU")} → ${end.toLocaleDateString("en-AU")} = ${businessDays} business days`,
      };
    });
}

/** Count business days (Mon–Fri) between two dates */
function calcBusinessDays(start: Date, end: Date): number {
  let days = 0;
  const cur = new Date(start);
  while (cur < end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── READINESS EVALUATION ─────────────────────────────────────────────────────

export interface ClaimReadinessResult {
  claim: EvidenceClaim;
  criteria: ClaimCriteria;
  evaluation: ClaimEvaluation;
  nirObservationCount: number;
  controlObservationCount: number;
  /** Whether this claim is ready to be promoted to VALIDATED */
  readyToPromote: boolean;
}

export interface PilotReport {
  generatedAt: string;
  /** Claims that are ready for promotion (all criteria met) */
  readyToPromote: ClaimReadinessResult[];
  /** Claims that are still in progress */
  inProgress: ClaimReadinessResult[];
  /** Total observations recorded */
  totalObservations: number;
  /** Compact action items for the product lead */
  actionItems: string[];
  /** Whether all HYPOTHESIS claims are ready — signals the pilot is complete */
  pilotComplete: boolean;
}

/**
 * Evaluate the readiness of a single HYPOTHESIS claim.
 *
 * @param claimId       - The claim ID from EVIDENCE_REGISTER
 * @param observations  - All recorded observations (will be filtered to this claim)
 */
export function evaluateClaimReadiness(
  claimId: string,
  observations: PilotObservation[],
): ClaimReadinessResult | null {
  const criteria = PILOT_CRITERIA.find((c) => c.claimId === claimId);
  if (!criteria) return null;

  const claim = EVIDENCE_REGISTER.find((c) => c.id === claimId);
  if (!claim || (claim.status !== "HYPOTHESIS" && claim.status !== "DERIVED"))
    return null;

  const claimObs = observations.filter((o) => o.claimId === claimId);
  const nirObs = claimObs.filter((o) => o.group === "nir");
  const controlObs = claimObs.filter((o) => o.group === "control");
  const evaluation = criteria.evaluate(nirObs, controlObs);

  return {
    claim,
    criteria,
    evaluation,
    nirObservationCount: nirObs.length,
    controlObservationCount: controlObs.length,
    readyToPromote: evaluation.met && evaluation.sufficientData,
  };
}

/**
 * Generate the full pilot readiness report.
 *
 * This is the main function called by the readiness API endpoint.
 * The product lead reads this report to determine when to open a promotion PR.
 *
 * @param observations - All pilot observations from the database
 */
export function generatePilotReport(
  observations: PilotObservation[],
): PilotReport {
  const hypothesisClaims = EVIDENCE_REGISTER.filter(
    (c) => c.status === "HYPOTHESIS" || c.status === "DERIVED",
  );

  const results: ClaimReadinessResult[] = hypothesisClaims
    .map((c) => evaluateClaimReadiness(c.id, observations))
    .filter((r): r is ClaimReadinessResult => r !== null);

  const readyToPromote = results.filter((r) => r.readyToPromote);
  const inProgress = results.filter((r) => !r.readyToPromote);

  // Build action items
  const actionItems: string[] = [];

  for (const r of inProgress) {
    const { evaluation, criteria } = r;
    if (!evaluation.sufficientData) {
      const nir = r.nirObservationCount;
      const ctrl = r.controlObservationCount;
      const needNir = Math.max(0, criteria.minNirSampleSize - nir);
      const needCtrl = Math.max(0, criteria.minControlSampleSize - ctrl);
      const parts: string[] = [];
      if (needNir > 0)
        parts.push(
          `${needNir} more NIR ${criteria.observationType.replace(/_/g, " ")} observations`,
        );
      if (needCtrl > 0)
        parts.push(
          `${needCtrl} more control ${criteria.observationType.replace(/_/g, " ")} observations`,
        );
      actionItems.push(
        `${r.claim.id}: Collect ${parts.join(" + ")} — ${criteria.description}`,
      );
    } else {
      actionItems.push(
        `${r.claim.id}: Data collected but threshold not yet met — ${evaluation.summary}`,
      );
    }
  }

  for (const r of readyToPromote) {
    actionItems.push(
      `${r.claim.id} ✓ READY: Update lib/nir-evidence-architecture.ts → status: 'VALIDATED', ` +
        `open PR with evidence summary: "${r.evaluation.summary}"`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    readyToPromote,
    inProgress,
    totalObservations: observations.length,
    actionItems,
    pilotComplete:
      readyToPromote.length === results.length && results.length > 0,
  };
}

/**
 * Validate that a new observation is well-formed before writing to the database.
 */
export function validateObservation(obs: NewPilotObservation): string[] {
  const errors: string[] = [];

  const validClaimIds = PILOT_CRITERIA.map((c) => c.claimId);
  if (!validClaimIds.includes(obs.claimId)) {
    errors.push(
      `claimId '${obs.claimId}' is not a HYPOTHESIS claim. Valid: ${validClaimIds.join(", ")}`,
    );
  }

  const criteria = PILOT_CRITERIA.find((c) => c.claimId === obs.claimId);
  if (criteria && obs.observationType !== criteria.observationType) {
    errors.push(
      `observationType '${obs.observationType}' does not match expected '${criteria.observationType}' for ${obs.claimId}`,
    );
  }

  if (typeof obs.value !== "number" || isNaN(obs.value)) {
    errors.push("value must be a valid number");
  }

  if (obs.claimId === "CLAIM-005" && (obs.value < 1 || obs.value > 5)) {
    errors.push("CLAIM-005 technician survey values must be 1–5");
  }

  if (obs.claimId === "CLAIM-003" && obs.value !== 0 && obs.value !== 1) {
    errors.push(
      "CLAIM-003 reinspection_event values must be 0 (no re-inspection) or 1 (re-inspection required)",
    );
  }

  if (obs.group && obs.group !== "nir" && obs.group !== "control") {
    errors.push("group must be 'nir' or 'control'");
  }

  return errors;
}

/** Export criteria for admin UI display */
export { PILOT_CRITERIA };
