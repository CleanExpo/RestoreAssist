/**
 * ANSI/IICRC S500:2021 drying validation (spec §5.2, §12 `SketchMoistureReading`).
 *
 * Compares a moisture-content reading against the dry standard for the material
 * (or an explicit target) and reports whether the dry standard is met. Per spec
 * §6.4 only `operator_measured` geometry feeds drying calcs — that filtering is
 * applied upstream (see `lib/sketch/measured-elements.ts`); this module is the
 * pure met / not-met evaluation.
 */

import { getMaterial } from "./materials";

export type DryStatus = "dry" | "not_dry";

export interface DryEvaluation {
  dryStandardMet: boolean;
  status: DryStatus;
  /** The dry-standard MC (%) used — explicit target, else material default. */
  targetMc: number;
  currentMc: number;
  /** currentMc - targetMc. Negative or zero means dry. */
  marginMc: number;
}

export interface DryInput {
  currentMc: number;
  /** Explicit dry-standard override (%). Takes precedence over the material default. */
  targetMc?: number;
  /** Material slug used to look up a default dry standard. */
  materialId?: string;
}

export function evaluateDrying(input: DryInput): DryEvaluation {
  const { currentMc, targetMc, materialId } = input;

  let resolvedTarget = targetMc;
  if (resolvedTarget === undefined && materialId) {
    resolvedTarget = getMaterial(materialId)?.dryStandardMc;
  }

  if (resolvedTarget === undefined) {
    throw new Error(
      "evaluateDrying requires either an explicit targetMc or a known materialId with a dry standard",
    );
  }

  const dryStandardMet = currentMc <= resolvedTarget;

  return {
    dryStandardMet,
    status: dryStandardMet ? "dry" : "not_dry",
    targetMc: resolvedTarget,
    currentMc,
    marginMc: currentMc - resolvedTarget,
  };
}
