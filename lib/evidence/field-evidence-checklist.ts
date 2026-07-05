/**
 * RA-5039 PR1 — Field Evidence Completeness Checklist contract.
 *
 * Additive: this does NOT replace or call into the three existing
 * completeness systems (submission-gate/submission-validator, the
 * tier-response completeness routes, or the dashboard relation-count
 * checker). See the 2026-07-05 audit comment on RA-5039 for the full
 * inventory.
 *
 * `EvidenceClass` is imported from `@prisma/client` ONLY. The repo carries
 * two other evidence-class vocabularies (`lib/evidence/evidence-classes.ts`
 * and `lib/types/evidence.ts`) that do not fully agree with the canonical
 * 18-value Prisma enum — new code must not perpetuate that drift.
 */

import type { EvidenceClass } from "@prisma/client";
import type { JobType } from "./workflow-definitions";

/** Presence/quality state for a single required or recommended evidence class. */
export type ChecklistItemStatus = "present" | "weak" | "missing";

/** One line of the checklist — a single evidence class evaluated against
 * the workflow step that calls for it. */
export interface ChecklistItem {
  evidenceClass: EvidenceClass;
  displayName: string;
  stepKey: string;
  stepTitle: string;
  riskTier: 1 | 2 | 3;
  /** Minimum evidence count the workflow step calls for. */
  requiredCount: number;
  /** Rows found across all applicable stores for this evidence class,
   * excluding REJECTED EvidenceItem rows. */
  capturedCount: number;
  status: ChecklistItemStatus;
  /** Average lib/evidence/qa-scorer score (0-100) across the captured
   * EvidenceItem rows for this class. Null when no scoreable EvidenceItem
   * rows exist (e.g. the only rows are legacy MoistureReading /
   * PsychrometricReading table entries, which have no QA heuristic). */
  averageQaScore: number | null;
  /** IICRC S500 section reference, when known. */
  s500Ref: string | null;
}

/** An affected area (declared room/zone) with zero evidence tagged to it. */
export interface AffectedAreaEvidenceGap {
  roomZoneId: string;
  evidenceCount: number;
}

/**
 * The FieldEvidenceChecklist contract (RA-5039).
 *
 * Never infers data that was never captured — every count here reflects a
 * real row in EvidenceItem, MoistureReading, PsychrometricReading, or
 * AffectedArea. Room-tag linkage is soft-string by design (RA-1196):
 * `unlinkedEvidence` surfaces tags that don't match a declared AffectedArea
 * rather than silently dropping them.
 */
export interface FieldEvidenceChecklist {
  inspectionId: string;
  /** Normalised workflow job type the checklist was built against. */
  claimType: JobType;
  generatedAt: string;
  categories: {
    required: ChecklistItem[];
    recommended: ChecklistItem[];
  };
  /** Fast lookup of non-"present" items, keyed by evidence class. */
  gapsByEvidenceClass: Partial<Record<EvidenceClass, ChecklistItem>>;
  /** Declared affected areas with no evidence tagged to them at all. */
  gapsByAffectedArea: AffectedAreaEvidenceGap[];
  /** Room-tag strings on evidence/moisture rows that don't match any
   * declared AffectedArea.roomZoneId (case-insensitive, trimmed). */
  unlinkedEvidence: string[];
}
