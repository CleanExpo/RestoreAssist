/**
 * MOA fan-out trigger decision (spec §4).
 *
 * Implements the 5 trigger criteria verbatim from
 * docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md §4.
 * If ANY trigger matches, `fanOut` is true and the loop routes through
 * `buildMoaDispatch` (Task 5) instead of `buildSingleAgentDispatch` (Task 4).
 *
 * Criteria 1-3 (architecture / hard-to-reverse / judge-gate) detect their
 * condition from BOTH free text and Linear labels:
 *   - Free text is matched with word-boundary-aware phrases, so a keyword
 *     embedded in a larger word (`api` in `apiary`) never triggers, and a
 *     signal phrase carrying non-word chars (`/judge`, `go/no-go`) still
 *     matches — which a naive `\b` would drop.
 *   - Labels are matched as exact, normalised structured signals — the same
 *     class of input criteria 4-5 already rely on (crossCuttingBuckets,
 *     hasOpenSpecQuestions). A deliberate `migration` / `breaking-change`
 *     label is high-signal in a way the bare word "migration" in prose is not.
 *
 * This replaces the earlier naive substring heuristic where bare `schema` /
 * `migration` keywords fired on incidental mentions ("schema diagram",
 * "migration guide") while genuinely irreversible work phrased without the
 * exact keyword ("flip the production feature flag permanently") slipped past.
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

/**
 * A structured signal set for one of trigger criteria 1-3. Each criterion
 * detects its condition from either a word-boundary-aware text phrase match
 * OR an exact (normalised) Linear-label match.
 */
interface TriggerSignals {
  reason: string;
  /** Word-boundary-matched against `${title}\n${description}`. */
  phrases: string[];
  /** Exact match against normalised issue labels (see `normaliseLabel`). */
  labels: string[];
}

const ARCHITECTURE_SIGNALS: TriggerSignals = {
  reason: "architecture-level-multi-approach",
  phrases: [
    "choose between",
    "which approach",
    "architecture",
    "architectural",
    "architectures",
    "materially different",
    "two approaches",
    "multiple approaches",
    "several approaches",
    "competing approaches",
    "either approach",
    "trade-off between",
    "tradeoff between",
  ],
  labels: ["architecture", "adr", "rfc", "design-decision", "spike"],
};

const HARD_TO_REVERSE_SIGNALS: TriggerSignals = {
  reason: "hard-to-reverse",
  // Precise multi-word phrases — bare "schema"/"migration" are intentionally
  // absent so incidental mentions ("schema diagram", "migration guide") no
  // longer fire. Single-word entries ("irreversible", "permanently") rely on
  // the word-boundary matcher to avoid partial-word false positives.
  phrases: [
    "schema migration",
    "database migration",
    "prisma migration",
    "db migration",
    "destructive migration",
    "schema change",
    "production database",
    "drop table",
    "drop column",
    "alter table",
    "public api",
    "api contract",
    "breaking change",
    "backwards incompatible",
    "backward incompatible",
    "security posture",
    "production infra",
    "production infrastructure",
    "irreversible",
    "hard to reverse",
    "hard-to-reverse",
    "cannot be rolled back",
    "can't be rolled back",
    "cannot be undone",
    "one-way door",
    "permanently",
    "data loss",
  ],
  labels: [
    "migration",
    "db-migration",
    "database-migration",
    "breaking-change",
    "breaking",
    "hard-to-reverse",
    "irreversible",
  ],
};

const JUDGE_GATE_SIGNALS: TriggerSignals = {
  reason: "judge-gate-present",
  phrases: [
    "/judge",
    "go/no-go",
    "go-no-go",
    "go no go",
    "judge gate",
    "judge review",
    "no-go gate",
    "approval gate",
  ],
  labels: ["judge", "go-no-go", "needs-judge", "gate"],
};

interface CompiledSignals {
  reason: string;
  phrasePatterns: RegExp[];
  labels: Set<string>;
}

/**
 * Build a case-insensitive regex that matches `phrase` only when its
 * word-character edges are on a word boundary. Boundaries are applied only at
 * edges that are themselves word characters, so phrases that start or end with
 * punctuation ("/judge", "go/no-go") still match — unlike a plain `\b`, which
 * fails at a space→"/" transition.
 */
function phraseMatcher(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^[A-Za-z0-9]/.test(phrase) ? "(?<![A-Za-z0-9])" : "";
  const tail = /[A-Za-z0-9]$/.test(phrase) ? "(?![A-Za-z0-9])" : "";
  return new RegExp(`${lead}${escaped}${tail}`, "i");
}

function normaliseLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function compile(signals: TriggerSignals): CompiledSignals {
  return {
    reason: signals.reason,
    phrasePatterns: signals.phrases.map(phraseMatcher),
    labels: new Set(signals.labels.map(normaliseLabel)),
  };
}

const TEXT_SIGNALS: CompiledSignals[] = [
  compile(ARCHITECTURE_SIGNALS),
  compile(HARD_TO_REVERSE_SIGNALS),
  compile(JUDGE_GATE_SIGNALS),
];

function matches(signal: CompiledSignals, text: string, labels: Set<string>): boolean {
  if (signal.phrasePatterns.some((pattern) => pattern.test(text))) {
    return true;
  }
  for (const label of signal.labels) {
    if (labels.has(label)) {
      return true;
    }
  }
  return false;
}

export function shouldFanOut(input: MoaTriggerInput): MoaDecision {
  const reasons: string[] = [];
  const text = `${input.issue.title}\n${input.issue.description}`;
  const labels = new Set((input.issue.labels ?? []).map(normaliseLabel));

  // Criteria 1-3: architecture-level, hard-to-reverse, judge-gate.
  for (const signal of TEXT_SIGNALS) {
    if (matches(signal, text, labels)) {
      reasons.push(signal.reason);
    }
  }

  // Criterion 4: ambiguous / under-specified (structured signal from spm).
  if (input.hasOpenSpecQuestions) {
    reasons.push("ambiguous-spec");
  }

  // Criterion 5: cross-cutting across 3+ routing buckets (structured signal).
  if (input.crossCuttingBuckets && input.crossCuttingBuckets.length >= 3) {
    reasons.push("cross-cutting-3-plus-buckets");
  }

  return { fanOut: reasons.length > 0, reasons };
}
