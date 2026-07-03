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
import type { MoaDecision } from "./moa-trigger";
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

/**
 * Builds the MOA fan-out dispatch plan: a single Nexus-wrapped brief that
 * names the boardroom skill as the dispatch target and carries a panel
 * brief so the caller can hand each boardroom panellist a specialist lens
 * before invoking boardroom_query (app.server.spec_pipeline.boardroom.boardroom_query,
 * per Pi-Dev-Ops's boardroom SKILL.md). This function does not call
 * boardroom_query itself — Plan 1's loop makes that call using this
 * DispatchPlan as input, exactly as it would use buildSingleAgentDispatch's
 * output to make an Agent-tool call.
 *
 * boardroom's own hard ceiling is 2-4 panellists (its default panel:
 * deepseek/deepseek-v4-flash + anthropic/claude-sonnet-5, synthesised by
 * anthropic/claude-sonnet-5, escalated to anthropic/claude-opus-4-8 on
 * low Jaccard similarity) — this function never asks for more.
 */
export function buildMoaDispatch(
  classification: ClassificationResult,
  routedSkills: RoutedSkill[],
  moaDecision: MoaDecision,
  selectTier: TierSelector,
  issue: LinearIssueInput,
): DispatchPlan {
  if (!moaDecision.fanOut) {
    throw new Error(
      "buildMoaDispatch called with a MoaDecision where fanOut=false — the caller must branch to " +
        "buildSingleAgentDispatch when no MOA trigger fired. moaDecision.reasons was empty.",
    );
  }

  const primary = routedSkills.find((entry) => entry.role === "primary");
  if (!primary) {
    throw new Error(
      `No primary skill found for bucket "${classification.bucket}" — routing-table.ts must define ` +
        "exactly one primary entry per bucket.",
    );
  }

  const panelBrief = routedSkills
    .map((entry) => `${entry.role === "primary" ? "Primary" : "Supporting"} lens: ${entry.skill}`)
    .join("; ");

  const tier = selectTier({ bucket: classification.bucket, skill: "boardroom", fanOut: true });

  const task =
    `I'm working the RestoreAssist Linear backlog item ${issue.identifier}: "${issue.title}". ` +
    `${issue.description} ` +
    `This item triggered MOA fan-out for reason(s): ${moaDecision.reasons.join(", ")}. ` +
    "Invoke the boardroom skill (app.server.spec_pipeline.boardroom.boardroom_query) with its default " +
    `2-4 panellist config. Brief each panellist with the specialist lens implied by this issue's ` +
    `routed skills — ${panelBrief} — so each panellist argues from that specialist's perspective before ` +
    "synthesis. Never skip synthesis; never concatenate panellist answers. Return the synthesised answer, " +
    "the panel's verbatim responses, min_pairwise_similarity, and the escalation/confidence fields per " +
    "boardroom's output contract. Then proceed to implement the synthesised decision end-to-end following " +
    "the linear-task-processor skill's phases (understand, plan, implement, verify with " +
    "pnpm type-check && pnpm lint, commit), with one override: PR target is `main`, not `sandbox`. " +
    "Open a small, scoped PR and stop — do not merge.";

  const prompt = wrapWithNexus(task);

  return { mode: "moa", skill: "boardroom", prompt, tier };
}
