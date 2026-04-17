import type { RoutingDecision, TeacherTurn } from "./types";

export type RoutingInput = {
  utterance: TeacherTurn;
  online: boolean;
  /** Set by the on-device photo / text pre-screen — true if PII detected. */
  containsPII: boolean;
  /** Set when the utterance is a classification, scope, or report-synthesis ask. */
  requiresClauseCitation: boolean;
};

/** Below this word count the turn is assumed cheap enough for Gemma local. */
const SHORT_UTTERANCE_WORDS = 15;

/**
 * Decide whether to route a turn to on-device Gemma 3n or cloud Claude Opus 4.7.
 *
 * Rule (from Opus 4.7 architect spec, RA-1132):
 *   1. Offline → Gemma local (bypassCloud)
 *   2. PII → Gemma local (bypassCloud)
 *   3. Short utterance (<15 words) → Gemma local (cloud still allowed later)
 *   4. Requires clause citation (classify / scope / synth) → Claude cloud
 *   5. Otherwise → Gemma local (default cheap path)
 *
 * `bypassCloud` is set when the turn must never leave the device regardless of
 * connectivity (offline or PII). Callers should use it to skip telemetry that
 * includes the utterance payload.
 */
export function routeTurn(input: RoutingInput): RoutingDecision {
  const wordCount = input.utterance.content
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  if (!input.online) {
    return { target: "gemma_local", reason: "offline", bypassCloud: true };
  }
  if (input.containsPII) {
    return {
      target: "gemma_local",
      reason: "PII redaction required",
      bypassCloud: true,
    };
  }
  if (wordCount < SHORT_UTTERANCE_WORDS) {
    return {
      target: "gemma_local",
      reason: "short utterance (<15 words)",
      bypassCloud: false,
    };
  }
  if (input.requiresClauseCitation) {
    return {
      target: "claude_cloud",
      reason: "clause citation required",
      bypassCloud: false,
    };
  }
  return {
    target: "gemma_local",
    reason: "default cheap path",
    bypassCloud: false,
  };
}
