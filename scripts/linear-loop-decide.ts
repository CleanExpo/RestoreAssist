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
 * Once the arguments parse, this prints exactly one JSON line to stdout —
 * including when the decision itself fails:
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
 *
 * Argument parsing is deliberately outside that guarantee. A missing or
 * malformed --issue-json is the caller's own error, not a decision outcome,
 * and there is no issue identifier yet to attribute a JSON line to; it exits
 * non-zero with **empty stdout** and the error on stderr. Callers should
 * therefore check the exit status before parsing, and treat empty stdout as
 * "this invocation was wrong", not "this issue is blocked".
 */

import { isOwnerGated, ownerGateReason } from "../lib/linear-loop/owner-gated";
import { dispatchWorkItem } from "../lib/agents/routing/dispatch";
import type { LinearIssueInput } from "../lib/agents/routing/types";

/**
 * Reads the issue payload from `--issue-json`.
 *
 * @throws when the flag is absent, has no value, or the value is not JSON.
 *   Callers must let this propagate: it is outside the one-JSON-line contract
 *   (see the file header), so main() does not wrap it.
 */
function parseArgs(): LinearIssueInput {
  const flagIndex = process.argv.indexOf("--issue-json");
  if (flagIndex === -1 || !process.argv[flagIndex + 1]) {
    throw new Error("Usage: linear-loop-decide.ts --issue-json '<json>'");
  }
  return JSON.parse(process.argv[flagIndex + 1]) as LinearIssueInput;
}

/**
 * Entry point. Parses argv, then runs the decision inside the structured-
 * failure boundary described in the file header.
 */
function main(): void {
  // parseArgs deliberately throws on malformed input: a bad invocation is the
  // caller's error, and scripts/__tests__/linear-loop-decide.test.ts pins that
  // to a non-zero exit with empty stdout. Only the decision phase below, which
  // touches the filesystem, reports failure as a JSON line.
  const issue = parseArgs();

  try {
    decide(issue);
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        blocked: true,
        issueId: issue.identifier,
        reason: error instanceof Error ? error.message : String(error),
      }) + "\n",
    );
    process.exit(1);
  }
}

/**
 * Owner-gate check, then routing. Writes the single decision line to stdout.
 *
 * @throws when dispatchWorkItem cannot build a plan (typically a missing
 *   NEXUS_PROMPT.md); main() renders that as the `{ blocked: true }` line.
 */
function decide(issue: LinearIssueInput): void {

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

main();
