/**
 * RA-8002 slice 1 — the "before you leave" evidence action list.
 *
 * Turns the Field Evidence Checklist (RA-5039) into an ordered list of
 * actions a technician can work through before leaving site. Each action says
 * why it is there (reason), what rule put it there (source), who owns it
 * (ownerRole) and gives one direct link to fix it.
 *
 * Deterministic and pure: no AI, no I/O, no new rules. It reads only what
 * buildFieldEvidenceChecklist already reported, so it cannot disagree with
 * the checklist panel, and it never infers evidence that was not recorded.
 *
 * Advisory only (RA-7076): `advisory` is always true. Nothing here blocks a
 * submission or a status change; the existing submission gate keeps its own
 * rules. A room with no evidence is "not recorded yet", never "unaffected".
 *
 * `key` is stable for the same gap, so a later slice can bind an
 * accept/dismiss verdict to it without storing a copy of the job data.
 */

import type { EvidenceClass } from "@prisma/client";
import type {
  ChecklistItem,
  FieldEvidenceChecklist,
} from "./field-evidence-checklist";
import {
  areasHref,
  captureHref,
  captureStepHref,
} from "./field-evidence-checklist-view";

/** Below this average QA score an item counts as weak (field-evidence-audit). */
const WEAK_QA_THRESHOLD = 70;

export type BeforeYouLeaveActionKind =
  | "missing_required"
  | "weak_required"
  | "room_without_evidence"
  | "unlinked_room_tag"
  | "missing_recommended"
  | "weak_recommended";

export type BeforeYouLeaveSource =
  | {
      type: "workflow_step";
      stepKey: string;
      stepTitle: string;
      s500Ref: string | null;
    }
  | { type: "affected_area"; roomZoneId: string }
  | { type: "room_tag"; tag: string };

export interface BeforeYouLeaveAction {
  key: string;
  kind: BeforeYouLeaveActionKind;
  priority: "required" | "room" | "recommended";
  roomZoneId: string | null;
  evidenceClass: EvidenceClass | null;
  reason: string;
  source: BeforeYouLeaveSource;
  ownerRole: "technician";
  advisory: true;
  action: { label: string; href: string };
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Lowest risk tier first; within a tier, missing before weak. Stable. */
function byRiskTier(a: ChecklistItem, b: ChecklistItem): number {
  if (a.riskTier !== b.riskTier) return a.riskTier - b.riskTier;
  const rank = (item: ChecklistItem) => (item.status === "missing" ? 0 : 1);
  return rank(a) - rank(b);
}

function itemAction(
  inspectionId: string,
  item: ChecklistItem,
  priority: "required" | "recommended",
): BeforeYouLeaveAction | null {
  if (item.status === "present") return null;

  const missing = item.status === "missing";
  const kind: BeforeYouLeaveActionKind = `${missing ? "missing" : "weak"}_${priority}`;
  const lowQuality =
    !missing &&
    item.capturedCount >= item.requiredCount &&
    item.averageQaScore !== null &&
    item.averageQaScore < WEAK_QA_THRESHOLD;

  let reason: string;
  let label: string;
  if (missing) {
    reason = `${item.displayName} not recorded yet: 0 of ${item.requiredCount} captured.`;
    label = `Capture ${item.displayName}`;
  } else if (lowQuality) {
    reason = `${item.displayName} needs a better capture: average quality score ${item.averageQaScore} of 100.`;
    label = `Retake ${item.displayName}`;
  } else {
    reason = `${item.displayName} is short: ${item.capturedCount} of ${item.requiredCount} captured.`;
    label = `Capture more ${item.displayName}`;
  }

  return {
    key: `${priority}:${item.evidenceClass}`,
    kind,
    priority,
    roomZoneId: null,
    evidenceClass: item.evidenceClass,
    reason,
    source: {
      type: "workflow_step",
      stepKey: item.stepKey,
      stepTitle: item.stepTitle,
      s500Ref: item.s500Ref,
    },
    ownerRole: "technician",
    advisory: true,
    action: { label, href: captureStepHref(inspectionId, item.stepKey) },
  };
}

/**
 * Build the ordered before-you-leave actions for one inspection's checklist.
 *
 * Order: required gaps (lowest risk tier first, missing before weak), rooms with no evidence,
 * evidence tagged to an undeclared room, then recommended gaps.
 */
export function buildBeforeYouLeaveActions(
  checklist: FieldEvidenceChecklist,
): BeforeYouLeaveAction[] {
  const { inspectionId } = checklist;
  const actions: BeforeYouLeaveAction[] = [];
  const seen = new Set<string>();
  const push = (action: BeforeYouLeaveAction | null) => {
    if (!action || seen.has(action.key)) return;
    seen.add(action.key);
    actions.push(action);
  };

  for (const item of [...checklist.categories.required].sort(byRiskTier)) {
    push(itemAction(inspectionId, item, "required"));
  }

  for (const gap of checklist.gapsByAffectedArea) {
    const room = gap.roomZoneId.trim();
    push({
      key: `room:${normalizeTag(room)}`,
      kind: "room_without_evidence",
      priority: "room",
      roomZoneId: room,
      evidenceClass: null,
      reason: `${room} is listed as an affected area but has no photos or readings tagged to it yet.`,
      source: { type: "affected_area", roomZoneId: room },
      ownerRole: "technician",
      advisory: true,
      action: {
        label: `Capture evidence in ${room}`,
        href: captureHref(inspectionId),
      },
    });
  }

  for (const rawTag of checklist.unlinkedEvidence) {
    const tag = rawTag.trim();
    push({
      key: `unlinked:${normalizeTag(tag)}`,
      kind: "unlinked_room_tag",
      priority: "room",
      roomZoneId: tag,
      evidenceClass: null,
      reason: `Evidence is tagged to "${tag}", which is not one of the declared affected areas.`,
      source: { type: "room_tag", tag },
      ownerRole: "technician",
      advisory: true,
      action: { label: "Check room assignment", href: areasHref(inspectionId) },
    });
  }

  for (const item of [...checklist.categories.recommended].sort(byRiskTier)) {
    push(itemAction(inspectionId, item, "recommended"));
  }

  return actions;
}
