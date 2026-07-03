/**
 * RA-6848 [C2] / RA-6849 [C3] — shared underlay rights attestation.
 *
 * Before an *imported* floor plan (fetched from a property URL, or uploaded by
 * the client) is applied as a reference underlay, the operator must affirm two
 * things, per `au-ip-opinion-brief.md` and spec §8.1:
 *   1. the client holds the rights to use that plan, and
 *   2. importing it complies with the source's terms of use.
 *
 * This module is the single, framework-free gate shared by both import paths
 * (C2 URL + C3 upload). It is pure so it can be unit-tested and re-used on the
 * server (`/api/sketch/underlay-attestation`) to fail closed. It does NOT touch
 * Fabric or the DOM.
 */

/**
 * Version of the attestation statement. Bump when the wording below changes so
 * recorded attestations remain interpretable against the text the operator saw.
 */
export const UNDERLAY_ATTESTATION_VERSION = "2026-07-04";

/** The exact statement the operator affirms. Recorded verbatim with each record. */
export const UNDERLAY_RIGHTS_STATEMENT =
  "I confirm the client holds the rights to use this floor plan and that " +
  "importing it complies with the source's terms of use. It is applied as a " +
  "reference-only underlay and is never exported.";

/** Which import path produced the underlay. */
export type UnderlaySource = "url" | "upload";

export interface UnderlayAttestationInput {
  /** Operator affirms the client holds rights to the plan. */
  holdsRights: boolean;
  /** Operator affirms the import complies with the source's terms of use. */
  compliesWithSourceTerms: boolean;
}

export interface AttestationEvaluation {
  ok: boolean;
  /** Human-readable reason the attestation is incomplete (absent when ok). */
  reason?: string;
}

/**
 * Pure gate: both affirmations are required. Returns the first missing one as a
 * reason so the UI (and the API) can surface exactly what is outstanding.
 */
export function evaluateUnderlayAttestation(
  input: UnderlayAttestationInput,
): AttestationEvaluation {
  if (!input.holdsRights) {
    return {
      ok: false,
      reason: "Confirm the client holds the rights to use this plan.",
    };
  }
  if (!input.compliesWithSourceTerms) {
    return {
      ok: false,
      reason: "Confirm the import complies with the source's terms of use.",
    };
  }
  return { ok: true };
}

export interface UnderlayAttestationRecord {
  version: string;
  statement: string;
  source: UnderlaySource;
  holdsRights: true;
  compliesWithSourceTerms: true;
  /** ISO-8601 timestamp the attestation was made. */
  attestedAt: string;
}

/**
 * Build the auditable record for a *complete* attestation. Throws if the input
 * is incomplete — callers must gate on {@link evaluateUnderlayAttestation} first
 * so an unaffirmed attestation can never be recorded. `now` is injected for
 * deterministic tests.
 */
export function buildUnderlayAttestationRecord(
  input: UnderlayAttestationInput,
  source: UnderlaySource,
  now: () => Date = () => new Date(),
): UnderlayAttestationRecord {
  const result = evaluateUnderlayAttestation(input);
  if (!result.ok) {
    throw new Error(result.reason ?? "Attestation incomplete.");
  }
  return {
    version: UNDERLAY_ATTESTATION_VERSION,
    statement: UNDERLAY_RIGHTS_STATEMENT,
    source,
    holdsRights: true,
    compliesWithSourceTerms: true,
    attestedAt: now().toISOString(),
  };
}
