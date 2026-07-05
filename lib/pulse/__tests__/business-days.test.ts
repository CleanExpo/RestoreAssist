import { describe, it, expect } from "vitest";
import { countBusinessDaysBetween } from "../business-days";

// 2026-07-06 is a Monday; 2026-07-10 is the same week's Friday;
// 2026-07-13 is the following Monday; 2026-08-03 is exactly 4 weeks
// (28 calendar days) later — also a Monday.
const MONDAY = new Date("2026-07-06T00:00:00Z");
const SAME_WEEK_FRIDAY = new Date("2026-07-10T00:00:00Z");
const FOLLOWING_MONDAY = new Date("2026-07-13T00:00:00Z");
const FOUR_WEEKS_LATER_MONDAY = new Date("2026-08-03T00:00:00Z");
const ONE_DAY_SHORT_OF_FOUR_WEEKS = new Date("2026-08-02T00:00:00Z"); // Sunday

describe("countBusinessDaysBetween", () => {
  it("returns 0 for the same date", () => {
    expect(countBusinessDaysBetween(MONDAY, MONDAY)).toBe(0);
  });

  it("returns 0 when end precedes start", () => {
    expect(countBusinessDaysBetween(SAME_WEEK_FRIDAY, MONDAY)).toBe(0);
  });

  it("counts weekdays within a single working week", () => {
    // Tue, Wed, Thu, Fri = 4
    expect(countBusinessDaysBetween(MONDAY, SAME_WEEK_FRIDAY)).toBe(4);
  });

  it("excludes the weekend when the span crosses one", () => {
    // Mon -> next Mon (7 calendar days): Tue,Wed,Thu,Fri,(Sat,Sun skipped),Mon = 5
    expect(countBusinessDaysBetween(MONDAY, FOLLOWING_MONDAY)).toBe(5);
  });

  it("counts only the Monday across a weekend-only span", () => {
    // Fri -> Mon (3 calendar days): only the Monday is a business day = 1
    expect(countBusinessDaysBetween(SAME_WEEK_FRIDAY, FOLLOWING_MONDAY)).toBe(
      1,
    );
  });

  it("reaches exactly 20 business days after 4 full weeks", () => {
    expect(
      countBusinessDaysBetween(MONDAY, FOUR_WEEKS_LATER_MONDAY),
    ).toBe(20);
  });

  it("sits at 19 business days one calendar day short of the 4-week boundary", () => {
    expect(
      countBusinessDaysBetween(MONDAY, ONE_DAY_SHORT_OF_FOUR_WEEKS),
    ).toBe(19);
  });
});
