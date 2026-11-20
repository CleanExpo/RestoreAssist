/**
 * RA-8388 - what the capture screen says about a 2xx from POST /evidence.
 *
 * The page's use of these is tested by rendering the page
 * (app/dashboard/inspections/[id]/capture/__tests__/page.refusals.ra8388.test.tsx).
 * These pin the rule itself at its edges, where a render test is a slow way
 * to ask a small question.
 */
import { describe, expect, it } from "vitest";

import {
  describeSavedEvidence,
  withSavedEvidence,
} from "../submit-metadata-evidence";

describe("the words for a saved item", () => {
  it("an ordinary save is captured", () => {
    expect(describeSavedEvidence("Damage Photo", { evidenceItem: {} })).toEqual({
      tone: "success",
      message: "Damage Photo captured",
    });
  });

  it("says so in plain words when the item does not count, and is not a success notice", () => {
    expect(
      describeSavedEvidence("Damage Photo", { countsTowardSubmission: false }),
    ).toEqual({
      tone: "notice",
      message:
        "Damage Photo saved, but it does not count toward the photos this job needs.",
    });
  });

  it("only an explicit false means not counted", () => {
    for (const body of [
      {},
      { countsTowardSubmission: true },
      { countsTowardSubmission: undefined },
      { countsTowardSubmission: null },
      { countsTowardSubmission: "false" },
      { countsTowardSubmission: 0 },
      null,
      undefined,
      "text",
    ]) {
      expect(describeSavedEvidence("Damage Photo", body).message).toBe(
        "Damage Photo captured",
      );
    }
  });

  it("the duplicate answer is saved, once: not an error and not a second reading", () => {
    const notice = describeSavedEvidence("Moisture Reading", {
      alreadyRecorded: true,
    });
    expect(notice.tone).toBe("success");
    expect(notice.message).toBe(
      "Moisture Reading was already saved. It is on the job once.",
    );
  });

  it("not counted is said even when the answer is also a duplicate", () => {
    expect(
      describeSavedEvidence("Damage Photo", {
        alreadyRecorded: true,
        countsTowardSubmission: false,
      }).tone,
    ).toBe("notice");
  });
});

describe("the evidence list holds a saved item once", () => {
  const a = { id: "a", n: 1 };
  const b = { id: "b", n: 2 };

  it("puts a new item first", () => {
    expect(withSavedEvidence([a], b)).toEqual([b, a]);
  });

  it("does not add a second copy of an item the list already holds", () => {
    const fresh = { id: "a", n: 9 };
    expect(withSavedEvidence([b, a], fresh)).toEqual([fresh, b]);
  });

  it("leaves the list it was given untouched", () => {
    const list = [a];
    withSavedEvidence(list, b);
    expect(list).toEqual([a]);
  });
});
