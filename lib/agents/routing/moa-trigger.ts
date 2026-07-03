/**
 * MOA fan-out trigger decision (spec §4).
 *
 * Implements the 5 trigger criteria verbatim from
 * docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md §4.
 * If ANY trigger matches, `fanOut` is true and the loop routes through
 * `buildMoaDispatch` (Task 5) instead of `buildSingleAgentDispatch` (Task 4).
 */

import type { LinearIssueInput, WorkTypeBucket } from "./types";
import type { RoutedSkill } from "./routing-table";

export interface MoaTriggerInput {
  bucket: WorkTypeBucket;
  routedSkills: RoutedSkill[];
  issue: LinearIssueInput;
  /**
   * Buckets this issue spans, when the classifier or a human note has
   * identified more than one applicable bucket. Optional — Plan 1's loop
   * only needs to pass this when it has cross-bucket signal (e.g. labels
   * spanning "design", "copy", "marketing" simultaneously).
   */
  crossCuttingBuckets?: WorkTypeBucket[];
  /**
   * Set true when spm/spec-writing (or the classifier's own heuristics)
   * flagged the issue as under-specified. Optional; defaults to false.
   */
  hasOpenSpecQuestions?: boolean;
}

export interface MoaDecision {
  fanOut: boolean;
  reasons: string[];
}

const ARCHITECTURE_KEYWORDS = [
  "choose between",
  "which approach",
  "architecture",
  "materially different",
  "two approaches",
  "competing approaches",
];

const HARD_TO_REVERSE_KEYWORDS = [
  "migration",
  "schema",
  "production database",
  "public api",
  "security posture",
  "production infra",
];

const JUDGE_GATE_KEYWORDS = ["/judge", "go/no-go", "go-no-go", "judge gate", "judge review"];

function textIncludesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function shouldFanOut(input: MoaTriggerInput): MoaDecision {
  const reasons: string[] = [];
  const haystack = `${input.issue.title} ${input.issue.description}`.toLowerCase();

  if (textIncludesAny(haystack, ARCHITECTURE_KEYWORDS)) {
    reasons.push("architecture-level-multi-approach");
  }

  if (textIncludesAny(haystack, HARD_TO_REVERSE_KEYWORDS)) {
    reasons.push("hard-to-reverse");
  }

  if (textIncludesAny(haystack, JUDGE_GATE_KEYWORDS)) {
    reasons.push("judge-gate-present");
  }

  if (input.hasOpenSpecQuestions) {
    reasons.push("ambiguous-spec");
  }

  if (input.crossCuttingBuckets && input.crossCuttingBuckets.length >= 3) {
    reasons.push("cross-cutting-3-plus-buckets");
  }

  return { fanOut: reasons.length > 0, reasons };
}
