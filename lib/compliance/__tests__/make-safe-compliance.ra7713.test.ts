import { describe, expect, it } from "vitest";
import {
  MAKE_SAFE_SEED_NOTE,
  makeSafeCompliance,
} from "@/lib/compliance/make-safe-compliance";

// RA-7713 part 10: PASS must mean something was assessed and done.
const na = { applicable: false, completed: false, notes: null };
const seeded = { applicable: false, completed: false, notes: MAKE_SAFE_SEED_NOTE };
const done = { applicable: true, completed: true, notes: null };
const open = { applicable: true, completed: false, notes: null };

describe("makeSafeCompliance", () => {
  it("is NOT_ASSESSED when there are no items", () => {
    expect(makeSafeCompliance([])).toBe("NOT_ASSESSED");
  });

  it("is NOT_ASSESSED for the intake seed (every item N/A with the seed note)", () => {
    expect(makeSafeCompliance([seeded, seeded, seeded, seeded, seeded])).toBe(
      "NOT_ASSESSED",
    );
  });

  it("is NOT_ASSESSED when every item is N/A, even without the seed note", () => {
    expect(makeSafeCompliance([na, na, na])).toBe("NOT_ASSESSED");
  });

  it("is PASS when at least one item is applicable and every applicable item is complete", () => {
    expect(makeSafeCompliance([done, na, seeded])).toBe("PASS");
    expect(makeSafeCompliance([done, done])).toBe("PASS");
  });

  it("is FAIL when any applicable item is not complete", () => {
    expect(makeSafeCompliance([done, open])).toBe("FAIL");
    expect(makeSafeCompliance([open, na])).toBe("FAIL");
  });

  it("ignores a completed flag on an N/A item (it cannot carry a PASS)", () => {
    expect(
      makeSafeCompliance([{ applicable: false, completed: true, notes: null }]),
    ).toBe("NOT_ASSESSED");
  });
});
