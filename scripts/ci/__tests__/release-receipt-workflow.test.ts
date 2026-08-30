import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import { RECEIPT_WORKFLOW_PATH } from "../release-receipt";

/**
 * The workflow IS the control.
 *
 * `sign-release-receipt.ts` used to accept a `--measurements` argument and sign
 * whatever it was handed, so a holder of a valid key could certify "zero open
 * blockers" with no producer ever running — self-attestation with a signature
 * on it. The structural fix removed that argument, but the remaining half is
 * operational: the signing key must be reachable only by this workflow, and
 * this workflow must be unreachable from a pull request.
 *
 * Those are YAML properties, and YAML properties rot silently. A later `on:
 * pull_request` added for convenience would hand the key to anyone who can open
 * a PR, and nothing in the TypeScript would notice. Hence these tests.
 */

const WORKFLOW = join(process.cwd(), RECEIPT_WORKFLOW_PATH);

function workflow() {
  return parse(readFileSync(WORKFLOW, "utf8")) as {
    on: Record<string, unknown>;
    jobs: Record<
      string,
      { environment?: string; if?: string; steps: Array<{ run?: string }> }
    >;
  };
}

describe("the receipt workflow cannot be reached from a pull request", () => {
  it("is triggered only by workflow_dispatch", () => {
    // The single most important assertion in this file. A pull request can
    // edit this very file, so any PR-reachable trigger hands over the key.
    expect(Object.keys(workflow().on)).toEqual(["workflow_dispatch"]);
  });

  it("scopes its secrets to a gated environment", () => {
    // Repository-wide secrets are readable by every workflow, which is exactly
    // the hole this exists to close.
    expect(workflow().jobs.mint.environment).toBe("release-receipts");
  });

  it("checks out main, so a receipt binds to the tree it measured", () => {
    const checkout = workflow().jobs.mint.steps.find((s) =>
      String((s as { uses?: string }).uses ?? "").startsWith("actions/checkout"),
    ) as { with?: { ref?: string } } | undefined;
    expect(checkout?.with?.ref).toBe("main");
  });
});

describe("the workflow never hand-feeds measurements", () => {
  it("does not pass --measurements to the signer", () => {
    // If this ever reappears, the P1 is back: the signer would be certifying
    // numbers chosen by whoever edited the workflow rather than measured.
    const runs = workflow()
      .jobs.mint.steps.map((s) => s.run ?? "")
      .join("\n");
    expect(runs).not.toContain("--measurements");
  });

  it("verifies the receipt before committing it", () => {
    // A receipt the scorer would reject is worse than none: it sits in the
    // tree looking like evidence while earning nothing.
    const runs = workflow()
      .jobs.mint.steps.map((s) => s.run ?? "")
      .join("\n");
    expect(runs).toContain("ownerEvidence");
  });
});

describe("a branch dispatch cannot mint a receipt", () => {
  /**
   * CodeRabbit's second P1 on #2112. `workflow_dispatch` lets the dispatcher
   * choose any branch, and the chosen branch's copy of this file supplies the
   * `run:` blocks -- so an attacker's branch can export a forged
   * GITHUB_WORKFLOW_REF pointing at refs/heads/main and mint a receipt that
   * satisfies checkProvenance.
   *
   * Read the next assertion knowing what it is NOT: the guard lives in the
   * file the attacker controls, so it stops an accident, not an attack. The
   * control that holds is the environment's deployment-branch rule, enforced
   * by GitHub outside this file, and no test here can assert repository
   * configuration. That is why the docs assertion below exists.
   */
  it("refuses to run from any ref but main", () => {
    expect(workflow().jobs.mint.if).toBe("github.ref == 'refs/heads/main'");
  });

  it("documents the deployment-branch rule as required owner setup", () => {
    // The guard above is defence in depth. If the docs stop telling the owner
    // to restrict the environment to main, the only real control is gone and
    // nothing in the code would notice.
    //
    // The first version of this asserted /deployment.branch rule/i, which is
    // close to worthless: the `.` matches any character, and nothing required
    // the rule to name the environment, the branch, or reviewers. The docs
    // could have dropped the main-only restriction entirely and this still
    // passed — a test unable to fail for the reason it exists. Raised by
    // CodeRabbit on #2113.
    const doc = readFileSync(
      join(process.cwd(), "docs", "RELEASE_GATE.md"),
      "utf8",
    );
    for (const required of [
      /deployment-branch rule/,
      /restricting `release-receipts` to `main`/,
      /required reviewers/,
    ]) {
      expect(doc).toMatch(required);
    }
    // And it must still be described as the control rather than as optional
    // hardening, because that framing is what stops it being skipped.
    expect(doc).toMatch(/not optional hardening/);
  });
});
