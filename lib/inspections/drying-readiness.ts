/**
 * Sign-off drying readiness (North Star — a veteran won't sign off a job while
 * materials are still above their dry standard or without a dry-standard
 * reference to validate against; a first-week technician might, causing mould
 * and callbacks). Pure assessment composing the per-reading dryness primitive.
 *
 * Read-only / advisory: surfaced to the close-confirm UI and dashboards. It does
 * NOT touch the close transaction.
 */

import {
  assessReadingDryness,
  type ReadingInput,
} from "@/lib/moisture/reading-dryness";

export interface DryingReadinessInput extends ReadingInput {
  location?: string | null;
  isBaseline?: boolean;
}

export interface DryingReadiness {
  /** True only when drying is validated: readings exist, a baseline exists, nothing still wet. */
  ready: boolean;
  /** Readings that could be assessed against a known dry standard. */
  totalAssessed: number;
  wetCount: number;
  hasBaseline: boolean;
  wet: Array<{ location: string | null; material: string; summary: string }>;
  /** Veteran reasons the job is not yet ready to sign off, in priority order. */
  blockers: string[];
}

export function assessDryingReadiness(
  readings: DryingReadinessInput[],
): DryingReadiness {
  const wet: DryingReadiness["wet"] = [];
  let totalAssessed = 0;
  let hasBaseline = false;

  for (const reading of readings) {
    if (reading.isBaseline) hasBaseline = true;
    const assessed = assessReadingDryness(reading);
    if (assessed.status === "unknown") continue;
    totalAssessed += 1;
    if (assessed.status === "not_dry") {
      wet.push({
        location: reading.location ?? null,
        material: assessed.material,
        summary: `${reading.location ? `${reading.location} — ` : ""}${assessed.material} at ${assessed.currentMc}% is above the ${assessed.targetMc}% dry standard`,
      });
    }
  }

  const blockers: string[] = [];
  if (readings.length === 0) {
    blockers.push("no moisture readings recorded");
  } else if (!hasBaseline) {
    blockers.push(
      "no dry-standard reference (baseline) reading — drying cannot be validated (S500 §12.2)",
    );
  }
  if (wet.length > 0) {
    blockers.push(
      `${wet.length} material${wet.length === 1 ? "" : "s"} still above the dry standard`,
    );
  }

  return {
    ready: blockers.length === 0,
    totalAssessed,
    wetCount: wet.length,
    hasBaseline,
    wet,
    blockers,
  };
}
