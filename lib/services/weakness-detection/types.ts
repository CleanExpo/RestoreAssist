/**
 * Weakness-detection taxonomy + input shapes (RA-5041 PR1 — deterministic
 * layer only, zero AI spend).
 *
 * Every finding anchors to real report data (a section + field + the exact
 * quoted text that triggered it) or explicitly says "unverified/missing" —
 * this is a ticket acceptance criterion, not a nicety. Findings use neutral
 * review wording: the system flags, the human decides.
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

/** Severity per the ticket taxonomy: P0 stop, P1 reviewer required, P2 improvement. */
export type WeaknessSeverity = "P0" | "P1" | "P2";

/** How a finding was produced. PR1 only ever emits "deterministic". */
export type DetectionMethod = "deterministic" | "llm";

export type WeaknessCheckClass =
  | "redline_language"
  | "missing_field"
  | "category_separation"
  | "scope_expansion"
  | "contradiction"
  | "unsupported_causation";

/**
 * Top-level sections of the structured report (mirrors the object shape
 * returned by lib/reports/build-structured-report.ts) that a finding can
 * anchor to.
 */
export type ReportSectionId =
  | "header"
  | "property"
  | "incident"
  | "affectedAreas"
  | "classification"
  | "hazards"
  | "scopeItems"
  | "photos"
  | "technicianNotes"
  | "recommendations"
  | "reportInstructions";

export interface EvidenceAnchor {
  reportSectionId: ReportSectionId;
  field: string;
  quotedText: string;
}

export interface WeaknessFinding {
  id: string;
  checkClass: WeaknessCheckClass;
  severity: WeaknessSeverity;
  /** A concrete anchor into the report, or "unverified/missing" when no supporting field exists. */
  evidenceAnchor: EvidenceAnchor | "unverified/missing";
  description: string;
  suggestedAction: string;
  detectionMethod: DetectionMethod;
  /** Only set from lib/nir-standards-mapping.ts standardCite()/verified mappings — never a hand-written literal. */
  standardsCitation?: string;
}

// ─── Deterministic-layer input shapes ─────────────────────────────────────
//
// Deliberately a narrow subset of the structured report (see
// lib/reports/build-structured-report.ts) — only the fields the PR1 checks
// actually read. Kept decoupled from the `any`-typed builder output so
// fixtures can be constructed directly in tests without a DB or the report
// pipeline.

export interface MoistureReadingLike {
  location: string;
  value: number;
  unit: string;
}

export interface AffectedAreaLike {
  name: string;
  moistureReadings: MoistureReadingLike[];
  photos: string[];
  wetPercentage?: number;
}

export interface ClassificationLike {
  category: string | null;
  class: string | null;
  standardReference?: string | null;
}

export interface HazardsLike {
  biologicalMouldDetected?: boolean;
  biologicalMouldCategory?: string | null;
}

export interface ScopeItemLike {
  description: string;
  justification?: string | null;
}

export interface PhotoLike {
  url: string;
  category?: string | null;
  location?: string | null;
}

export interface IncidentLike {
  dateOfLoss?: string | null;
  technicianAttendanceDate?: string | null;
  waterCategory?: string | null;
  waterClass?: string | null;
  /** Documented source of loss (e.g. "burst supply pipe") — the deterministic
   * evidence anchor a causation claim in free text is checked against. */
  waterSource?: string | null;
}

export interface WeaknessDetectionInput {
  incident?: IncidentLike | null;
  affectedAreas?: AffectedAreaLike[] | null;
  classification?: ClassificationLike | null;
  hazards?: HazardsLike | null;
  scopeItems?: ScopeItemLike[] | null;
  photos?: PhotoLike[] | null;
  technicianNotes?: string | null;
  recommendations?: string[] | null;
  reportInstructions?: string | null;
  /**
   * Optional authorised-scope baseline (work order / signed scope-of-works)
   * to diff recommended scopeItems against. No such record exists in the
   * schema today (only ScopeVariation, which tracks deltas off an
   * unrecorded baseline) — when omitted, checkScopeExpansion returns a
   * single P2 "no authorised scope recorded" finding rather than fabricating
   * a diff. See scope-expansion.ts.
   */
  authorisedScopeItems?: ScopeItemLike[] | null;
}
