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
import { shouldFanOut } from "./moa-trigger";
import { classifyWorkItem } from "./classifier";
import { routeToSkills } from "./routing-table";

export { wrapWithNexus };

/**
 * Real tier-SELECTION rule (spec §5, Plan 4 / Pi-Dev-Ops nexus/SKILL.md's
 * "Tier selection" subsection), encoded against the actual TierSelector
 * context this loop has available: { bucket, skill, fanOut }.
 *
 * Order matters — checked top to bottom, first match wins:
 *   1. fable-5  — fanOut === true (MOA synthesis/arbiter role) OR
 *                 skill === "judge" (judge/spec-gate decision).
 *   2. opus-4.8 — single-specialist dispatch with real ambiguity, mapped to
 *                 bucket === "design" || bucket === "security"
 *                 (architecture-adjacent / security-sensitive ambiguity),
 *                 when not already fable-5.
 *   3. sonnet-5 — default for everything else (routine dev/copy/dispatch).
 *
 * haiku-4.5 (mechanical/routine work) is intentionally NOT selected here:
 * the current { bucket, skill, fanOut } context carries no mechanical
 * signal to key off, and fabricating one (e.g. inferring "mechanical" from
 * bucket) would be a dead branch that can never really distinguish
 * mechanical work from any other single-agent dispatch. Add a haiku-4.5
 * branch once the loop passes an explicit mechanical/routine signal into
 * this context.
 */
export function defaultTierSelector(context: {
  bucket: WorkTypeBucket;
  skill: string;
  fanOut: boolean;
}): ModelTier {
  if (context.fanOut || context.skill === "judge") return "fable-5";
  if (context.bucket === "design" || context.bucket === "security") return "opus-4.8";
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

/**
 * Integration point for Plan 1 (Core Loop Mechanics).
 *
 * Plan 1's single-cycle loop is assumed to call a dispatch function at its
 * dispatch step (spec §3 steps 3-5) shaped like:
 *   async function dispatchWorkItem(issue: LinearIssueInput): Promise<PrResult>
 * as a placeholder doing simple single-agent dispatch with no routing table
 * or MOA. This function does NOT match that signature — it is synchronous
 * and returns a DispatchPlan (what to dispatch, not the dispatch's result),
 * by design: this plan computes routing + fan-out decisions; Plan 1 owns
 * the actual Agent-tool/boardroom_query call, worktree isolation, and
 * PR-open mechanics. Whoever reconciles the two plans must update Plan 1's
 * loop body to call this function, branch on `plan.mode`, perform the real
 * dispatch using `plan.prompt` + `plan.tier`, and produce Plan 1's own
 * PrResult from that dispatch's outcome.
 *
 * `moaContext` carries the two signals this module cannot derive from the
 * issue alone: cross-cutting bucket membership and open-spec-question
 * status. Plan 1's loop should pass these when available (e.g. from a
 * multi-label issue, or from a preceding spm/spec-writing pass); omitting
 * them just means those two specific MOA triggers never fire for that
 * issue — the other three (architecture-level, hard-to-reverse, judge-gate)
 * are still detected from issue text alone.
 */
export function dispatchWorkItem(
  issue: LinearIssueInput,
  selectTier: TierSelector = defaultTierSelector,
  moaContext?: { crossCuttingBuckets?: WorkTypeBucket[]; hasOpenSpecQuestions?: boolean },
): DispatchPlan {
  const classification = classifyWorkItem(issue);
  const routedSkills = routeToSkills(classification.bucket);
  const moaDecision = shouldFanOut({
    bucket: classification.bucket,
    routedSkills,
    issue,
    crossCuttingBuckets: moaContext?.crossCuttingBuckets,
    hasOpenSpecQuestions: moaContext?.hasOpenSpecQuestions,
  });

  if (moaDecision.fanOut) {
    return buildMoaDispatch(classification, routedSkills, moaDecision, selectTier, issue);
  }

  return buildSingleAgentDispatch(classification, routedSkills, selectTier, issue);
}
