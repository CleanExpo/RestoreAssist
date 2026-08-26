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
 * does nothing. Worse, the real reason nothing deploys is that
 * `deploy-production.yml` is named "(BLOCKED)" and exits 1 unconditionally.
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

  it("the day-1 checklist tells the operator the deploy workflow is blocked", () => {
    // The section promised "Redeploy (10 min)" and named no command, because
    // none works. An operator following it would burn the ten minutes and
    // find nothing to run.
    const src = readDoc("docs/launch-kit/05-day-1-checklist.md");
    expect(
      /BLOCKED/.test(src),
      "checklist should state that deploy-production.yml is blocked",
    ).toBe(true);
  });
});
