/**
 * IICRC Inclusion-Check Contract (RA-5040 PR1)
 *
 * Reviewer-quality prompts only. This module NEVER claims certification,
 * legal compliance, safety clearance, remediation advice, or insurance
 * advice — it surfaces "consider whether X was captured" nudges for a
 * human reviewer. There is no blocking severity tier: `runInclusionCheck`
 * never gates report save, sync, or export.
 *
 * Grounding rule (hard rule, live P0 RA-6934 — fabricated-citation class):
 * `InclusionPrompt.groundedSection`, when present, MUST be sourced only
 * from a clauseRef already verified in S500_FIELD_MAP / S520_FIELD_MAP /
 * S540_FIELD_MAP / S700_FIELD_MAP (lib/nir-standards-mapping.ts) or from a
 * key in lib/standards/s500-sections.ts. Never hand-type a section number —
 * omit the field instead. See lib/__tests__/iicrc-inclusion-check.test.ts
 * for the regression test that re-derives and checks this independently.
 *
 * Allowed prompt phrasings (per RA-5040 acceptance criteria): every prompt
 * string must open with one of "Review prompt: consider whether…",
 * "Standard-aligned consideration: …", or "Missing evidence flag: …", and
 * must never assert "complies", "certifies", "meets [the standard]", or
 * "required by law".
 *
 * Scope: the four claim types that already have a verified IICRC field map
 * (WATER, MOULD, FIRE, BIOHAZARD — see getFieldMapForClaimType) are wired
 * into runInclusionCheck's claimType dispatch.
 *
 * CONTENTS and clandestine-contamination (RA-5040 PR2) have real, grounded
 * prompts below (CONTENTS_PROMPTS / CLANDESTINE_PROMPTS), evaluated via
 * runContentsInclusionCheck / runClandestineInclusionCheck — but neither is
 * wired into runInclusionCheck's claimType dispatch, because no verified
 * signal reaches that boundary for either category (see the PR body's
 * "clandestine-mapping outcome" note and the CONTENTS founder-decision
 * section for the investigation). runInclusionCheck keeps degrading
 * gracefully for "CONTENTS", "CLANDESTINE", and everything else unmapped.
 */

import {
  S500_FIELD_MAP,
  S520_FIELD_MAP,
  S540_FIELD_MAP,
  S700_FIELD_MAP,
  type IicrcClaimType,
  type StandardKey,
} from "@/lib/nir-standards-mapping";
import { getS500Section } from "@/lib/standards/s500-sections";

export type InclusionSeverity = "flag" | "reminder";

export interface InclusionPrompt {
  readonly id: string;
  /** Raw claim type this prompt was authored for (e.g. "WATER"). */
  readonly claimType: string;
  /** Governing IICRC standard, or null for the unmapped-category prompt. */
  readonly standard: StandardKey | null;
  /** Verified citation only — see the grounding rule above. Omitted when
   * no verified section covers this consideration (edition-level only). */
  readonly groundedSection?: string;
  readonly prompt: string;
  /** Report field names this prompt checks for presence. */
  readonly checksFields: readonly string[];
  readonly severity: InclusionSeverity;
}

export interface InclusionCheckResult {
  readonly claimType: string;
  readonly present: readonly InclusionPrompt[];
  readonly missing: readonly InclusionPrompt[];
}

/**
 * Recall a verified S500 section's full citation string
 * ("S500:2021 §12.5.7") by its lib/standards/s500-sections.ts key. Throws
 * at module load if the key isn't in that verified index — fail fast
 * rather than silently citing nothing.
 */
function s500Section(key: string): string {
  const section = getS500Section(key);
  if (!section) {
    throw new Error(
      `iicrc-inclusion-check: "${key}" is not a verified S500 section (lib/standards/s500-sections.ts)`,
    );
  }
  return section.citationKey;
}

const WATER_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "water-clearance-verification",
    claimType: "WATER",
    standard: "S500",
    groundedSection: s500Section("12.5.7"), // "Verifying Drying Goals"
    prompt:
      "Review prompt: consider whether a clearance moisture reading was recorded before this area was marked dry.",
    checksFields: ["clearanceMoistureReading"],
    severity: "flag",
  },
  {
    id: "water-antimicrobial-documentation",
    claimType: "WATER",
    standard: "S500",
    groundedSection: s500Section("7.1"), // "Antimicrobial (biocide) Use in Water Damage Projects"
    prompt:
      "Standard-aligned consideration: antimicrobial or biocide application on Category 2 or 3 water should be documented.",
    checksFields: ["antimicrobialDocumentation"],
    severity: "reminder",
  },
];

const MOULD_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "mould-containment-verification",
    claimType: "MOULD",
    standard: "S520",
    // S520:2024 edition-level only — S520_FIELD_MAP only grounds the
    // containment *plan* requirement (§7.3), not verification. Omit
    // rather than invent a sub-clause.
    prompt:
      "Missing evidence flag: containment barrier integrity was not verified for the duration of remediation under S520:2024.",
    checksFields: ["containmentVerified"],
    severity: "flag",
  },
  {
    id: "mould-post-remediation-verification",
    claimType: "MOULD",
    standard: "S520",
    prompt:
      "Missing evidence flag: post-remediation verification was not recorded for this S520:2024 mould remediation.",
    checksFields: ["postRemediationVerification"],
    severity: "flag",
  },
];

const FIRE_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "fire-suppression-water-cross-reference",
    claimType: "FIRE",
    standard: "S700",
    // No verified S700_FIELD_MAP clause covers suppression-water linkage —
    // the clearest gap in the matrix. Edition-level only.
    prompt:
      "Review prompt: consider whether suppression water present at this fire scene has had its S500:2021 Category and Class recorded as a linked consideration under S700:2025.",
    checksFields: ["suppressionWaterCategory"],
    severity: "flag",
  },
  {
    id: "fire-cross-standard-both-considered",
    claimType: "FIRE",
    standard: "S700",
    prompt:
      "Standard-aligned consideration: confirm both S700:2025 fire and smoke requirements and S500:2021 water requirements have been considered where suppression water was used.",
    checksFields: ["crossStandardBothConsidered"],
    severity: "reminder",
  },
];

const BIOHAZARD_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "biohazard-documentation-boundary",
    claimType: "BIOHAZARD",
    standard: "S540",
    groundedSection: S540_FIELD_MAP.photoDocumentation.clauseRef, // "IICRC S540:2023 §10.4"
    prompt:
      "Review prompt: consider whether this report documents only what was observed, without forensic or legal conclusions, per S540:2023 §10.4.",
    checksFields: ["documentationBoundaryAcknowledged"],
    // RA-5040 PR2 accepted scope: the documentation-boundary consideration
    // (never forensic/legal conclusions) upgrades to "flag" — it is a
    // liability-relevant nudge, not a soft reminder.
    severity: "flag",
  },
];

/**
 * CONTENTS review prompts (RA-5040 PR2). Grounded at IICRC S500:2021
 * Chapter 14 ("Contents Evaluation, Restoration, and Remediation") — the
 * chapter level only, per lib/standards/s500-sections.ts. CONTENTS has no
 * dedicated field map (no sub-clause has been verified for these specific
 * considerations), so groundedSection stops at the chapter citation rather
 * than inventing a sub-clause.
 *
 * Not wired into runInclusionCheck's claimType dispatch — see
 * runContentsInclusionCheck and the PR body's founder-decision section on
 * whether CONTENTS should become a real IicrcClaimType/AssessmentDomain/
 * checklist category.
 */
export const CONTENTS_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "contents-inventory-disposition-documentation",
    claimType: "CONTENTS",
    standard: "S500",
    groundedSection: s500Section("14"), // "Contents Evaluation, Restoration, and Remediation"
    prompt:
      "Review prompt: consider whether a contents inventory and disposition record (keep / clean / dispose) was documented under S500:2021 Chapter 14.",
    checksFields: ["contentsInventoryDocumented"],
    severity: "flag",
  },
  {
    id: "contents-restorability-determination-documentation",
    claimType: "CONTENTS",
    standard: "S500",
    groundedSection: s500Section("14"),
    prompt:
      "Standard-aligned consideration: a restorability determination for affected contents should be documented under S500:2021 Chapter 14.",
    checksFields: ["contentsRestorabilityDetermination"],
    severity: "reminder",
  },
];

/**
 * Clandestine-contamination review prompts (RA-5040 PR2). These are review
 * prompts that reference the S540 considerations already verified in
 * S540_FIELD_MAP (lib/nir-standards-mapping.ts) — they do NOT add new
 * field-map entries, since clandestine contamination is not itself an
 * IicrcClaimType.
 *
 * Not wired into runInclusionCheck's claimType dispatch — see
 * runClandestineInclusionCheck and the PR body's "clandestine-mapping
 * outcome" note: no verified signal (report.hazardType free text, or
 * JOB_TYPES.CLANDESTINE_HAZARDOUS from lib/evidence/workflow-definitions.ts)
 * reliably identifies a clandestine job at this boundary today.
 */
export const CLANDESTINE_PROMPTS: readonly InclusionPrompt[] = [
  {
    id: "clandestine-regulated-waste-linkage",
    claimType: "CLANDESTINE",
    standard: "S540",
    groundedSection: S540_FIELD_MAP.regulatedWasteClass.clauseRef, // "IICRC S540:2023 §6.4"
    prompt:
      "Review prompt: consider whether regulated-waste classification has been documented for this clandestine-contamination job, consistent with S540:2023 §6.4.",
    checksFields: ["regulatedWasteClassDocumented"],
    severity: "flag",
  },
  {
    id: "clandestine-decontamination-protocol-linkage",
    claimType: "CLANDESTINE",
    standard: "S540",
    groundedSection: S540_FIELD_MAP.decontaminationProtocol.clauseRef, // "IICRC S540:2023 §7.5"
    prompt:
      "Standard-aligned consideration: worker decontamination protocol stages should be documented for this clandestine-contamination job, consistent with S540:2023 §7.5.",
    checksFields: ["decontaminationProtocolDocumented"],
    severity: "reminder",
  },
  {
    id: "clandestine-jurisdictional-notifications-linkage",
    claimType: "CLANDESTINE",
    standard: "S540",
    groundedSection: S540_FIELD_MAP.jurisdictionalNotifications.clauseRef, // "IICRC S540:2023 §6.6"
    prompt:
      "Missing evidence flag: jurisdictional notification requirements have not been confirmed as filed for this clandestine-contamination job, consistent with S540:2023 §6.6.",
    checksFields: ["jurisdictionalNotificationsConfirmed"],
    severity: "flag",
  },
  {
    id: "clandestine-documentation-boundary",
    claimType: "CLANDESTINE",
    standard: "S540",
    // Edition-level only — no verified sub-clause covers this exact
    // documentation-boundary nuance. Omit rather than invent.
    prompt:
      "Review prompt: consider whether this report documents only what was observed at this clandestine-contamination scene, without forensic or legal conclusions.",
    checksFields: ["documentationBoundaryAcknowledged"],
    severity: "flag",
  },
];

const UNMAPPED_CATEGORY_PROMPT_ID = "unmapped-category-no-checks";

export const INCLUSION_PROMPTS_BY_CLAIM_TYPE: Readonly<
  Record<IicrcClaimType, readonly InclusionPrompt[]>
> = {
  WATER: WATER_PROMPTS,
  MOULD: MOULD_PROMPTS,
  FIRE: FIRE_PROMPTS,
  BIOHAZARD: BIOHAZARD_PROMPTS,
};

/**
 * Flat list of every authored prompt across all mapped categories, plus the
 * CONTENTS and CLANDESTINE prompt sets (RA-5040 PR2) even though neither is
 * wired into runInclusionCheck's claimType dispatch. Used by the regression
 * tests to validate banned phrasing and groundedSection integrity across
 * the whole contract — including the categories not yet dispatched — in
 * one pass.
 */
export function getAllInclusionPrompts(): readonly InclusionPrompt[] {
  return [
    ...Object.values(INCLUSION_PROMPTS_BY_CLAIM_TYPE).flat(),
    ...CONTENTS_PROMPTS,
    ...CLANDESTINE_PROMPTS,
  ];
}

/**
 * Also exported for tests/tooling that want the raw field maps this module
 * grounds against, without re-importing from lib/nir-standards-mapping.
 */
export { S500_FIELD_MAP, S520_FIELD_MAP, S540_FIELD_MAP, S700_FIELD_MAP };

function isFieldPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true; // booleans/numbers/objects — recorded is recorded, 0/false included
}

function evaluatePrompts(
  claimType: string,
  prompts: readonly InclusionPrompt[],
  report: Record<string, unknown>,
): InclusionCheckResult {
  const present: InclusionPrompt[] = [];
  const missing: InclusionPrompt[] = [];
  for (const prompt of prompts) {
    const hasEvidence = prompt.checksFields.every((field) =>
      isFieldPresent(report[field]),
    );
    (hasEvidence ? present : missing).push(prompt);
  }
  return { claimType, present, missing };
}

/**
 * Run the inclusion-check prompts for a claim type against a report-like
 * data bag (matched by the field names in each prompt's `checksFields`).
 * Never throws: an unrecognised claimType (CONTENTS, STORM, CARPET, a
 * clandestine-contamination job, or any other free-text value) degrades
 * gracefully to a single reminder rather than a structured check — there
 * is no dispatched field map for those categories (see
 * runContentsInclusionCheck / runClandestineInclusionCheck for the PR2
 * content built for CONTENTS and clandestine-contamination specifically).
 */
export function runInclusionCheck(
  claimType: string,
  report: Record<string, unknown>,
): InclusionCheckResult {
  const normalized = (claimType ?? "").trim().toUpperCase();
  const prompts = (
    INCLUSION_PROMPTS_BY_CLAIM_TYPE as Record<
      string,
      readonly InclusionPrompt[] | undefined
    >
  )[normalized];

  if (!prompts) {
    return {
      claimType: normalized,
      present: [],
      missing: [
        {
          id: UNMAPPED_CATEGORY_PROMPT_ID,
          claimType: normalized,
          standard: null,
          prompt:
            "Missing evidence flag: no structured inclusion checks exist yet for this category.",
          checksFields: [],
          severity: "reminder",
        },
      ],
    };
  }

  return evaluatePrompts(normalized, prompts, report);
}

/**
 * Evaluate the CONTENTS review prompts (contents inventory/disposition +
 * restorability determination, S500:2021 Chapter 14) against a report-like
 * data bag. Not reachable via runInclusionCheck's claimType dispatch — see
 * CONTENTS_PROMPTS' doc comment and the PR body's founder-decision section.
 */
export function runContentsInclusionCheck(
  report: Record<string, unknown>,
): InclusionCheckResult {
  return evaluatePrompts("CONTENTS", CONTENTS_PROMPTS, report);
}

/**
 * Evaluate the clandestine-contamination S540-linkage + documentation-
 * boundary review prompts against a report-like data bag. Not reachable
 * via runInclusionCheck's claimType dispatch — see CLANDESTINE_PROMPTS'
 * doc comment and the PR body's clandestine-mapping-outcome note.
 */
export function runClandestineInclusionCheck(
  report: Record<string, unknown>,
): InclusionCheckResult {
  return evaluatePrompts("CLANDESTINE", CLANDESTINE_PROMPTS, report);
}

/**
 * Best-effort mapping from a free-text `report.hazardType` value (e.g.
 * "WATER_DAMAGE", "Mould", "Fire and Smoke") to the IicrcClaimType this
 * module has prompts for. Returns null when nothing matches — callers
 * should fall back to passing the raw hazardType through to
 * runInclusionCheck anyway, since it degrades gracefully for unmapped
 * values. Mirrors the heuristic in
 * app/api/integrations/nir-sync/route.ts (mapDamageType), extended with
 * a BIOHAZARD branch.
 */
export function deriveIicrcClaimTypeFromHazardType(
  hazardType: string | null | undefined,
): IicrcClaimType | null {
  if (!hazardType) return null;
  const upper = hazardType.toUpperCase();
  if (upper.includes("WATER") || upper.includes("FLOOD") || upper.includes("LEAK"))
    return "WATER";
  if (upper.includes("MOULD") || upper.includes("MOLD") || upper.includes("FUNGAL"))
    return "MOULD";
  if (upper.includes("FIRE") || upper.includes("SMOKE") || upper.includes("SOOT"))
    return "FIRE";
  if (
    upper.includes("BIOHAZARD") ||
    upper.includes("TRAUMA") ||
    upper.includes("CRIME") ||
    upper.includes("BLOOD")
  )
    return "BIOHAZARD";
  return null;
}
