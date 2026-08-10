/**
 * Presentation helpers for the Field Evidence Checklist panel (RA-5039).
 *
 * Pure functions — no I/O. Keeps progress counts, area-gap dedupe, and
 * step grouping out of the React tree so they stay unit-testable.
 */

import type {
  AffectedAreaEvidenceGap,
  ChecklistItem,
  FieldEvidenceChecklist,
} from "./field-evidence-checklist";

export interface ChecklistProgressSummary {
  requiredTotal: number;
  requiredPresent: number;
  requiredMissing: number;
  requiredWeak: number;
  recommendedTotal: number;
  recommendedPresent: number;
  recommendedMissing: number;
  recommendedWeak: number;
  uniqueAreaGaps: AffectedAreaEvidenceGap[];
  unlinkedCount: number;
  isGuidanceComplete: boolean;
}

export interface ChecklistStepGroup {
  stepKey: string;
  stepTitle: string;
  items: ChecklistItem[];
}

/** Collapse duplicate declared areas that share a room/zone label. */
export function dedupeAffectedAreaGaps(
  gaps: AffectedAreaEvidenceGap[],
): AffectedAreaEvidenceGap[] {
  const seen = new Set<string>();
  const unique: AffectedAreaEvidenceGap[] = [];
  for (const gap of gaps) {
    const key = gap.roomZoneId.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(gap);
  }
  return unique;
}

/** Group checklist rows by workflow step, preserving first-seen order. */
export function groupChecklistItemsByStep(
  items: ChecklistItem[],
): ChecklistStepGroup[] {
  const order: string[] = [];
  const map = new Map<string, ChecklistStepGroup>();

  for (const item of items) {
    const existing = map.get(item.stepKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    order.push(item.stepKey);
    map.set(item.stepKey, {
      stepKey: item.stepKey,
      stepTitle: item.stepTitle,
      items: [item],
    });
  }

  return order.map((key) => map.get(key)!);
}

export function summarizeChecklistProgress(
  checklist: FieldEvidenceChecklist,
): ChecklistProgressSummary {
  const required = checklist.categories.required;
  const recommended = checklist.categories.recommended;

  const requiredPresent = required.filter((i) => i.status === "present").length;
  const requiredMissing = required.filter((i) => i.status === "missing").length;
  const requiredWeak = required.filter((i) => i.status === "weak").length;

  const recommendedPresent = recommended.filter(
    (i) => i.status === "present",
  ).length;
  const recommendedMissing = recommended.filter(
    (i) => i.status === "missing",
  ).length;
  const recommendedWeak = recommended.filter((i) => i.status === "weak").length;

  const uniqueAreaGaps = dedupeAffectedAreaGaps(checklist.gapsByAffectedArea);
  const unlinkedCount = checklist.unlinkedEvidence.length;

  const isGuidanceComplete =
    requiredMissing === 0 &&
    recommendedMissing === 0 &&
    requiredWeak === 0 &&
    recommendedWeak === 0 &&
    uniqueAreaGaps.length === 0 &&
    unlinkedCount === 0;

  return {
    requiredTotal: required.length,
    requiredPresent,
    requiredMissing,
    requiredWeak,
    recommendedTotal: recommended.length,
    recommendedPresent,
    recommendedMissing,
    recommendedWeak,
    uniqueAreaGaps,
    unlinkedCount,
    isGuidanceComplete,
  };
}

export function captureStepHref(
  inspectionId: string,
  stepKey: string,
): string {
  const params = new URLSearchParams({ step: stepKey });
  return `/dashboard/inspections/${inspectionId}/capture?${params.toString()}`;
}

export function captureHref(inspectionId: string): string {
  return `/dashboard/inspections/${inspectionId}/capture`;
}

export function areasHref(inspectionId: string): string {
  return `/dashboard/inspections/${inspectionId}?tab=areas`;
}
