/**
 * RA-6994 — claimType normalisation for the evidence completeness gate.
 *
 * `WORKFLOW_TEMPLATES` (lib/evidence/workflow-definitions.ts) is keyed on
 * uppercase `JobType` values (e.g. "WATER_DAMAGE"). Callers of the
 * completeness/validate routes have historically sent lowercase claim
 * type strings (e.g. "water_damage") or the short Prisma `ClaimType`
 * enum values stamped on Inspection by the per-assessment routes (e.g.
 * "WATER"). Neither form matched the template keys, so the lookup
 * silently returned zero requirements and the gate always passed.
 *
 * This helper is the single boundary normaliser: uppercase the input,
 * check it against the canonical JobType keys, then fall back to a
 * short alias table for the unambiguous Prisma ClaimType short forms.
 * Anything else returns null — callers MUST treat that as a rejected
 * request, not as "no requirements".
 */

import { JOB_TYPES, type JobType } from "./workflow-definitions";

/**
 * Prisma `ClaimType` enum values (prisma/schema.prisma) that map
 * unambiguously to a single JobType. The remaining ClaimType values
 * (CONTENTS, BIOHAZARD, ODOUR, CARPET, HVAC, ASBESTOS) don't have one
 * obvious JobType counterpart and are intentionally left unmapped.
 */
const CLAIM_TYPE_ALIASES: Record<string, JobType> = {
  WATER: "WATER_DAMAGE",
  FIRE: "FIRE_SMOKE",
  MOULD: "MOULD",
  STORM: "STORM",
};

/**
 * Normalise a raw claimType string (from a query param, request body, or
 * the Inspection.claimType column) into a canonical JobType key.
 * Returns null when the value doesn't map to a known job type.
 */
export function normalizeClaimType(
  raw: string | null | undefined,
): JobType | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if ((JOB_TYPES as readonly string[]).includes(upper)) {
    return upper as JobType;
  }
  return CLAIM_TYPE_ALIASES[upper] ?? null;
}
