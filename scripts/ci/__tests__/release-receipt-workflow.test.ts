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
    jobs: Record<string, { environment?: string; steps: Array<{ run?: string }> }>;
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
