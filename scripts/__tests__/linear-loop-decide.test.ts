/**
 * Tests for the decision CLI (scripts/linear-loop-decide.ts).
 *
 * These tests shell out to the real CLI via execSync/tsx — the CLI is a
 * thin binding over isOwnerGated (lib/linear-loop/owner-gated.ts) and
 * dispatchWorkItem (lib/agents/routing/dispatch.ts), reused as-is (not
 * re-composed). See .superpowers/sdd/task-2-integration-report.md for the
 * reconciliation notes against the original task-2-brief.md.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(__dirname, "..", "linear-loop-decide.ts");

// The CLI's dispatch path Nexus-wraps every non-owner-gated task, which reads
// NEXUS_PROMPT.md. That file lives in the `nexus` skill (~/.claude/skills/nexus)
// and is absent on CI runners, so point NEXUS_PROMPT_PATH at a committed fixture
// to keep this subprocess hermetic — the test must not depend on a file outside
// the repo.
const NEXUS_PROMPT_FIXTURE = join(__dirname, "fixtures", "nexus-prompt.fixture.md");

function runCli(issue: unknown): string {
  // Pass the issue JSON via an env var (not shell-interpolated into the
  // command string) so payload content — quotes, apostrophes, etc. — can
  // never break shell argument parsing.
  return execSync(`npx tsx "${CLI_PATH}" --issue-json "$ISSUE_JSON"`, {
    encoding: "utf-8",
    env: {
      ...process.env,
      ISSUE_JSON: JSON.stringify(issue),
      NEXUS_PROMPT_PATH: NEXUS_PROMPT_FIXTURE,
    },
  });
}

describe("linear-loop-decide CLI", () => {
  it("outputs a decision JSON for a routine bug issue", () => {
    const issue = {
      identifier: "RA-9999",
      title: "Fix a null pointer in the report renderer",
      description: "Reports crash when totalCost is null.",
      labels: [],
      team: "RestoreAssist",
    };
    const out = runCli(issue);
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(1);

    const decision = JSON.parse(lines[0]);
    expect(decision.ownerGated).toBe(false);
    expect(typeof decision.mode).toBe("string");
    expect(["single-agent", "moa"]).toContain(decision.mode);
    expect(typeof decision.skill).toBe("string");
    expect(decision.skill.length).toBeGreaterThan(0);
    expect(decision.tier).toBe("sonnet-5");
    expect(typeof decision.prompt).toBe("string");
    expect(decision.prompt.length).toBeGreaterThan(0);
  });

  it("flags an owner-gated issue via description and skips routing entirely", () => {
    const issue = {
      identifier: "RA-9998",
      title: "Run the pilot cutover migration",
      description: "Owner-action gated — Claude won't run prod migrations.",
      labels: [],
      team: "RestoreAssist",
    };
    const out = runCli(issue);
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(1);

    const decision = JSON.parse(lines[0]);
    expect(decision.ownerGated).toBe(true);
    expect(decision.mode).toBeUndefined();
    expect(decision.prompt).toBeUndefined();
  });

  it("flags an owner-gated issue via the owner-gated label", () => {
    const issue = {
      identifier: "RA-9997",
      title: "Rotate the production secret",
      description: "Needs a secret rotation before go-live.",
      labels: ["owner-gated"],
      team: "RestoreAssist",
    };
    const out = runCli(issue);
    const decision = JSON.parse(out.trim());
    expect(decision.ownerGated).toBe(true);
  });
});
