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
 * 2. OR the issue description matches /owner[- ]?(action[- ]?)?gated/i —
 *    a fallback for issues not yet labelled, known-fragile by design (the
 *    label is the durable signal; the regex catches drift until triage
 *    catches up).
 */

export const OWNER_GATED_LABEL_NAME = "owner-gated";

const OWNER_GATED_DESCRIPTION_PATTERN = /owner[- ]?(action[- ]?)?gated/i;

export interface OwnerGateCheckInput {
  /** Linear label names attached to the issue (not label objects/IDs). */
  labels: string[];
  /** Issue description text, or null if the issue has none. */
  description: string | null;
}

export function isOwnerGated(issue: OwnerGateCheckInput): boolean {
  if (issue.labels.includes(OWNER_GATED_LABEL_NAME)) {
    return true;
  }
  if (issue.description && OWNER_GATED_DESCRIPTION_PATTERN.test(issue.description)) {
    return true;
  }
  return false;
}
