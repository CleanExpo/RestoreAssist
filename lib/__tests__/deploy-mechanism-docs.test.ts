/**
 * Operational docs must describe the REAL deploy mechanism.
 *
 * The overnight report and the day-1 checklist both stated:
 *
 *   ".do/app.yaml pins `branch: main` but sets no `deploy_on_push`, and
 *    DigitalOcean defaults that to false"
 *
 * That is not what the file says. Verified against main with `gh api`:
 * `.do/app.yaml` contains no `branch:` key and no `deploy_on_push` key at all.
 * It is a container-image spec pinned to a GHCR digest, and the committed
 * digest is an all-zero placeholder that `render-production-app-spec.mjs`
 * fills in at deploy time.
 *
 * The conclusion ("merging main does not deploy") was right; the mechanism
 * named was wrong — and a wrong mechanism points an operator at a fix that
 * does nothing.
 *
 * Updated 26/08/2026: `deploy-production.yml` no longer refuses to activate.
 * It was named "(BLOCKED)" and exited 1 unconditionally, which is why the
 * checklist previously had to tell operators that no automated path existed.
 * It now has one, so the checklist must carry the sequence rather than the
 * dead end — an operator reading "there is no way to deploy" during an
 * incident would waste the outage on a manual workaround they no longer need.
 *
 * These are runbooks. Someone reads them during an incident and acts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const readDoc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

// overnight-report-2026-08-25.md is a byte-identical copy of
// overnight-report.md. Correcting one and not the other would leave a stale
// copy that still reads as authoritative.
const OPERATIONAL_DOCS = [
  "docs/overnight-report.md",
  "docs/overnight-report-2026-08-25.md",
  "docs/launch-kit/05-day-1-checklist.md",
] as const;

/**
 * Docs that state HOW production ships. Separate from the list above because
 * the failure is different: those three named a wrong mechanism, this one
 * asserted the opposite outcome.
 *
 * `.claude/WORKFLOWS.md` said "Auto-deploys from `main` branch" until
 * 31/08/2026 -- directly contradicting `.claude/RULES.md` rule 33 and
 * `deploy-production.yml`, which is `workflow_dispatch`-only and demands a
 * release-gate run ID plus a typed 40-character SHA.
 *
 * It went uncaught because the guard above covered two report files and a
 * checklist, and not the one file Claude Code loads automatically into every
 * session. Two independent audits on 31/08/2026 flagged it as the most likely
 * document to mislead someone mid-incident.
 */
const DEPLOY_MECHANISM_DOCS = [
  ".claude/WORKFLOWS.md",
] as const;

describe("docs that state how production ships", () => {
  it.each(DEPLOY_MECHANISM_DOCS)("%s never claims main auto-deploys", (rel) => {
    const src = readDoc(rel);
    // Matches "Auto-deploys from `main`", "auto deploy from main", etc. within
    // the production section. The Vercel PREVIEW environment genuinely does
    // auto-deploy, so this must not be a bare search for "auto-deploy".
    const production = src.slice(
      src.indexOf("### Production"),
      src.indexOf("### Preview"),
    );
    expect(production.length, `${rel}: could not isolate the Production section`)
      .toBeGreaterThan(50);
    expect(
      production,
      `${rel} claims production auto-deploys; deploy-production.yml is workflow_dispatch-only (RULES.md 33)`,
    ).not.toMatch(/auto[- ]?deploys?\s+(from|on)\s+`?main`?/i);
  });

  it.each(DEPLOY_MECHANISM_DOCS)("%s names the real promotion path", (rel) => {
    const src = readDoc(rel);
    // Naming the workflow is not enough -- the trigger is the whole point.
    expect(src).toMatch(/deploy-production\.yml/);
    expect(src).toMatch(/workflow_dispatch/);
  });

  it.each(DEPLOY_MECHANISM_DOCS)(
    "%s distinguishes building an image from deploying it",
    (rel) => {
      // The image builds on every push to main and publishes to GHCR. Someone
      // seeing those green runs can reasonably conclude production shipped.
      const src = readDoc(rel);
      expect(src).toMatch(/build-production-image\.yml/);
      expect(src).toMatch(/not deploying it|is not deploying/i);
    },
  );
});

describe("deploy-mechanism docs", () => {
  it("no operational doc claims .do/app.yaml uses branch/deploy_on_push", () => {
    for (const rel of OPERATIONAL_DOCS) {
      const src = readDoc(rel);
      expect(
        src,
        `${rel} still describes a git-source deploy; .do/app.yaml has no such key`,
      ).not.toMatch(/deploy_on_push/);
      expect(
        src,
        `${rel} still claims .do/app.yaml pins a branch`,
      ).not.toMatch(/pins\s+`?branch:\s*main`?/i);
    }
  });

  it("operational docs name the real GHCR digest-pinned mechanism", () => {
    for (const rel of OPERATIONAL_DOCS) {
      const src = readDoc(rel);
      expect(
        /ghcr|container-image spec|digest/i.test(src),
        `${rel} should describe the GHCR digest-pinned image spec`,
      ).toBe(true);
    }
  });

  it("the day-1 checklist gives the operator a redeploy sequence that works", () => {
    // The section once promised "Redeploy (10 min)" and named no command,
    // because none worked. Now one does, so the checklist has to name it --
    // both dispatches, and both required inputs, since the deploy refuses
    // without a gate receipt bound to the exact SHA.
    const src = readDoc("docs/launch-kit/05-day-1-checklist.md");
    expect(src, "checklist must name the release gate dispatch").toMatch(
      /release-gate\.yml/,
    );
    expect(src, "checklist must name the deploy dispatch").toMatch(
      /deploy-production\.yml/,
    );
    expect(src, "checklist must name the required gate run id").toMatch(
      /release_gate_run_id/,
    );
    expect(src, "checklist must name the required SHA confirmation").toMatch(
      /confirm_sha/,
    );
  });

  it("the day-1 checklist states the risk the deploy accepts", () => {
    // Activation proceeds with runner-loss reconciliation unproven. An
    // operator whose deploy run dies needs to know to go and look at the
    // provider, because nothing will have reconciled it for them.
    const src = readDoc("docs/launch-kit/05-day-1-checklist.md");
    expect(src).toMatch(/runner/i);
    // \s+ rather than a literal space: prose wraps, and this phrase already
    // straddles a line break in the checklist.
    expect(src).toMatch(/DigitalOcean\s+deployment\s+state/i);
  });
});
