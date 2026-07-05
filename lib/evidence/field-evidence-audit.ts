/**
 * RA-5039 PR1 — Field evidence completeness audit.
 *
 * Read-only, additive. Does NOT call into or modify the three existing
 * completeness systems (lib/evidence/submission-gate.ts +
 * submission-validator.ts, the tier-response completeness routes, or the
 * dashboard relation-count checker) — see the 2026-07-05 RA-5039 audit
 * comment for the full inventory.
 *
 * `buildFieldEvidenceChecklist` is a pure function: given the exact rows
 * already captured, it reports what's present, weak, or missing. It never
 * infers evidence that wasn't recorded. `auditInspectionById` is the thin
 * I/O wrapper that loads those rows and calls the pure builder.
 *
 * Evidence classes are looked up straight from
 * `WORKFLOW_TEMPLATES[jobType]` (lib/evidence/workflow-definitions.ts) —
 * required = classes listed on mandatory steps; recommended = everything
 * else the template calls for (optional classes on mandatory steps, plus
 * both required and optional classes on non-mandatory steps).
 *
 * Measurement evidence is split across three unreconciled stores — this
 * audit queries all three rather than picking one:
 *   - MOISTURE_READING:      MoistureReading table + EvidenceItem rows
 *   - AMBIENT_ENVIRONMENTAL: PsychrometricReading table + EvidenceItem rows
 *   - everything else:       EvidenceItem rows only
 *
 * Affected-area linkage is soft strings by design (RA-1196) — room tags on
 * EvidenceItem.roomName / MoistureReading.affectedArea that don't match a
 * declared AffectedArea.roomZoneId are surfaced via `unlinkedEvidence`,
 * never dropped.
 */

import type { EvidenceItemStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  EVIDENCE_CLASS_LABELS,
  EVIDENCE_S500_REFS,
  type EvidenceClass,
} from "@/lib/types/evidence";
import {
  getWorkflowTemplate,
  type WorkflowStepDefinition,
} from "./workflow-definitions";
import { normalizeClaimType } from "./claim-type";
import { scoreEvidenceItem, type EvidenceItemForQA } from "./qa-scorer";
import type {
  AffectedAreaEvidenceGap,
  ChecklistItem,
  ChecklistItemStatus,
  FieldEvidenceChecklist,
} from "./field-evidence-checklist";

// ============================================
// INPUT SHAPES
// ============================================

export interface InspectionForAudit {
  id: string;
  claimType: string | null;
}

export interface EvidenceItemForAudit extends EvidenceItemForQA {
  status: EvidenceItemStatus;
  roomName: string | null;
}

export interface MoistureReadingForAudit {
  affectedArea: string | null;
}

export interface PsychrometricReadingForAudit {
  id: string;
}

export interface AffectedAreaForAudit {
  roomZoneId: string;
}

// ============================================
// HELPERS
// ============================================

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Evidence classes backed by an additional legacy measurement table,
 * beyond the EvidenceItem workflow-capture path. */
const SUPPLEMENTARY_COUNTS: Partial<
  Record<
    EvidenceClass,
    (
      moistureReadings: MoistureReadingForAudit[],
      psychrometricReadings: PsychrometricReadingForAudit[],
    ) => number
  >
> = {
  MOISTURE_READING: (moistureReadings) => moistureReadings.length,
  AMBIENT_ENVIRONMENTAL: (_moistureReadings, psychrometricReadings) =>
    psychrometricReadings.length,
};

function buildChecklistItem(
  evidenceClass: EvidenceClass,
  step: WorkflowStepDefinition,
  evidenceItems: EvidenceItemForAudit[],
  moistureReadings: MoistureReadingForAudit[],
  psychrometricReadings: PsychrometricReadingForAudit[],
): ChecklistItem {
  const matchingItems = evidenceItems.filter(
    (item) => item.evidenceClass === evidenceClass && item.status !== "REJECTED",
  );

  const supplementary = SUPPLEMENTARY_COUNTS[evidenceClass]?.(
    moistureReadings,
    psychrometricReadings,
  ) ?? 0;
  const capturedCount = matchingItems.length + supplementary;

  const scores = matchingItems.map((item) => scoreEvidenceItem(item).score);
  const averageQaScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;

  let status: ChecklistItemStatus;
  if (capturedCount === 0) {
    status = "missing";
  } else if (
    capturedCount < step.minimumEvidenceCount ||
    (averageQaScore !== null && averageQaScore < 70)
  ) {
    status = "weak";
  } else {
    status = "present";
  }

  return {
    evidenceClass,
    displayName: EVIDENCE_CLASS_LABELS[evidenceClass],
    stepKey: step.stepKey,
    stepTitle: step.stepTitle,
    riskTier: step.riskTier,
    requiredCount: step.minimumEvidenceCount,
    capturedCount,
    status,
    averageQaScore,
    s500Ref: EVIDENCE_S500_REFS[evidenceClass] ?? null,
  };
}

// ============================================
// PURE BUILDER
// ============================================

/**
 * Build the FieldEvidenceChecklist for an inspection from already-loaded
 * rows. Pure — no I/O. An evidence class is "present" only if a matching
 * row exists; nothing here is inferred.
 */
export function buildFieldEvidenceChecklist(
  inspection: InspectionForAudit,
  evidenceItems: EvidenceItemForAudit[],
  moistureReadings: MoistureReadingForAudit[],
  psychrometricReadings: PsychrometricReadingForAudit[],
  affectedAreas: AffectedAreaForAudit[],
): FieldEvidenceChecklist {
  const jobType = normalizeClaimType(inspection.claimType);
  if (!jobType) {
    throw new Error(
      `Cannot build a field evidence checklist for inspection ${inspection.id}: ` +
        `claimType "${inspection.claimType ?? "null"}" does not map to a known workflow job type.`,
    );
  }

  const template = getWorkflowTemplate(jobType);

  // Pass 1 — REQUIRED: requiredEvidenceClasses from mandatory steps.
  // First occurrence wins (mirrors submission-validator's phase-map rule).
  const requiredSteps = new Map<EvidenceClass, WorkflowStepDefinition>();
  for (const step of template.steps) {
    if (!step.isMandatory) continue;
    for (const cls of step.requiredEvidenceClasses) {
      if (!requiredSteps.has(cls)) {
        requiredSteps.set(cls, step);
      }
    }
  }

  // Pass 2 — RECOMMENDED: everything else the template calls for, excluding
  // anything already REQUIRED — optional classes on mandatory steps, plus
  // both required and optional classes on non-mandatory steps.
  const recommendedSteps = new Map<EvidenceClass, WorkflowStepDefinition>();
  for (const step of template.steps) {
    const candidates = step.isMandatory
      ? step.optionalEvidenceClasses
      : [...step.requiredEvidenceClasses, ...step.optionalEvidenceClasses];
    for (const cls of candidates) {
      if (requiredSteps.has(cls) || recommendedSteps.has(cls)) continue;
      recommendedSteps.set(cls, step);
    }
  }

  const required = Array.from(requiredSteps.entries()).map(([cls, step]) =>
    buildChecklistItem(
      cls,
      step,
      evidenceItems,
      moistureReadings,
      psychrometricReadings,
    ),
  );
  const recommended = Array.from(recommendedSteps.entries()).map(([cls, step]) =>
    buildChecklistItem(
      cls,
      step,
      evidenceItems,
      moistureReadings,
      psychrometricReadings,
    ),
  );

  const gapsByEvidenceClass: FieldEvidenceChecklist["gapsByEvidenceClass"] = {};
  for (const item of [...required, ...recommended]) {
    if (item.status !== "present") {
      gapsByEvidenceClass[item.evidenceClass] = item;
    }
  }

  const roomZoneTags = new Set(
    affectedAreas.map((area) => normalizeTag(area.roomZoneId)),
  );

  const gapsByAffectedArea: AffectedAreaEvidenceGap[] = [];
  for (const area of affectedAreas) {
    const key = normalizeTag(area.roomZoneId);
    const evidenceCount =
      evidenceItems.filter(
        (item) =>
          item.status !== "REJECTED" &&
          item.roomName != null &&
          normalizeTag(item.roomName) === key,
      ).length +
      moistureReadings.filter(
        (reading) =>
          reading.affectedArea != null && normalizeTag(reading.affectedArea) === key,
      ).length;

    if (evidenceCount === 0) {
      gapsByAffectedArea.push({ roomZoneId: area.roomZoneId, evidenceCount: 0 });
    }
  }

  const unlinkedTags = new Set<string>();
  for (const item of evidenceItems) {
    const tag = item.roomName?.trim();
    if (tag && !roomZoneTags.has(normalizeTag(tag))) {
      unlinkedTags.add(tag);
    }
  }
  for (const reading of moistureReadings) {
    const tag = reading.affectedArea?.trim();
    if (tag && !roomZoneTags.has(normalizeTag(tag))) {
      unlinkedTags.add(tag);
    }
  }

  return {
    inspectionId: inspection.id,
    claimType: jobType,
    generatedAt: new Date().toISOString(),
    categories: { required, recommended },
    gapsByEvidenceClass,
    gapsByAffectedArea,
    unlinkedEvidence: Array.from(unlinkedTags).sort(),
  };
}

// ============================================
// I/O WRAPPER
// ============================================

const EVIDENCE_ITEM_SELECT = {
  id: true,
  evidenceClass: true,
  status: true,
  fileUrl: true,
  fileSizeBytes: true,
  description: true,
  capturedLat: true,
  capturedLng: true,
  capturedAt: true,
  structuredData: true,
  roomName: true,
} as const;

/**
 * Load an inspection's evidence rows across all three measurement stores
 * and build its FieldEvidenceChecklist. Callers must have already verified
 * the caller owns this inspection (see lib/auth/assert-tenancy.ts) — this
 * function does not itself scope by user.
 */
export async function auditInspectionById(
  inspectionId: string,
): Promise<FieldEvidenceChecklist> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { id: true, claimType: true },
  });
  if (!inspection) {
    throw new Error(`Inspection ${inspectionId} not found`);
  }

  const [evidenceItems, moistureReadings, psychrometricReadings, affectedAreas] =
    await Promise.all([
      prisma.evidenceItem.findMany({
        where: { inspectionId },
        select: EVIDENCE_ITEM_SELECT,
        orderBy: { capturedAt: "desc" },
        take: 500,
      }),
      prisma.moistureReading.findMany({
        where: { inspectionId },
        select: { affectedArea: true },
        orderBy: { recordedAt: "desc" },
        take: 500,
      }),
      prisma.psychrometricReading.findMany({
        where: { inspectionId },
        select: { id: true },
        orderBy: { visitNumber: "desc" },
        take: 500,
      }),
      prisma.affectedArea.findMany({
        where: { inspectionId },
        select: { roomZoneId: true },
        take: 200,
      }),
    ]);

  return buildFieldEvidenceChecklist(
    { id: inspection.id, claimType: inspection.claimType },
    evidenceItems,
    moistureReadings,
    psychrometricReadings,
    affectedAreas,
  );
}
