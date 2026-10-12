/**
 * V1 Phase 4 (P4-3) — deterministic water-damage completeness pack.
 */

export type CompletenessFact = {
  id: string;
  label: string;
  satisfied: boolean;
  blocking: boolean;
  ruleSource: string;
};

export type WaterDamageCompletenessPack = {
  facts: CompletenessFact[];
  blocking: string[];
  completionPercent: number;
};

export function evaluateWaterDamageCompleteness(input: {
  hasClient: boolean;
  hasCategoryClass: boolean;
  hasIncidentDate: boolean;
  hasBaseline: boolean;
  hasMonitoringPoint: boolean;
  photoCount: number;
  minPhotos?: number;
}): WaterDamageCompletenessPack {
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
      id: "s500",
      label: "Water category and class recorded",
      satisfied: input.hasCategoryClass,
      blocking: true,
      ruleSource: "IICRC S500 intake",
    },
    {
      id: "loss_date",
      label: "Date of loss captured",
      satisfied: input.hasIncidentDate,
      blocking: true,
      ruleSource: "V1 P1-9",
    },
    {
      id: "baseline",
      label: "Baseline moisture reference",
      satisfied: input.hasBaseline,
      blocking: true,
      ruleSource: "V1 P1-1",
    },
    {
      id: "monitoring",
      label: "Fixed monitoring point",
      satisfied: input.hasMonitoringPoint,
      blocking: false,
      ruleSource: "V1 drying discipline",
    },
    {
      id: "photos",
      label: `Site photos (≥${minPhotos})`,
      satisfied: input.photoCount >= minPhotos,
      blocking: false,
      ruleSource: "Evidence workflow",
    },
  ];

  const blocking = facts.filter((f) => f.blocking && !f.satisfied).map((f) => f.id);
  const satisfiedCount = facts.filter((f) => f.satisfied).length;
  const completionPercent = Math.round((satisfiedCount / facts.length) * 100);

  return { facts, blocking, completionPercent };
}
