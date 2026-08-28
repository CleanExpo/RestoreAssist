import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function wiringFailures(
  pilot: string,
  prHarness: string,
  release: string,
  appYaml = "",
): string[] {
  const failures: string[] = [];
  if (!/^\s{2}workflow_call:/m.test(pilot)) failures.push("workflow_call absent");
  if (!/PILOT_TESTER_EVIDENCE_BUNDLE_URL:[\s\S]*?required: true/.test(pilot)) {
    failures.push("evidence URL secret not required");
  }
  if (!/PILOT_TESTER_EVIDENCE_BUNDLE_SHA256:[\s\S]*?required: true/.test(pilot)) {
    failures.push("evidence hash secret not required");
  }
  if (!/PILOT_TESTER_JUDGE_API_KEY:[\s\S]*?required: true/.test(pilot)) {
    failures.push("server judge secret not required");
  }
  if (!/PILOT_TESTER_JUDGE_API_KEY:\s*\$\{\{\s*secrets\.PILOT_TESTER_JUDGE_API_KEY\s*\}\}/.test(pilot)) {
    failures.push("server judge secret not passed to canary");
  }
  if (!/RESTOREASSIST_AI_API_KEY:[\s\S]*?required: true/.test(pilot)) {
    failures.push("adjuster provider secret not required");
  }
  if (!/RESTOREASSIST_AI_API_KEY:\s*\$\{\{\s*secrets\.RESTOREASSIST_AI_API_KEY\s*\}\}/.test(pilot)) {
    failures.push("adjuster provider secret not passed");
  }
  if (/ANTHROPIC_API_KEY/.test(pilot)) failures.push("unused Anthropic secret exposed");
  for (const surface of [
    "app/api/pilot-tester/**",
    "lib/pilot-tester/**",
    "prisma/schema.prisma",
    "prisma/migrations/**",
    ".github/workflows/pilot-canary.yml",
    ".github/workflows/release-gate.yml",
    ".do/app.yaml",
    "package.json",
    "package-lock.json",
    ".nvmrc",
  ]) {
    if (!prHarness.includes(`- \"${surface}\"`)) {
      failures.push(`PR harness surface not watched: ${surface}`);
    }
  }
  if (!/actions\/checkout@[0-9a-f]{40}[\s\S]*?persist-credentials:\s*false/.test(prHarness)) {
    failures.push("PR checkout credentials persist");
  }
  if (!/sha256sum --check --strict/.test(pilot)) failures.push("bundle hash not checked");
  if (!/Evidence bundle contains an unsafe path/.test(pilot)) failures.push("archive paths not checked");
  if (!/needs: \[provenance, pilot-canary\]/.test(release)) failures.push("score can bypass pilot");
  if (!/uses: \.\/\.github\/workflows\/pilot-canary\.yml/.test(release)) {
    failures.push("release does not call local pilot workflow");
  }
  if (
    appYaml &&
    !/(?:"key"|key)\s*:\s*(?:"PILOT_TESTER_JUDGE_API_KEY"|PILOT_TESTER_JUDGE_API_KEY)[\s\S]*?(?:"type"|type)\s*:\s*(?:"SECRET"|SECRET)/.test(
      appYaml,
    )
  ) {
    failures.push("deployment judge secret absent");
  }
  return failures;
}

describe("release-to-pilot workflow wiring", () => {
  it("requires the immutable evidence bundle and canary before scoring", async () => {
    const root = path.resolve(process.cwd(), "../..");
    const [pilot, prHarness, release, appYaml] = await Promise.all([
      fs.readFile(path.join(root, ".github/workflows/pilot-canary.yml"), "utf8"),
      fs.readFile(
        path.join(root, ".github/workflows/pilot-harness-pr.yml"),
        "utf8",
      ),
      fs.readFile(path.join(root, ".github/workflows/release-gate.yml"), "utf8"),
      fs.readFile(path.join(root, ".do/app.yaml"), "utf8"),
    ]);
    expect(wiringFailures(pilot, prHarness, release, appYaml)).toEqual([]);

    const bypass = release.replace(
      "needs: [provenance, pilot-canary]",
      "needs: [provenance]",
    );
    expect(wiringFailures(pilot, prHarness, bypass, appYaml)).toContain(
      "score can bypass pilot",
    );

    const unhashed = pilot.replace("sha256sum --check --strict", "true");
    expect(wiringFailures(unhashed, prHarness, release, appYaml)).toContain(
      "bundle hash not checked",
    );

    const noJudge = pilot.replaceAll("PILOT_TESTER_JUDGE_API_KEY", "PILOT_TESTER_JUDGE_API_KEY_REMOVED");
    expect(wiringFailures(noJudge, prHarness, release, appYaml)).toContain(
      "server judge secret not required",
    );

    const appWithoutJudge = appYaml.replace("PILOT_TESTER_JUDGE_API_KEY", "PILOT_TESTER_JUDGE_API_KEY_REMOVED");
    expect(wiringFailures(pilot, prHarness, release, appWithoutJudge)).toContain(
      "deployment judge secret absent",
    );

    const noAdjuster = pilot.replaceAll("RESTOREASSIST_AI_API_KEY", "RESTOREASSIST_AI_API_KEY_REMOVED");
    expect(wiringFailures(noAdjuster, prHarness, release, appYaml)).toContain(
      "adjuster provider secret not required",
    );

    const stalePaths = prHarness.replace(
      '- "lib/pilot-tester/**"',
      '- "docs/**"',
    );
    expect(wiringFailures(pilot, stalePaths, release, appYaml)).toContain(
      "PR harness surface not watched: lib/pilot-tester/**",
    );

    const persistedToken = prHarness.replace(
      "persist-credentials: false",
      "persist-credentials: true",
    );
    expect(wiringFailures(pilot, persistedToken, release, appYaml)).toContain(
      "PR checkout credentials persist",
    );
  });
});
