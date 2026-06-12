import { describe, it, expect } from "vitest";
import { canTransition, canPublish } from "../state";

describe("testimonial state machine", () => {
  it("allows invited→recorded→consented→processing→ready→approved→published", () => {
    const path = [
      "invited",
      "recorded",
      "consented",
      "processing",
      "ready",
      "approved",
      "published",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("rejects skipping (invited→approved)", () => {
    expect(canTransition("invited", "approved")).toBe(false);
  });

  it("allows discard from any pre-publish state, not from published", () => {
    for (const s of [
      "invited",
      "recorded",
      "consented",
      "processing",
      "ready",
      "approved",
    ]) {
      expect(canTransition(s, "discarded")).toBe(true);
    }
    expect(canTransition("published", "discarded")).toBe(false);
  });

  it("rejects unknown states", () => {
    expect(canTransition("bogus", "ready")).toBe(false);
    expect(canTransition("ready", "bogus")).toBe(false);
  });

  it("two-key publish: requires approved status AND consent AND approval", () => {
    expect(
      canPublish({ status: "approved", hasConsent: true, hasApproval: true }),
    ).toBe(true);
    expect(
      canPublish({ status: "approved", hasConsent: false, hasApproval: true }),
    ).toBe(false);
    expect(
      canPublish({ status: "ready", hasConsent: true, hasApproval: true }),
    ).toBe(false);
  });
});
