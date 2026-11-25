/**
 * RA-8373 (RA-IEP-04) — independent post-remediation verification handoff gate.
 *
 * Derived and read-only. This module checks whether a mould job carries what
 * an independent professional (an occupational hygienist or an indoor
 * environmental professional) needs to own the post-remediation decision, and
 * lists what is still outstanding. It persists nothing.
 *
 * What it will not do:
 *   - certify anything. There is no pass, fail or "cleared" state. The best
 *     status is "independent record supplied", and the decision stays with the
 *     professional named in that record.
 *   - let the restorer self-certify. A reviewer who is the restorer, or who
 *     belongs to the restorer's organisation, is reported as not independent.
 *   - treat one spore figure as a universal pass mark. A bare numeric
 *     criterion is outstanding until an independent report reference backs it.
 *   - repeat disease, health, occupancy or condition wording from free text.
 *     Such wording is counted and referred to the professional's report.
 *
 * Every item carries a basis:
 *   source     — recorded on the job from a named document or reading;
 *   inferred   — worked out by RestoreAssist from recorded values;
 *   unverified — supplied, but not checked against an independent record.
 *
 * No reviewer record is persisted yet (schema proposal in the RA-8373 PR,
 * founder-gated), so today's callers pass `reviewer: null` and every reviewer
 * item reads as outstanding. That is the honest state of the data.
 *
 * Coordinates with RA-7686 (the Section 6A lab rows, reused here through
 * MouldLabAssessment) and RA-7687 (third-party report reading). This module
 * does not read or extract PDFs.
 */

import type { MouldLabAssessment } from "@/lib/reports/mould-lab-results";
import { findUnsupportedConditionWording } from "@/lib/sketch/investigation-overlay";

export type HandoffBasis = "source" | "inferred" | "unverified";

export const HANDOFF_BASIS_LABEL: Record<HandoffBasis, string> = {
  source: "SOURCE",
  inferred: "INFERRED",
  unverified: "UNVERIFIED",
};

/** Roles that may own an independent post-remediation decision. */
export const INDEPENDENT_REVIEWER_ROLES = [
  "occupational_hygienist",
  "indoor_environmental_professional",
] as const;
export type IndependentReviewerRole = (typeof INDEPENDENT_REVIEWER_ROLES)[number];

export const REVIEWER_ROLE_LABEL: Record<IndependentReviewerRole, string> = {
  occupational_hygienist: "Occupational hygienist",
  indoor_environmental_professional: "Indoor environmental professional",
};

/** The scope a reviewer must hold for this job's handoff. */
export const POST_REMEDIATION_VERIFICATION_SCOPE = "post_remediation_verification";

export interface ReviewerIdentityCheck {
  /** RestoreAssist user who checked the reviewer's identity or membership. */
  checkedByUserId: string;
  /** How it was checked, e.g. "professional body membership register". */
  method: string;
  checkedAt?: Date | string | null;
}

/** Shape of the reviewer record proposed for persistence (not stored yet). */
export interface IndependentReviewerRecord {
  name?: string | null;
  organisationName?: string | null;
  /** RestoreAssist organisation id, when the reviewer holds an account. */
  organisationId?: string | null;
  /** RestoreAssist user id, when the reviewer holds an account. */
  userId?: string | null;
  role?: string | null;
  scope?: readonly string[] | null;
  identityCheck?: ReviewerIdentityCheck | null;
  inspectionDate?: Date | string | null;
  /** Sampling method the reviewer accepted, as written in their report. */
  samplingMethod?: string | null;
  /** Reference to the reviewer's own report (number, file name or link). */
  reportReference?: string | null;
  signedOffAt?: Date | string | null;
  notes?: string | null;
}

export type HandoffTenancy =
  | { viewerOrganizationId: string | null; jobOrganizationId: string | null }
  /** The caller already ran the route-level tenancy helper. */
  | "asserted_by_caller";

export interface VerificationHandoffInput {
  tenancy: HandoffTenancy;
  /** Organisation and users who did the remediation (the restorer). */
  restorer: { organizationId: string | null; userIds: readonly string[] };
  assessment: MouldLabAssessment | null | undefined;
  reviewer: IndependentReviewerRecord | null | undefined;
  /** Evidence the restorer could not supply, stated plainly. */
  evidenceExceptions?: readonly string[];
}

export type HandoffItemKey =
  | "reviewer"
  | "role_scope"
  | "identity"
  | "independence"
  | "inspection_date"
  | "sampling_method"
  | "laboratory"
  | "criterion"
  | "independent_report"
  | "signoff"
  | "decision_owner"
  | "evidence_exceptions";

export interface HandoffItem {
  key: HandoffItemKey;
  label: string;
  value: string;
  basis: HandoffBasis;
  outstanding: boolean;
}

export type HandoffStatus =
  | "independent_review_outstanding"
  | "independent_record_supplied";

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  independent_review_outstanding: "Independent review outstanding",
  independent_record_supplied:
    "Independent record supplied; the decision rests with the professional named in it",
};

export type VerificationHandoff =
  | { ok: false; reason: "other_tenancy" }
  | {
      ok: true;
      status: HandoffStatus;
      items: HandoffItem[];
      /** Plain-language list of what is still open. */
      unresolved: string[];
      /** Count of condition or health terms found in free text and not repeated. */
      withheldWordingCount: number;
      notice: string;
    };

export const HANDOFF_NOTICE =
  "RestoreAssist records the handoff to an independent professional. It does " +
  "not judge remediation outcomes, and the restorer cannot self-certify " +
  "post-remediation verification. In Australia and New Zealand, engage an " +
  "occupational hygienist or indoor environmental professional who is " +
  "independent of the restorer.";

export const NOT_RECORDED = "Not recorded";

/**
 * Disease, exposure and occupancy wording a handoff record cannot support.
 * Added to the overlay's condition patterns (safe, cleared, health risk ...).
 */
const DISEASE_OR_OCCUPANCY_PATTERNS: readonly RegExp[] = [
  /\bre-?occup\w*/i,
  /\boccupan\w*/i,
  /\billness\w*/i,
  /\bdisease\w*/i,
  /\basthma\w*/i,
  /\ballerg\w*/i,
  /\binfection\w*/i,
  /\bimmuno\w*/i,
  /\bdiagnos\w*/i,
  /\btoxic\w*/i,
];

export function findWithheldWording(text: string | null | undefined): string[] {
  if (!text) return [];
  const hits = findUnsupportedConditionWording(text);
  for (const re of DISEASE_OR_OCCUPANCY_PATTERNS) {
    const m = text.match(re);
    if (m && !hits.includes(m[0].toLowerCase())) hits.push(m[0].toLowerCase());
  }
  return hits;
}

/**
 * A criterion that is only a fixed spore figure ("< 500 spores/m3") with no
 * reference to an outdoor baseline, a comparison, or the professional's
 * report. One figure applied to every job is not something RestoreAssist can
 * support; it needs the independent report behind it.
 */
const BARE_FIGURE =
  /^\s*(?:(?:<=|>=|<|>|≤|≥|=|below|under|less than|at most|max(?:imum)?)\s*)?\d[\d,]*(?:\.\d+)?\s*(?:spores?|cfu|counts?|structures?)?\s*(?:\/|per)\s*m(?:3|³)\s*\.?\s*$/i;
const CONTEXTUAL = /\b(outdoor|baseline|ratio|comparison|compar\w*|reference|report|professional|hygienist)\b/i;

export function isUniversalSporeThreshold(criterion: string | null | undefined): boolean {
  const c = (criterion ?? "").trim();
  if (!c) return false;
  return BARE_FIGURE.test(c) && !CONTEXTUAL.test(c);
}

function present(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Australia/Sydney",
      });
}

function isIndependentRole(role: string | null | undefined): role is IndependentReviewerRole {
  return (INDEPENDENT_REVIEWER_ROLES as readonly string[]).includes(role ?? "");
}

export function buildVerificationHandoff(
  input: VerificationHandoffInput,
): VerificationHandoff {
  // Tenancy first: a viewer outside the job's organisation sees nothing.
  if (input.tenancy !== "asserted_by_caller") {
    const { viewerOrganizationId: v, jobOrganizationId: j } = input.tenancy;
    if (!v || !j || v !== j) return { ok: false, reason: "other_tenancy" };
  }

  const a = input.assessment ?? {};
  const r = input.reviewer ?? null;
  const items: HandoffItem[] = [];
  const unresolved: string[] = [];
  const push = (item: HandoffItem, open?: string) => {
    items.push(item);
    if (item.outstanding && open) unresolved.push(open);
  };

  // Reviewer named at all.
  const name = present(r?.name);
  const org = present(r?.organisationName);
  push(
    {
      key: "reviewer",
      label: "Independent professional",
      value: name ? (org ? `${name}, ${org}` : name) : NOT_RECORDED,
      // A name is supplied, never verified by naming alone; see "identity".
      basis: "unverified",
      outstanding: !name,
    },
    "Name the independent professional who will carry out post-remediation verification.",
  );

  // Role and scope.
  const roleOk = isIndependentRole(r?.role);
  const scopeOk = (r?.scope ?? []).includes(POST_REMEDIATION_VERIFICATION_SCOPE);
  const roleText = roleOk ? REVIEWER_ROLE_LABEL[r!.role as IndependentReviewerRole] : "";
  push(
    {
      key: "role_scope",
      label: "Role and scope",
      value:
        roleOk && scopeOk
          ? `${roleText}; engaged for post-remediation verification`
          : roleOk
            ? `${roleText}; scope does not include post-remediation verification`
            : r?.role
              ? "Role is not an occupational hygienist or indoor environmental professional"
              : NOT_RECORDED,
      basis: "unverified",
      outstanding: !(roleOk && scopeOk),
    },
    "Record the professional's role and confirm their engagement covers post-remediation verification.",
  );

  // Identity check: someone other than the reviewer must have checked it.
  const check = r?.identityCheck ?? null;
  const selfAttested =
    !!check && !!r?.userId && check.checkedByUserId === r.userId;
  const identityOk =
    !!check && present(check.method) !== "" && !!check.checkedByUserId && !selfAttested;
  push(
    {
      key: "identity",
      label: "Identity check",
      value: identityOk
        ? `Checked by ${present(check!.method)}${fmtDate(check!.checkedAt) ? ` on ${fmtDate(check!.checkedAt)}` : ""}`
        : selfAttested
          ? "Self-attested by the reviewer; not an independent check"
          : "Not checked against a membership or professional register",
      basis: identityOk ? "source" : "unverified",
      outstanding: !identityOk,
    },
    "Check the professional's identity or membership against a register, and record how.",
  );

  // Independence from the restorer.
  const restorerUser = !!r?.userId && input.restorer.userIds.includes(r.userId);
  const restorerOrg =
    !!r?.organisationId &&
    !!input.restorer.organizationId &&
    r.organisationId === input.restorer.organizationId;
  const notIndependent = restorerUser || restorerOrg;
  push(
    {
      key: "independence",
      label: "Independence",
      value: notIndependent
        ? "Not independent: the restorer cannot self-certify post-remediation verification"
        : r
          ? "No link to the restorer's organisation recorded"
          : NOT_RECORDED,
      basis: notIndependent ? "inferred" : "unverified",
      outstanding: notIndependent || !r,
    },
    notIndependent
      ? "Engage a professional independent of the restorer; the restorer can supply completion evidence only."
      : "Confirm the professional is independent of the restorer.",
  );

  // Inspection date.
  const inspected = fmtDate(r?.inspectionDate);
  push(
    {
      key: "inspection_date",
      label: "Inspection date",
      value: inspected || NOT_RECORDED,
      basis: inspected ? "source" : "unverified",
      outstanding: !inspected,
    },
    "Record the date the independent professional inspected the site.",
  );

  // Sampling method accepted by the professional.
  const method = present(r?.samplingMethod);
  push(
    {
      key: "sampling_method",
      label: "Accepted sampling method",
      value: method || NOT_RECORDED,
      basis: method ? "source" : "unverified",
      outstanding: !method,
    },
    "Record the sampling method the independent professional accepted, as written in their report.",
  );

  // Laboratory details (from the RA-7686 mould record).
  const labName = present(a.labName);
  const labRef = present(a.labReportReference);
  const sampled = fmtDate(a.samplingDate);
  const labMissing = [
    !labName && "laboratory name",
    !labRef && "lab report reference",
    !sampled && "sampling date",
  ].filter(Boolean) as string[];
  push(
    {
      key: "laboratory",
      label: "Laboratory details",
      value: labMissing.length
        ? `Missing: ${labMissing.join(", ")}`
        : `${labName}, report ${labRef}, sampled ${sampled}`,
      basis: labMissing.length ? "unverified" : "source",
      outstanding: labMissing.length > 0,
    },
    `Record the ${labMissing.join(", ")} from the laboratory report.`,
  );

  // Criterion: as recorded, never assessed here.
  const criterion = present(a.clearanceCriterion);
  const reportRef = present(r?.reportReference);
  const universal = isUniversalSporeThreshold(criterion);
  push(
    {
      key: "criterion",
      label: "Verification criterion",
      value: !criterion
        ? NOT_RECORDED
        : universal && !reportRef
          ? "A single fixed spore figure is recorded with no independent report behind it; RestoreAssist does not apply one figure to every job"
          : reportRef
            ? `As set in independent report ${reportRef}`
            : "As recorded on the job; assessment against it rests with the independent professional",
      basis: !criterion ? "unverified" : reportRef ? "source" : "unverified",
      outstanding: !criterion || (universal && !reportRef),
    },
    !criterion
      ? "Record the criterion the independent professional set."
      : "Back the spore figure with the independent professional's report, or record the criterion they set.",
  );

  // The independent report itself.
  push(
    {
      key: "independent_report",
      label: "Independent report",
      value: reportRef || NOT_RECORDED,
      basis: reportRef ? "source" : "unverified",
      outstanding: !reportRef,
    },
    "Attach or reference the independent professional's report.",
  );

  // Sign-off record.
  const signed = fmtDate(r?.signedOffAt);
  push(
    {
      key: "signoff",
      label: "Independent sign-off",
      value:
        signed && reportRef
          ? `Recorded ${signed}; see report ${reportRef}`
          : signed
            ? `Dated ${signed} with no report reference`
            : NOT_RECORDED,
      basis: signed && reportRef && identityOk ? "source" : "unverified",
      outstanding: !(signed && reportRef),
    },
    "Record the date the independent professional signed their report.",
  );

  // Decision owner.
  const ownerKnown = !!name && roleOk && !notIndependent;
  push(
    {
      key: "decision_owner",
      label: "Decision owner",
      value: ownerKnown
        ? `${name}${org ? `, ${org}` : ""}`
        : "Not assigned; the decision belongs to an independent professional, not the restorer or RestoreAssist",
      basis: ownerKnown && identityOk ? "source" : "unverified",
      outstanding: !ownerKnown,
    },
    "Assign the decision to the independent professional.",
  );

  // Evidence exceptions the restorer could not supply.
  const exceptions = (input.evidenceExceptions ?? [])
    .map((e) => e.trim())
    .filter(Boolean);
  const withheld = new Set<string>();
  const cleanExceptions: string[] = [];
  for (const e of exceptions) {
    const hits = findWithheldWording(e);
    if (hits.length) hits.forEach((h) => withheld.add(h));
    else cleanExceptions.push(e);
  }
  push(
    {
      key: "evidence_exceptions",
      label: "Evidence exceptions",
      value: cleanExceptions.length
        ? cleanExceptions.join("; ")
        : exceptions.length
          ? "Recorded, wording withheld; see the independent professional's report"
          : NOT_RECORDED,
      basis: exceptions.length ? "source" : "unverified",
      outstanding: false,
    },
  );
  for (const e of cleanExceptions) unresolved.push(`Evidence exception: ${e}`);

  // Free text that must not be repeated as a finding.
  for (const t of [a.clearanceCriterion, r?.notes, r?.samplingMethod]) {
    findWithheldWording(t).forEach((h) => withheld.add(h));
  }
  if (withheld.size) {
    unresolved.push(
      "Condition, health or occupancy wording in a free-text field was not repeated. Refer to the independent professional's report.",
    );
    // Wording that cannot be repeated is also kept out of the printed values.
    for (const item of items) {
      if (findWithheldWording(item.value).length) {
        item.value = "Recorded, wording withheld; see the independent professional's report";
        item.basis = "unverified";
      }
    }
  }

  const status: HandoffStatus = items.some((i) => i.outstanding)
    ? "independent_review_outstanding"
    : "independent_record_supplied";

  return {
    ok: true,
    status,
    items,
    unresolved,
    withheldWordingCount: withheld.size,
    notice: HANDOFF_NOTICE,
  };
}

/** Rows for the report PDF: `[label, "[BASIS] value"]`. */
export function verificationHandoffRows(
  h: Extract<VerificationHandoff, { ok: true }>,
): Array<[string, string]> {
  return [
    ["Status:", HANDOFF_STATUS_LABEL[h.status]],
    ...h.items.map(
      (i): [string, string] => [
        `${i.label}:`,
        `[${HANDOFF_BASIS_LABEL[i.basis]}] ${i.value}`,
      ],
    ),
  ];
}
