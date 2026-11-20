import { describe, expect, it } from "vitest";
import { summarizeInboxStalls } from "../inbox-stall-summary";
import type { CompletenessInboxRow } from "../org-inbox";

function row(partial: Partial<CompletenessInboxRow>): CompletenessInboxRow {
  return {
    inspectionId: "i1",
    inspectionNumber: "JOB-1",
    propertyAddress: "1 Test St",
    status: "DRAFT",
    completionPercent: 40,
    blocking: ["photos"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    daysIdle: 0,
    ...partial,
  };
}

describe("summarizeInboxStalls", () => {
  it("counts blockers and ageing bands", () => {
    const summary = summarizeInboxStalls([
      row({ blocking: ["photos", "baseline"], daysIdle: 1 }),
      row({ inspectionId: "i2", blocking: ["photos"], daysIdle: 8 }),
    ]);
    expect(summary.totalStalled).toBe(2);
    expect(summary.byBlocker.photos).toBe(2);
    expect(summary.byBlocker.baseline).toBe(1);
    expect(summary.byAge.stale).toBe(1);
    expect(summary.byAge.fresh).toBe(1);
    expect(summary.maxDaysIdle).toBe(8);
  });
});