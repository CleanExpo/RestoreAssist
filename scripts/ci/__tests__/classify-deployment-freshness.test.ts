import { describe, it, expect } from "vitest";
import {
  classifyDeploymentFreshness,
  FRESH,
  STALE,
  UNREACHABLE,
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

  describe("STALE — production is up, just not this revision", () => {
    it("when deploymentSha is absent, the un-promoted-build case", () => {
      // This is the exact shape production served through the RA smoke outage:
      // a healthy 200 from a build predating the deploymentSha field.
      const body = { status: "ok", uptime: 1234 };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.verdict).toBe(STALE);
      expect(result.reason).toMatch(/no deploymentSha/);
    });

    it("when deploymentSha is explicitly null", () => {
      const body = { deploymentSha: null };
      expect(classifyDeploymentFreshness(probe({ body })).verdict).toBe(STALE);
    });

    it("when deploymentSha is malformed", () => {
      const body = { deploymentSha: "not-a-sha" };
      const result = classifyDeploymentFreshness(probe({ body }));
      expect(result.verdict).toBe(STALE);
      expect(result.reason).toMatch(/malformed/);
    });

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
