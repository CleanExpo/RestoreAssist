/**
 * Dispatch-path builders for the continuous MOA loop (spec §4-§6).
 *
 * buildSingleAgentDispatch: no-fan-out path — Nexus-wraps a single
 * specialist-skill dispatch (Task 4).
 * buildMoaDispatch: fan-out path — invokes the boardroom skill (Task 5).
 * dispatchWorkItem: composes classifier + routing table + MOA trigger +
 * both dispatch paths; this is the function Plan 1's loop calls (Task 6).
 */

import type {
  ClassificationResult,
  DispatchPlan,
  LinearIssueInput,
  ModelTier,
  TierSelector,
  WorkTypeBucket,
} from "./types";
import type { RoutedSkill } from "./routing-table";
import { wrapWithNexus } from "./nexus-wrap";

export { wrapWithNexus };

/**
 * PLACEHOLDER tier selector. The real tier-SELECTION rule (spec §5) is
 * defined by a separate Pi-Dev-Ops PR to the `nexus` skill (tracked
 * externally as "Plan 4"). Until that PR lands and a real TierSelector is
 * wired in by the loop caller, every dispatch runs at sonnet-5 — safe,
 * cheap, and never silently escalates to Fable 5 spend. Replace the
 * `selectTier` argument at the call site once Plan 4 ships; do not edit
 * this function to add tier logic — that logic belongs in Plan 4's PR.
 */
export function defaultTierSelector(_context: {
  bucket: WorkTypeBucket;
  skill: string;
  fanOut: boolean;
}): ModelTier {
  return "sonnet-5";
}

function describeIssueForTask(issue: LinearIssueInput): string {
  return (
    `I'm working the RestoreAssist Linear backlog item ${issue.identifier}: "${issue.title}". ` +
    `${issue.description} ` +
    `This is a "${issue.team}" team item${issue.project ? ` in project "${issue.project}"` : ""}. ` +
    "Implement it end-to-end following the linear-task-processor skill's phases " +
    "(understand, plan, implement, verify with pnpm type-check && pnpm lint, commit), " +
    "with one override: PR target is `main`, not `sandbox`. Open a small, scoped PR and stop — " +
    "do not merge."
  );
}

/**
 * Builds the no-fan-out dispatch plan: a single Nexus-wrapped prompt
 * targeting the routing table's primary skill for this issue's bucket.
 */
export function buildSingleAgentDispatch(
  classification: ClassificationResult,
  routedSkills: RoutedSkill[],
  selectTier: TierSelector,
  issue: LinearIssueInput,
): DispatchPlan {
  const primary = routedSkills.find((entry) => entry.role === "primary");
  if (!primary) {
    throw new Error(
      `No primary skill found for bucket "${classification.bucket}" — routing-table.ts must define ` +
        "exactly one primary entry per bucket.",
    );
  }

  const tier = selectTier({ bucket: classification.bucket, skill: primary.skill, fanOut: false });
  const task = describeIssueForTask(issue);
  const prompt = wrapWithNexus(task);

  return { mode: "single-agent", skill: primary.skill, prompt, tier };
}
