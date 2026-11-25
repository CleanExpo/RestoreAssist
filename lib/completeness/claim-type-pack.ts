/**
 * RA-8337 — pick the completeness pack by claim type.
 *
 * Before this, every caller ran the water-damage pack for every job, so a
 * fire or mould job was blocked on water category/class and a baseline
 * moisture reading. This dispatcher is the single place that decides which
 * pack applies. Callers gather the facts once and pass them in.
 *
 * Only the water pack has type-specific requirements today. Every other
 * claim type gets the baseline pack: the facts any claim needs, taken from
 * the water pack's non-water items. No type-specific requirement is invented
 * here and no standard section is cited.
 */

import {
  evaluateWaterDamageCompleteness,
  type CompletenessFact,
} from "./water-damage-pack";

export type CompletenessPackId = "water" | "baseline";

export type CompletenessPack = {
  packId: CompletenessPackId;
  facts: CompletenessFact[];
  blocking: string[];
  completionPercent: number;
};

export type CompletenessFacts = {
  hasClient: boolean;
  hasCategoryClass: boolean;
  hasIncidentDate: boolean;
  hasBaseline: boolean;
  hasMonitoringPoint: boolean;
  photoCount: number;
  minPhotos?: number;
};

/**
 * Claim types that use the water pack. A null claim type keeps the water
 * pack, because the job page treats an unset claim type as WATER and that is
 * what every job was graded against before RA-8337.
 */
function usesWaterPack(claimType: string | null | undefined): boolean {
  if (claimType == null || claimType === "") return true;
  return claimType.toUpperCase() === "WATER";
}

/**
 * Facts every claim needs, whatever the loss. These are the water pack's
 * items that are not about water or drying.
 *
 * TODO(RA-8337): FIRE, MOULD, CONTENTS and BIOHAZARD (and STORM, ODOUR,
 * CARPET, HVAC, ASBESTOS) need their own type-specific lists. Which items
 * belong in each is a founder decision; until then they use this pack only.
 */
function evaluateBaselineCompleteness(
  input: CompletenessFacts,
): CompletenessPack {
  const minPhotos = input.minPhotos ?? 5;
  const facts: CompletenessFact[] = [
    {
      id: "client",
      label: "Customer linked to job",
      satisfied: input.hasClient,
      blocking: true,
      ruleSource: "V1 P3-2",
    },
    {
      id: "loss_date",
      label: "Date of loss captured",
      satisfied: input.hasIncidentDate,
      blocking: true,
      ruleSource: "V1 P1-9",
    },
    {
      id: "photos",
      label: `Site photos (≥${minPhotos})`,
      satisfied: input.photoCount >= minPhotos,
      blocking: false,
      ruleSource: "Evidence workflow",
    },
  ];
  const blocking = facts
    .filter((f) => f.blocking && !f.satisfied)
    .map((f) => f.id);
  const satisfiedCount = facts.filter((f) => f.satisfied).length;
  const completionPercent = Math.round((satisfiedCount / facts.length) * 100);
  return { packId: "baseline", facts, blocking, completionPercent };
}

export function evaluateCompletenessForClaimType(
  claimType: string | null | undefined,
  input: CompletenessFacts,
): CompletenessPack {
  if (usesWaterPack(claimType)) {
    return { packId: "water", ...evaluateWaterDamageCompleteness(input) };
  }
  return evaluateBaselineCompleteness(input);
}
