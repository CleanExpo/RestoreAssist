import { describe, it, expect } from "vitest";
import {
  classifyDeploymentFreshness,
  FRESH,
  STALE,
  UNREACHABLE,
  UNREPORTED,
  // @ts-expect-error -- plain .mjs helper, no type declarations by design
} from "../classify-deployment-freshness.mjs";

const EXPECTED = "d774334b916acbc6f9fd65cea5bdcbb32e9cd8d7";
const URL = "https://restoreassist.app/api/health";

/** A probe that would classify FRESH; override one field per case. */
function probe(overrides: Record<string, unknown> = {}) {
  return {
    expectedSha: EXPECTED,
    reached: true,
    requestedUrl: URL,
    finalUrl: URL,
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: { deploymentSha: EXPECTED },
    ...overrides,
  };
}

describe("classifyDeploymentFreshness", () => {
  it("is FRESH when production serves the expected revision", () => {
    expect(classifyDeploymentFreshness(probe()).verdict).toBe(FRESH);
  });

  it("is FRESH regardless of SHA casing", () => {
    const body = { deploymentSha: EXPECTED.toUpperCase() };
    expect(classifyDeploymentFreshness(probe({ body })).verdict).toBe(FRESH);
  });

  describe("UNREACHABLE — production is actually broken right now", () => {
    it("when the endpoint could not be reached", () => {
      const result = classifyDeploymentFreshness(probe({ reached: false }));
      expect(result.verdict).toBe(UNREACHABLE);
      expect(result.reason).toMatch(/could not be reached/);
    });

    it("when the request was redirected elsewhere", () => {
      const finalUrl = "https://example.test/login";
      const result = classifyDeploymentFreshness(probe({ finalUrl }));
      expect(result.verdict).toBe(UNREACHABLE);
      expect(result.reason).toMatch(/redirected/);
    });

    it.each([500, 503, 404, 301])("when health returns HTTP %i", (status) => {
      expect(classifyDeploymentFreshness(probe({ status })).verdict).toBe(
        UNREACHABLE,
      );
    });

    it("when health returns non-JSON", () => {
      const contentType = "text/html";
      expect(classifyDeploymentFreshness(probe({ contentType })).verdict).toBe(
        UNREACHABLE,
      );
    });

    it("when health returns no content-type at all", () => {
      const contentType = undefined;
      expect(classifyDeploymentFreshness(probe({ contentType })).verdict).toBe(
        UNREACHABLE,
      );
    });

    it("when the body is not a JSON object", () => {
      expect(classifyDeploymentFreshness(probe({ body: "ok" })).verdict).toBe(
        UNREACHABLE,
      );
    });
  });

  describe("UNREPORTED — production does not say which build it is", () => {
    // WHY THESE MOVED OUT OF STALE, 2026-09-06.
    //
    // The old reading was "an absent deploymentSha means a build predating the
    // field, which is exactly the un-promoted case". That held on Vercel, where
    // VERCEL_GIT_COMMIT_SHA is always injected, so absence could only mean age.
    //
    // Production runs on DigitalOcean, and app/api/health/route.ts computes the
    // field as `VERCEL_GIT_COMMIT_SHA || GIT_SHA || null`. DigitalOcean sets
    // neither unless the app spec declares it, so the key is absent on EVERY
    // build however fresh. Measured 2026-09-06: the ACTIVE DigitalOcean
    // deployment was `commit 9b8285e pushed to main` — current main, deployed
    // 05:51Z — and /api/health still reported deploymentSha: null.
    //
    // So the verdict was permanently STALE, which is the collapse this module's
    // own docstring exists to prevent: a genuinely un-promoted production is
    // indistinguishable from the normal state. Absent is not old. It is
    // unverifiable, and unverifiable is its own answer.
    it("when deploymentSha is absent", () => {
      const body = { status: "ok", uptime: 1234 };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.verdict).toBe(UNREPORTED);
      expect(result.reason).toMatch(/no deploymentSha/);
    });

    it("names the remedy rather than asserting an age it cannot know", () => {
      const body = { status: "ok" };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.reason).not.toMatch(/older|predates/);
      expect(result.reason).toMatch(/GIT_SHA/);
    });

    it("when deploymentSha is explicitly null", () => {
      const body = { deploymentSha: null };
      expect(classifyDeploymentFreshness(probe({ body })).verdict).toBe(
        UNREPORTED,
      );
    });

    it("when deploymentSha is malformed — it reported something unusable", () => {
      const body = { deploymentSha: "not-a-sha" };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.verdict).toBe(UNREPORTED);
      expect(result.reason).toMatch(/malformed/);
    });
  });

  describe("STALE — production is up, and names a DIFFERENT revision", () => {

    it("when a different revision is serving, and names both", () => {
      const body = {
        deploymentSha: "4cef0c408a85152163f6877458defe15c39a7485",
      };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.verdict).toBe(STALE);
      expect(result.reason).toContain("4cef0c4");
      expect(result.reason).toContain("d774334");
    });
  });

  it("refuses to classify without a usable expected SHA", () => {
    // A missing EXPECTED_DEPLOYMENT_SHA must never read as FRESH.
    for (const expectedSha of [undefined, "", "abc", null]) {
      expect(() => classifyDeploymentFreshness(probe({ expectedSha }))).toThrow(
        /40-character commit SHA/,
      );
    }
  });
});
