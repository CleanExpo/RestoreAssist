/**
 * Owner-gated detection for the continuous Linear loop (AGENTS.md rule 19).
 *
 * An issue is owner-gated if it needs human sign-off before an agent may
 * execute the underlying action — see .claude/RULES.md rules 29-33 for the
 * full list (prod migrations, secret rotation, spend >$50 AUD, deleting/
 * cancelling production resources, merging into main).
 *
 * Detection is label-first, regex-fallback (spec: docs/superpowers/specs/
 * 2026-07-03-continuous-moa-agent-loop-design.md §3 step 2):
 * 1. The Linear "owner-gated" label (create_issue_label call recorded in
 *    docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md Task 2)
 *    is present on the issue.
 * 2. OR the issue title or description states, in plain words, that a human
 *    must act first. The label is the durable signal; the patterns catch
 *    drift until triage catches up.
 *
 * **This gate is deliberately biased towards over-blocking.** Skipping an
 * issue that a human could have delegated costs one cycle and is visible
 * immediately. Failing to skip one lets an agent rotate a secret, migrate
 * production or merge to main on its own. The two errors are not
 * symmetrical, so an ambiguous phrase is treated as gated.
 */

export const OWNER_GATED_LABEL_NAME = "owner-gated";

/**
 * Each pattern is tied to wording observed on a real RA issue, not invented.
 * Extend this list from live issues that slipped through, never from
 * guesses about how someone might phrase it.
 */
const OWNER_GATED_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  // The original signal: an explicit owner-gated marker anywhere in the text.
  { name: "owner-gated marker", pattern: /owner[- ]?(action[- ]?)?gated/i },

  // RA-7132 description: "## BLOCKED ON FOUNDER — two steps an agent must not take".
  { name: "blocked on a named human", pattern: /blocked on (?:the )?(?:founder|owner|human)\b/i },

  // RA-7132 title: "[BLOCKER — needs founder auth] Move skills-library to GitLab".
  // "human" belongs in the subject group alongside "founder" and "owner": the
  // two patterns either side of this one already accept it ("blocked on human",
  // "awaiting human"), so leaving it out here let "needs human approval" —
  // wording that gates just as plainly — route straight to an agent.
  {
    name: "needs human authority",
    pattern:
      /needs?\s+(?:the\s+)?(?:founder|owner|human)(?:'s)?\s+(?:auth\w*|approval|sign-?off|decision|permission)/i,
  },

  // RA-7132 description: "Agents do not create accounts", "an agent must not take".
  { name: "agent prohibition", pattern: /\bagents?\s+(?:do not|don't|must not|cannot|can't|may not)\b/i },

  // RA-5689 description: "## Decision requested (Rana)".
  {
    name: "decision requested",
    pattern: /\b(?:decision|approval|sign-?off)s?\s+(?:requested|required|needed|pending)\b/i,
  },

  // Defensive companion to the above; no live example yet.
  { name: "awaiting a human", pattern: /awaiting\s+(?:founder|owner|human)\b/i },
];

export interface OwnerGateCheckInput {
  /** Linear label names attached to the issue (not label objects/IDs). */
  labels: string[];
  /** Issue description text, or null if the issue has none. */
  description: string | null;
  /**
   * Issue title. Optional so existing callers keep compiling, but pass it:
   * RA-7132 announced its gating only in the title, as "[BLOCKER — needs
   * founder auth]", and was scored not-gated while the description below
   * told agents which two steps they must not take.
   */
  title?: string | null;
}

/**
 * The label or pattern that gated the issue, for logging and audit.
 *
 * @param issue Labels, description and (please) title of the Linear issue.
 * @returns `label:owner-gated` when the durable label is present, otherwise
 *   `text:<pattern name>` for the first matching pattern, or `null` when the
 *   issue is free for an agent to pick up.
 */
export function ownerGateReason(issue: OwnerGateCheckInput): string | null {
  if (issue.labels.includes(OWNER_GATED_LABEL_NAME)) {
    return `label:${OWNER_GATED_LABEL_NAME}`;
  }
  const haystack = [issue.title ?? "", issue.description ?? ""].join("\n");
  if (!haystack.trim()) {
    return null;
  }
  for (const { name, pattern } of OWNER_GATED_PATTERNS) {
    if (pattern.test(haystack)) {
      return `text:${name}`;
    }
  }
  return null;
}

/**
 * True when the issue must not be dispatched to an agent without a human
 * acting first. Prefer {@link ownerGateReason} where the caller logs or
 * reports *why* an issue was skipped; this is the boolean shorthand.
 */
export function isOwnerGated(issue: OwnerGateCheckInput): boolean {
  return ownerGateReason(issue) !== null;
}
