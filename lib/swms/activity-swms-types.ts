/**
 * Activity-based SWMS: the document model.
 *
 * RestoreAssist already generates a *hazard*-based SWMS draft from an
 * inspection's recorded hazards (`lib/swms/auto-generator.ts`). That answers
 * "what is dangerous about THIS job". It does not answer the question a PCBU is
 * actually asked for on site: "show me your SWMS for the task you are about to
 * perform".
 *
 * This module is the second half. It models the activity-based SWMS in the
 * layout Australian principal contractors expect — the seven-column risk table
 * (Sequence of Activities | Equipment Used | Potential Hazards & Risks | Risk
 * Level Before | Recommended Actions | Risk Level After | Person Responsible)
 * wrapped in the header, consultation, training, chemical, reference and
 * sign-off sections that make it a legally usable document.
 *
 * Source: the seven Disaster Recovery QLD C4.1 SWMS documents supplied by the
 * founder (revision codes `swm*092022sk`, reviewed 30/07/2024). Control text is
 * carried across from those documents; jurisdiction citations are NOT — those
 * are resolved from `lib/state-detection.ts` so they cannot drift (see
 * `jurisdiction-reference.ts` for why that distinction matters).
 */

/**
 * Risk band as recorded in the source documents: 1 (lowest) to 5 (highest).
 *
 * The source SWMS carry these numbers but not the matrix legend that produced
 * them, so they are transcribed, not re-derived. Treat them as the assessor's
 * recorded judgement, not as a computed score.
 */
export type SwmsRiskScore = 1 | 2 | 3 | 4 | 5;

/**
 * One block of control measures within the "Recommended Actions" column.
 * The source documents group controls under sub-headings ("Required Tools:",
 * "Step 1. Pull up the carpet", "Safety Precautions:"); `heading` preserves
 * that grouping so a rendered form reads the same as the paper original.
 */
export interface SwmsControlGroup {
  /** Optional group heading. Omitted for an ungrouped run of bullets. */
  heading?: string;
  /** Control measures, one per bullet. Never empty. */
  items: string[];
}

/** One row of the seven-column SWMS risk table. */
export interface SwmsRiskRow {
  /** "Sequence of Activities" — the job step. */
  activity: string;
  /** "Equipment Used". Empty where the source leaves the column blank. */
  equipment: string[];
  /** "Potential Hazards & Risks". Never empty. */
  hazards: string[];
  /** "Risk Level Before" controls are applied. */
  riskBefore: SwmsRiskScore;
  /** "Recommended Actions" — the control measures. Never empty. */
  controls: SwmsControlGroup[];
  /** "Risk Level After" controls are applied. Never above `riskBefore`. */
  riskAfter: SwmsRiskScore;
  /** "Person Responsible" — e.g. "All", "Operator", "Site Supervisor". */
  responsible: string;
}

/** A PPE line in the inspection-and-maintenance table. */
export interface SwmsPpeItem {
  item: string;
  inspection: string;
}

/** Stable identifier for each activity template. Used in URLs and stored rows. */
export type SwmsActivityId =
  | "carpet-removal"
  | "floor-removal"
  | "demolition-non-structural"
  | "fire-smoke-cleaning"
  | "decontamination"
  | "water-extraction-portable"
  | "water-extraction-truck-mount";

/**
 * A reusable, job-independent SWMS body. Everything here is constant for the
 * activity; the job-specific header (PCBU, project, workers, signatures) is
 * supplied at compose time by `buildActivitySwms`.
 */
export interface SwmsActivityTemplate {
  id: SwmsActivityId;
  /** Work Activity/Task, as printed on the source document. */
  title: string;
  /** Revision code from the source document footer, e.g. "swmcr092022sk". */
  sourceRevision: string;
  /** SWMS Scope paragraph. */
  scope: string;
  /**
   * High-risk construction work categories that must be ASSESSED for this
   * activity before it starts, per WHS Regulation s291.
   *
   * This is deliberately not a list of categories that apply. The source
   * documents reproduce the statutory list as a per-job checklist, and which
   * boxes are ticked is not recoverable from the PDF text layer, so the
   * template can only say "consider these", never "these are in force". A
   * non-empty list therefore means the crew has a checklist to work through,
   * not that the job is HRCW.
   *
   * Whether HRCW actually applies is a per-job determination the composer
   * records in `ActivitySwms.hrcwCategoriesApplying`, which starts empty and
   * is filled in on site.
   */
  hrcwCategoriesToAssess: string[];
  /** Tools named in the source document's "Required Tools" block. */
  requiredTools: string[];
  /** PPE inspection-and-maintenance table. */
  ppe: SwmsPpeItem[];
  /** Training the source document requires before the activity is performed. */
  trainingRequired: string[];
  /**
   * Complete risk table in document order: shared opening rows, the
   * activity-specific operation rows, then the shared closing rows.
   */
  rows: SwmsRiskRow[];
}
