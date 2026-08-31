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
    // Repository variable first, not an environment secret.
    expect(env.RELEASE_RECEIPT_PUBLIC_KEYS).toMatch(
      /\$\{\{\s*vars\.RELEASE_RECEIPT_PUBLIC_KEYS/,
    );
  });

  it("reads the public key from the SAME store on both sides of the pipeline", () => {
    /**
     * The trap that would have burned the owner's first mint. Three statements,
     * two stores:
     *
     *   release-gate.yml    scorer      -> vars.RELEASE_RECEIPT_PUBLIC_KEYS
     *   release-receipt.yml verify step -> secrets.RELEASE_RECEIPT_PUBLIC_KEYS
     *   sign-release-receipt.ts doc     -> "repository secret"
     *
     * Follow the doc, populate only the secret, and the minting workflow's verify
     * step PASSES -- it can see the key -- while the scorer reads an empty map and
     * fails all 35 owner-evidence points. The workflow reports success and commits
     * a receipt that earns nothing.
     *
     * That is precisely what the verify step was added to prevent ("a receipt the
     * scorer would reject is worse than none"), arriving through the verify step
     * itself, because the two were not reading the same place.
     *
     * This asserts they cannot drift apart again.
     */
    const stepEnv = (file: string, needle: string): string => {
      const parsed = parse(
        readFileSync(join(process.cwd(), ".github", "workflows", file), "utf8"),
      ) as { jobs: Record<string, { steps?: Array<Record<string, unknown>> }> };
      const step = Object.values(parsed.jobs)
        .flatMap((j) => j.steps ?? [])
        .find((st) => String(st.run ?? "").includes(needle));
      expect(step, `${file}: no step running ${needle}`).toBeDefined();
      const value = ((step?.env ?? {}) as Record<string, string>)
        .RELEASE_RECEIPT_PUBLIC_KEYS;
      expect(value, `${file}: step must receive RELEASE_RECEIPT_PUBLIC_KEYS`).toBeDefined();
      return value;
    };

    const scorer = stepEnv("release-gate.yml", "release-gate-score.ts");
    const verifier = stepEnv("release-receipt.yml", "ownerEvidence");

    expect(
      verifier,
      "the minting workflow and the scorer must read the same store, or a receipt " +
        "can verify green and score zero",
    ).toBe(scorer);

    /**
     * STRING EQUALITY IS NOT ENOUGH, and asserting only that was how the first fix
     * shipped broken.
     *
     * Both sides carried the identical expression `${{ vars.X || secrets.X }}`, so
     * the `.toBe()` above passed — while the two jobs still read different stores.
     * `secrets.X` resolves against the ENVIRONMENT in the minting job (which
     * declares `environment: release-receipts`) and against repository-wide secrets
     * in the scorer's job (which declares none). An owner who followed the old
     * documentation — environment secret, no repository variable — therefore still
     * got the original failure: verify passes, receipt commits, scorer scores zero.
     *
     * The only way two expressions in differently-scoped jobs are guaranteed to read
     * the same value is if neither can reach a scoped store at all. So: `vars` only,
     * and no `secrets` fallback anywhere in this chain.
     */
    for (const [name, expr] of [["scorer", scorer], ["verifier", verifier]] as const) {
      expect(expr, `${name} must read the repository variable`).toMatch(
        /\$\{\{\s*vars\.RELEASE_RECEIPT_PUBLIC_KEYS\s*\}\}/,
      );
      expect(
        expr.includes("secrets."),
        `${name} must NOT fall back to secrets: it resolves differently in an ` +
          "environment-scoped job than in an unscoped one, so a fallback silently " +
          "re-opens the split this test exists to close",
      ).toBe(false);
    }
  });

  it("refuses to mint when the public key variable is empty", () => {
    /**
     * Without this the workflow signs, commits, and the failure surfaces only later
     * as an owner-evidence criterion that reads exactly like one that legitimately
     * failed. Failing at mint time is the difference between a two-minute fix and a
     * hunt through the producers, which are fine.
     */
    const wf = readFileSync(
      join(process.cwd(), ".github", "workflows", "release-receipt.yml"),
      "utf8",
    );
    const parsed = parse(wf) as {
      jobs: Record<string, { steps?: Array<Record<string, unknown>> }>;
    };
    const steps = Object.values(parsed.jobs).flatMap((j) => j.steps ?? []);

    const guard = steps.find((st) =>
      String(st.run ?? "").includes("RELEASE_RECEIPT_PUBLIC_KEYS is not set"),
    );
    expect(guard, "a preflight must refuse to mint without the key").toBeDefined();

    const run = String(guard?.run ?? "");
    expect(run, "the guard must actually exit non-zero").toMatch(/exit 1/);

    // And it must run BEFORE the signer, or it guards nothing.
    const guardIdx = steps.indexOf(guard!);
    const signIdx = steps.findIndex((st) =>
      String(st.run ?? "").includes("sign-release-receipt.ts"),
    );
    expect(signIdx, "the signing step must exist").toBeGreaterThan(-1);
    expect(
      guardIdx,
      "the preflight must come before signing, or the receipt is already written",
    ).toBeLessThan(signIdx);
  });

  it("RELEASE_GATE.md does not send the owner to a store the scorer cannot read", () => {
    /**
     * The surviving half of the same fault, found by a sweep AFTER the first fix.
     *
     * The workflows and sign-release-receipt.ts were corrected, and this document --
     * the "Owner setup for signed receipts" section, the one an owner actually
     * follows -- was left saying to create the `release-receipts` environment and add
     * RELEASE_RECEIPT_PUBLIC_KEYS to it as a secret.
     *
     * The scorer job declares no `environment:`, so an environment secret can NEVER
     * reach it. The `|| secrets.` fallback does not rescue this: a repository-wide
     * secret works, an ENVIRONMENT secret does not, and the doc explicitly said not
     * to use repository-wide.
     *
     * Fixing the code and leaving the instructions wrong is the class this whole
     * subsystem keeps re-opening, so the instructions are now under test too.
     */
    const doc = readFileSync(
      join(process.cwd(), "docs", "RELEASE_GATE.md"),
      "utf8",
    );
    // The public key must be introduced as a VARIABLE.
    const intro = doc
      .split("\n")
      .find((l) => l.includes("Name `RELEASE_RECEIPT_PUBLIC_KEYS`"));
    expect(intro, "the setup steps must still name where the public key goes")
      .toBeDefined();

    // And the environment-secret table must no longer carry it.
    const envSection = doc.slice(doc.indexOf("release-receipts` GitHub environment"));
    const table = envSection.slice(0, envSection.indexOf("\n\n**") + 1);
    expect(
      table.includes("RELEASE_RECEIPT_PUBLIC_KEYS"),
      "the public key must NOT be listed among the environment secrets: the scorer " +
        "job has no `environment:` and could never read it there",
    ).toBe(false);

    // The private key legitimately belongs there.
    expect(table).toContain("RELEASE_RECEIPT_PRIVATE_KEY");
  });

  it("does not tell the owner to put the public key somewhere the scorer cannot read", () => {
    // The doc comment is the instruction an owner actually follows, so it is part of
    // the contract. It said "repository secret" while the scorer read a variable.
    const signer = readFileSync(
      join(process.cwd(), "scripts", "ci", "sign-release-receipt.ts"),
      "utf8",
    );
    const line = signer
      .split("\n")
      .find((l) => l.includes("PUBLIC half goes into"));
    expect(line, "the keypair instructions must still name where the key goes").toBeDefined();
    expect(line).toMatch(/VARIABLE/);
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
