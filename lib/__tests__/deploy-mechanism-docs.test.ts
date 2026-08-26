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
