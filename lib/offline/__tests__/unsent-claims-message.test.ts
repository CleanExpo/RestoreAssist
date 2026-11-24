/**
 * RA-8641 — the wording for claims kept on this device.
 *
 * Only a claim in state "queued" is ever sent again (drainOfflineClaims skips
 * every other state), so only those may be described as waiting to send. A
 * refused ("failed") or held ("needs_review") claim must be described as
 * needing attention, never as something signing in will send.
 */
import { describe, expect, it } from "vitest";
import { countClaimsByState, describeUnsentClaims } from "@/lib/offline/unsent-claims-message";

const counts = (queued: number, failed: number, needsReview: number) => ({ queued, failed, needsReview });
const PROMISE = /sign in and send|waiting to send/i;

describe("describeUnsentClaims", () => {
  it("zero claims: the login page says nothing; the offline page says none are waiting", () => {
    expect(describeUnsentClaims(counts(0, 0, 0), "signed-out")).toBeNull();
    expect(describeUnsentClaims(counts(0, 0, 0), "signed-in")).toBe("No claims waiting to send.");
  });

  it("only queued: described as waiting to send", () => {
    expect(describeUnsentClaims(counts(1, 0, 0), "signed-in")).toBe("1 claim waiting to send.");
    expect(describeUnsentClaims(counts(2, 0, 0), "signed-in")).toBe("2 claims waiting to send.");
    expect(describeUnsentClaims(counts(1, 0, 0), "signed-out")).toBe(
      "You have 1 claim not yet sent. It stays on this device until you sign in and send it.",
    );
    expect(describeUnsentClaims(counts(3, 0, 0), "signed-out")).toBe(
      "You have 3 claims not yet sent. They stay on this device until you sign in and send them.",
    );
  });

  it("only failed: says it could not be sent and makes no promise to send it", () => {
    for (const audience of ["signed-in", "signed-out"] as const) {
      const one = describeUnsentClaims(counts(0, 1, 0), audience);
      expect(one).toBe("1 claim could not be sent and needs attention. It will not be sent automatically.");
      expect(one).not.toMatch(PROMISE);
      expect(describeUnsentClaims(counts(0, 2, 0), audience)).toBe(
        "2 claims could not be sent and need attention. They will not be sent automatically.",
      );
    }
  });

  it("only needs_review: says it may already have been sent and makes no promise to send it", () => {
    for (const audience of ["signed-in", "signed-out"] as const) {
      const one = describeUnsentClaims(counts(0, 0, 1), audience);
      expect(one).toBe(
        "1 claim may or may not have been sent and needs checking. It will not be sent automatically.",
      );
      expect(one).not.toMatch(PROMISE);
      expect(describeUnsentClaims(counts(0, 0, 2), audience)).toBe(
        "2 claims may or may not have been sent and need checking. They will not be sent automatically.",
      );
    }
  });

  it("a mix: each state is counted separately and only queued claims are waiting to send", () => {
    expect(describeUnsentClaims(counts(2, 1, 1), "signed-in")).toBe(
      "2 claims waiting to send. " +
        "1 claim could not be sent and needs attention. It will not be sent automatically. " +
        "1 claim may or may not have been sent and needs checking. It will not be sent automatically.",
    );
    expect(describeUnsentClaims(counts(1, 2, 0), "signed-out")).toBe(
      "You have 1 claim not yet sent. It stays on this device until you sign in and send it. " +
        "2 claims could not be sent and need attention. They will not be sent automatically.",
    );
  });

  it("the login wording is a count only: no claim detail can reach it", () => {
    const text = describeUnsentClaims(counts(1, 1, 1), "signed-out") ?? "";
    expect(text).not.toMatch(/street|postcode|note|photo/i);
  });
});

describe("countClaimsByState", () => {
  it("counts each state; an unrecognised state is never counted as waiting to send", () => {
    expect(
      countClaimsByState([
        { state: "queued" },
        { state: "queued" },
        { state: "failed" },
        { state: "needs_review" },
        { state: "corrupt" as never },
      ]),
    ).toEqual({ queued: 2, failed: 1, needsReview: 2 });
    expect(countClaimsByState([])).toEqual({ queued: 0, failed: 0, needsReview: 0 });
  });
});
