/**
 * Decision CLI for the continuous Linear-driven MOA loop.
 *
 * Invoked as: npx tsx scripts/linear-loop-decide.ts --issue-json '<json>'
 *
 * This is a thin binding, not a re-composition: owner-gate detection reuses
 * isOwnerGated (lib/linear-loop/owner-gated.ts) and all classify → route →
 * MOA-decision → tier-selection → dispatch-plan composition reuses
 * dispatchWorkItem (lib/agents/routing/dispatch.ts) verbatim. See
 * .superpowers/sdd/task-2-integration-report.md for why this reconciles
 * away from task-2-brief.md's Step 3, which re-composed those internals
 * from scratch — dispatchWorkItem already does that composition.
 *
 * Prints exactly one JSON line to stdout:
 *   - Owner-gated:     { ownerGated: true }
 *   - Not owner-gated: { ownerGated: false, mode, skill, tier, prompt }
 *     (mode/skill/tier/prompt map 1:1 from dispatchWorkItem's DispatchPlan)
 */

import { isOwnerGated } from "../lib/linear-loop/owner-gated";
import { dispatchWorkItem } from "../lib/agents/routing/dispatch";
import type { LinearIssueInput } from "../lib/agents/routing/types";

function parseArgs(): LinearIssueInput {
  const flagIndex = process.argv.indexOf("--issue-json");
  if (flagIndex === -1 || !process.argv[flagIndex + 1]) {
    throw new Error("Usage: linear-loop-decide.ts --issue-json '<json>'");
  }
  return JSON.parse(process.argv[flagIndex + 1]) as LinearIssueInput;
}

function main(): void {
  const issue = parseArgs();

  const ownerGated = isOwnerGated({
    labels: issue.labels ?? [],
    description: issue.description ?? null,
  });

  if (ownerGated) {
    process.stdout.write(
      JSON.stringify({
        ownerGated: true,
        issueId: issue.identifier,
      }) + "\n",
    );
    return;
  }

  const plan = dispatchWorkItem(issue);

  process.stdout.write(
    JSON.stringify({
      ownerGated: false,
      mode: plan.mode,
      skill: plan.skill,
      tier: plan.tier,
      prompt: plan.prompt,
    }) + "\n",
  );
}

main();
