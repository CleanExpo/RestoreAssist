/**
 * Compose a complete, job-specific SWMS document from an activity template.
 *
 * A template is the reusable body. A SWMS is only a legal document once it
 * names the PCBU, the project, the principal contractor, the workers consulted,
 * and the law of the jurisdiction the work is happening in. This module joins
 * those together and refuses to produce a document that is missing them.
 *
 * Pure - no database, no side effects, no I/O. The caller supplies the job
 * details; persistence and rendering are somebody else's problem.
 */
import type {
  SwmsActivityTemplate,
  SwmsRiskRow,
} from "./activity-swms-types";
import { getSwmsActivityTemplate } from "./activity-templates";
import {
  getSwmsJurisdiction,
  getSwmsJurisdictions,
  SWMS_AUS_NZ_STANDARDS,
  type SwmsJurisdiction,
} from "./jurisdiction-reference";

/** The PCBU issuing the SWMS. */
export interface SwmsPcbu {
  companyName: string;
  address: string;
  /** Australian Business Number, digits only or formatted. */
  abn: string;
  contactName: string;
  contactPosition: string;
  contactPhone: string;
}

/** The job the SWMS is being issued for. */
export interface SwmsProject {
  name: string;
  address: string;
  /**
   * Jurisdiction code for the project address: an Australian state or
   * territory code, "CTH", or "NZ". Determines which law the SWMS cites.
   */
  jurisdictionCode: string;
  principalContractorName?: string;
  principalContractorCompany?: string;
  /** Who is responsible for ensuring compliance with this SWMS on site. */
  responsiblePersonName?: string;
}

/** A person consulted in developing and communicating the SWMS. */
export interface SwmsConsultedPerson {
  name: string;
  position: string;
}

export interface BuildActivitySwmsInput {
  activityId: string;
  pcbu: SwmsPcbu;
  project: SwmsProject;
  /** Workers and others consulted. May be empty at draft stage. */
  consulted?: SwmsConsultedPerson[];
}

/** The circumstances that require this SWMS to be reviewed, per the source documents. */
export const SWMS_REVIEW_TRIGGERS: readonly string[] = [
  "First implemented",
  "New worker inducted",
  "Change in circumstances",
  "Following an incident",
  "When control measures are not effective",
  "Annual review",
];

/** The declaration each worker signs. */
export const SWMS_WORKER_DECLARATION: readonly string[] = [
  "This SWMS has been developed in consultation and cooperation with workers and the relevant employer or person conducting a business or undertaking (PCBU).",
  "I have read the above SWMS and I understand its contents.",
  "I confirm that I have the skills and training, including relevant certification, to conduct the task as described.",
  "I agree to comply with the safety requirements within this SWMS and to use personal protective equipment as described.",
  "This SWMS does not necessarily cover all possible hazards associated with this equipment or task and should be used in conjunction with other references. It is a guide to compliment training and a reminder to users prior to equipment use or conducting a task.",
];

export interface ActivitySwms {
  activityId: string;
  title: string;
  sourceRevision: string;
  scope: string;
  pcbu: SwmsPcbu;
  project: SwmsProject;
  consulted: SwmsConsultedPerson[];
  reviewTriggers: readonly string[];
  /**
   * HRCW categories to work through before starting. Copied from the
   * template; means "assess these", not "these apply".
   */
  hrcwCategoriesToAssess: string[];
  /**
   * HRCW categories determined to APPLY to this job. Always empty from
   * `buildActivitySwms` — this is a site determination, not something a
   * template can know. Present so a consumer has somewhere to record it
   * rather than overloading the assessment list.
   */
  hrcwCategoriesApplying: string[];
  requiredTools: string[];
  ppe: SwmsActivityTemplate["ppe"];
  trainingRequired: string[];
  rows: SwmsRiskRow[];
  /** The jurisdiction whose law governs this job. */
  applicableJurisdiction: SwmsJurisdiction;
  /** The full reference table printed on the document. */
  referenceJurisdictions: SwmsJurisdiction[];
  ausNzStandards: readonly string[];
  workerDeclaration: readonly string[];
}

/** Raised when a SWMS cannot be composed. Never returns a partial document. */
export class SwmsCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwmsCompositionError";
  }
}

/**
 * Deep-copy one risk row.
 *
 * Rows are shared objects: `common-rows.ts` defines each once and every
 * template that uses it holds the same reference. Handing the live object to a
 * caller means one consumer mutating `swms.rows[0].hazards` changes that row
 * for every SWMS composed afterwards in the same process. A shallow spread is
 * not enough — `equipment`, `hazards` and `controls` are all arrays.
 */
function cloneRow(row: SwmsRiskRow): SwmsRiskRow {
  return {
    ...row,
    equipment: [...row.equipment],
    hazards: [...row.hazards],
    controls: row.controls.map((group) => ({
      ...group,
      items: [...group.items],
    })),
  };
}

/** ABN: eleven digits, optionally spaced. Shape only; the checksum is separate. */
const ABN_RE = /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/;

/** ATO weighting for the ABN modulus-89 check. */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

/**
 * Validate an ABN against the ATO's modulus-89 checksum.
 *
 * Eleven digits alone is a weak check: a transposed or invented number passes
 * it and then gets printed on an issued SWMS under "Company name / ABN". The
 * checksum catches single-digit errors and most transpositions.
 *
 * Algorithm: subtract 1 from the first digit, multiply each digit by its
 * weight, and require the sum to be divisible by 89.
 */
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = ABN_WEIGHTS.reduce(
    (acc, weight, i) => acc + (Number(digits[i]) - (i === 0 ? 1 : 0)) * weight,
    0,
  );
  return sum % 89 === 0;
}

/**
 * Compose a job-specific SWMS.
 *
 * Throws `SwmsCompositionError` rather than emitting a document that is unsafe
 * to hand to a principal contractor: an unknown activity, an unrecognised
 * jurisdiction, a missing PCBU, or a malformed ABN. A SWMS that names the wrong
 * law, or no law, is worse than no SWMS - it is a document a worker will rely on.
 */
export function buildActivitySwms(input: BuildActivitySwmsInput): ActivitySwms {
  const template = getSwmsActivityTemplate(input.activityId);
  if (!template) {
    throw new SwmsCompositionError(
      `Unknown SWMS activity "${input.activityId}".`,
    );
  }

  const jurisdiction = getSwmsJurisdiction(input.project.jurisdictionCode);
  if (!jurisdiction) {
    throw new SwmsCompositionError(
      `No safety legislation is recorded for jurisdiction "${input.project.jurisdictionCode}". ` +
        "A SWMS must cite the law that applies at the project address.",
    );
  }

  const { pcbu } = input;
  for (const [field, value] of [
    ["companyName", pcbu.companyName],
    ["address", pcbu.address],
    ["abn", pcbu.abn],
    ["contactName", pcbu.contactName],
  ] as const) {
    if (!value?.trim()) {
      throw new SwmsCompositionError(`PCBU ${field} is required on a SWMS.`);
    }
  }
  const abn = pcbu.abn.trim();
  if (!ABN_RE.test(abn)) {
    throw new SwmsCompositionError(
      `"${pcbu.abn}" is not a valid ABN. An ABN is eleven digits.`,
    );
  }
  if (!isValidAbn(abn)) {
    throw new SwmsCompositionError(
      `"${pcbu.abn}" is eleven digits but fails the ABN checksum. ` +
        "Check for a transposed or mistyped digit.",
    );
  }
  if (!input.project.name?.trim() || !input.project.address?.trim()) {
    throw new SwmsCompositionError(
      "Project name and address are required on a SWMS.",
    );
  }

  return {
    activityId: template.id,
    title: template.title,
    sourceRevision: template.sourceRevision,
    scope: template.scope,
    pcbu,
    project: input.project,
    consulted: input.consulted ?? [],
    reviewTriggers: SWMS_REVIEW_TRIGGERS,
    hrcwCategoriesToAssess: [...template.hrcwCategoriesToAssess],
    // Empty by construction: whether HRCW applies is decided on site.
    hrcwCategoriesApplying: [],
    requiredTools: [...template.requiredTools],
    // `ppe` and `rows` are copied like every other array here. `rows` in
    // particular holds the shared row objects from common-rows.ts that every
    // template reuses, so handing out the live array let a consumer mutate
    // one document and change every later composition in the same process.
    ppe: template.ppe.map((entry) => ({ ...entry })),
    trainingRequired: [...template.trainingRequired],
    rows: template.rows.map(cloneRow),
    applicableJurisdiction: jurisdiction,
    referenceJurisdictions: getSwmsJurisdictions(),
    ausNzStandards: SWMS_AUS_NZ_STANDARDS,
    workerDeclaration: SWMS_WORKER_DECLARATION,
  };
}

/**
 * Highest residual risk across a composed SWMS - the "risk level after" a
 * supervisor should be looking at when they sign. Useful for sorting a list of
 * SWMS by what still needs attention after controls are applied.
 */
export function highestResidualRisk(swms: ActivitySwms): number {
  return swms.rows.reduce((max, row) => Math.max(max, row.riskAfter), 0);
}
