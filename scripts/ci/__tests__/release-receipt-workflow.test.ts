import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import { CRITERION_POLICIES, RECEIPT_WORKFLOW_PATH } from "../release-receipt";

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
  it("pins C2's scanner by version AND checksum, and never lets it self-install", () => {
    /**
     * The producer reports on the instrument it was handed. If this job could
     * fetch whatever gitleaks it liked at run time, `findings: 0` would be a
     * claim about an unreviewed binary -- inside the one job that holds the
     * signing key.
     *
     * Pinned to the same version and digest as the working-tree scan in
     * pr-checks.yml, so CI and the receipt are the same instrument rather than
     * two that merely share a name.
     */
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "release-receipt.yml"),
      "utf8",
    );
    const prChecks = readFileSync(
      join(process.cwd(), ".github", "workflows", "pr-checks.yml"),
      "utf8",
    );

    const version = /VERSION=([0-9]+\.[0-9]+\.[0-9]+)/.exec(workflow)?.[1];
    const digest = /ARCHIVE_SHA256="([0-9a-f]{64})"/.exec(workflow)?.[1];
    expect(version, "the receipt workflow must pin a gitleaks version").toBeDefined();
    expect(digest, "the receipt workflow must pin a gitleaks checksum").toBeDefined();

    // Same instrument as the PR scan, not merely the same name.
    expect(prChecks).toContain(`VERSION=${version}`);
    expect(prChecks).toContain(`ARCHIVE_SHA256="${digest}"`);

    // The checksum has to be ENFORCED, not just recorded.
    expect(workflow).toMatch(/sha256sum --check --strict/);

    // And the producer must be told which binary to use, rather than being
    // free to find one on PATH.
    expect(workflow).toMatch(/GITLEAKS_BINARY: \/tmp\/gitleaks/);
    expect(
      /options:[\s\S]*?- C2-secrets-scan/.test(workflow),
      "C2 must be dispatchable",
    ).toBe(true);
  });

  it("keeps producers, policies and dispatch options in agreement", () => {
    /**
     * Three lists have to say the same thing, and nothing checked that they did:
     *
     *   - PRODUCERS in sign-release-receipt.ts  (what can be MEASURED)
     *   - CRITERION_POLICIES in release-receipt.ts (what can be VERIFIED)
     *   - workflow_dispatch options in release-receipt.yml (what can be RUN)
     *
     * Drift in any direction is a quiet failure. A criterion in the workflow
     * but not the registry is dispatchable and then dies mid-run. One with a
     * producer but no policy would be measured, signed, and then earn nothing.
     * One with a policy but no producer is the state D3 sat in.
     *
     * CRITERION_POLICIES is already pinned exactly, one test over; this pins
     * the other two against it so adding a criterion stays a deliberate act in
     * all three places rather than two.
     */
    const signer = readFileSync(
      join(process.cwd(), "scripts", "ci", "sign-release-receipt.ts"),
      "utf8",
    );
    const registry = signer.slice(
      signer.indexOf("const PRODUCERS"),
      signer.indexOf("if (process.argv.includes(\"--measurements\")"),
    );
    expect(registry.length).toBeGreaterThan(200);
    const produced = [...registry.matchAll(/^  "([A-Z][0-9][a-z0-9-]+)":/gm)]
      .map((m) => m[1])
      .sort();

    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "release-receipt.yml"),
      "utf8",
    );
    const options = [...workflow.matchAll(/^\s+- ([A-Z][0-9][a-z0-9-]+)$/gm)]
      .map((m) => m[1])
      .sort();

    expect(produced.length).toBeGreaterThan(0);
    expect(options).toEqual(produced);
    expect(Object.keys(CRITERION_POLICIES).sort()).toEqual(produced);
  });

  it("gives the SCORER the public keys, or no receipt can earn a point", () => {
    /**
     * The blocker that made the whole subsystem inert, and which nothing
     * detected: `release-gate.yml`'s scorer step had no
     * RELEASE_RECEIPT_PUBLIC_KEYS. `trustedKeysFromEnv()` returns an EMPTY MAP
     * when the variable is absent, so every owner-evidence criterion failed
     * with "no trusted receipt keys configured" -- all 35 points of the web
     * profile, unconditionally, however perfect the receipts were.
     *
     * It was invisible because those criteria read as failing either way. A
     * gate that cannot pass looks identical to a gate that is not passing.
     *
     * It must be a repository `vars.` reference, not `secrets.`: the job
     * deliberately declares no `environment:`, so an environment-scoped value
     * could never reach it -- and these are PUBLIC keys.
     */
    const gate = readFileSync(
      join(process.cwd(), ".github", "workflows", "release-gate.yml"),
      "utf8",
    );
    const parsed = parse(gate) as {
      jobs: Record<string, { environment?: unknown; steps?: Array<Record<string, unknown>> }>;
    };
    const scorer = Object.values(parsed.jobs)
      .flatMap((j) => j.steps ?? [])
      .find((st) => String(st.run ?? "").includes("release-gate-score.ts"));

    expect(scorer, "the scorer step must exist").toBeDefined();
    const env = (scorer?.env ?? {}) as Record<string, string>;
    expect(
      env.RELEASE_RECEIPT_PUBLIC_KEYS,
      "scorer step must receive RELEASE_RECEIPT_PUBLIC_KEYS",
    ).toBeDefined();
    // Repository variable, not an environment secret.
    expect(env.RELEASE_RECEIPT_PUBLIC_KEYS).toMatch(
      /\$\{\{\s*vars\.RELEASE_RECEIPT_PUBLIC_KEYS\s*\}\}/,
    );
  });
  it("actually produces the report A1 is handed, and sources its specs from the producer", () => {
    /**
     * A1 shipped unmintable. The signer was handed
     * `A1_PLAYWRIGHT_REPORT: ${{ env.A1_PLAYWRIGHT_REPORT }}` -- an `env`
     * context nothing populated -- so it resolved EMPTY and the producer failed
     * on a missing argument. There was no Playwright step at all. The producer
     * was complete and unreachable, and nothing said so.
     */
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "release-receipt.yml"),
      "utf8",
    );
    const parsed = parse(workflow) as {
      jobs: { mint: { steps: Array<Record<string, unknown>> } };
    };
    const steps = parsed.jobs.mint.steps;

    const runner = steps.find((st) =>
      String(st.name ?? "").includes("core journey"),
    );
    expect(runner, "a step must actually run the journey").toBeDefined();
    expect(String(runner?.if ?? "")).toContain("A1-core-journeys");

    const run = String(runner?.run ?? "");
    // The producer owns the spec list; a list written in the workflow would
    // drift and surface as specsMissingFromReport with a misleading cause.
    expect(run).toMatch(/a1-core-journeys\.ts --list-specs/);
    expect(run).toMatch(/playwright test/);
    // The path must be exported, or the signer is handed an empty string again.
    expect(run).toMatch(/A1_PLAYWRIGHT_REPORT=.*>> "\$GITHUB_ENV"/);
    // A missing report must fail the job: it means Playwright never ran, which
    // must not read as a clean run.
    expect(run).toMatch(/! -s .*PLAYWRIGHT_JSON_OUTPUT_NAME/);
    // The sandbox, not production. The journey signs up companies.
    expect(String((runner?.env as Record<string, string>)?.PLAYWRIGHT_BASE_URL))
      .toBe("https://restoreassist-sandbox.vercel.app");

    // And it must run BEFORE the signer, or the variable is not yet set.
    const runnerAt = steps.indexOf(runner as Record<string, unknown>);
    const signAt = steps.findIndex((st) =>
      String(st.name ?? "").includes("Measure and sign"),
    );
    expect(runnerAt).toBeGreaterThanOrEqual(0);
    expect(signAt).toBeGreaterThan(runnerAt);
  });
});
