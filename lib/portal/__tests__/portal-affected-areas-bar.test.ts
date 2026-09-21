import { describe, it, expect } from "vitest";
import { portalMustShowEveryAffectedArea } from "./portal-affected-areas-bar";

describe("RA-7573 Critic/Scout bar — can go red", () => {
  it("fails when a DB row is dropped (silent omit)", () => {
    expect(() =>
      portalMustShowEveryAffectedArea({
        dbCount: 1,
        renderedCount: 0,
        headingShown: false,
      }),
    ).toThrow(/silent omit/);
  });

  it("fails when the heading is omitted while the job has areas", () => {
    expect(() =>
      portalMustShowEveryAffectedArea({
        dbCount: 2,
        renderedCount: 2,
        headingShown: false,
      }),
    ).toThrow(/omitted the Affected Areas heading/);
  });

  it("fails when the heading appears while the job has none", () => {
    expect(() =>
      portalMustShowEveryAffectedArea({
        dbCount: 0,
        renderedCount: 0,
        headingShown: true,
      }),
    ).toThrow(/job has none/);
  });

  it("passes only when count matches and heading tracks emptiness", () => {
    expect(() =>
      portalMustShowEveryAffectedArea({
        dbCount: 0,
        renderedCount: 0,
        headingShown: false,
      }),
    ).not.toThrow();
    expect(() =>
      portalMustShowEveryAffectedArea({
        dbCount: 3,
        renderedCount: 3,
        headingShown: true,
      }),
    ).not.toThrow();
  });
});
