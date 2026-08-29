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
 * Prints exactly one JSON line to stdout, in every case including failure:
 *   - Owner-gated:     { ownerGated: true, issueId, reason }
 *   - Not owner-gated: { ownerGated: false, mode, skill, tier, prompt }
 *     (mode/skill/tier/prompt map 1:1 from dispatchWorkItem's DispatchPlan)
 *   - Cannot decide:   { blocked: true, issueId, reason }, exit 1
 *
 * The third case exists because dispatch reads the nexus skill's prompt
 * template from disk, and a machine without that skill installed threw an
 * unhandled error — the caller got a stack trace on stderr instead of the
 * single line this contract promises, and could not tell "environment not
 * ready" apart from "script is broken".
 */

import { isOwnerGated, ownerGateReason } from "../lib/linear-loop/owner-gated";
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

  // The title carries the gate on real issues: RA-7132 announced itself as
  // "[BLOCKER — needs founder auth]" there and nowhere else machine-readable.
  const gateInput = {
    labels: issue.labels ?? [],
    description: issue.description ?? null,
    title: issue.title ?? null,
  };

  if (isOwnerGated(gateInput)) {
    process.stdout.write(
      JSON.stringify({
        ownerGated: true,
        issueId: issue.identifier,
        reason: ownerGateReason(gateInput),
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

/**
 * Best-effort issue id for the failure line. Parsing may itself be what
 * failed, so this must never throw.
 */
function readIdentifierForErrorReport(): string | null {
  try {
    const flagIndex = process.argv.indexOf("--issue-json");
    const raw = flagIndex === -1 ? null : process.argv[flagIndex + 1];
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { identifier?: string };
    return parsed.identifier ?? null;
  } catch {
    return null;
  }
}

try {
  main();
} catch (error) {
  // Still one JSON line, so the caller parses an outcome rather than a trace.
  process.stdout.write(
    JSON.stringify({
      blocked: true,
      issueId: readIdentifierForErrorReport(),
      reason: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exit(1);
}
