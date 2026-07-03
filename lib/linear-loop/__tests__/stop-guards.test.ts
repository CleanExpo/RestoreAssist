import { describe, expect, it } from "vitest";
import { StopGuardTracker } from "@/lib/linear-loop/stop-guards";

describe("StopGuardTracker", () => {
  it("does not trip on a single CI failure for an issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(false);
  });

  it("trips after 2 consecutive CI failures on the same issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/RA-100/);
    expect(tracker.getTripReason()).toMatch(/2 consecutive CI failures/i);
  });

  it("does not trip on 2 CI failures across two different issues", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    const result = tracker.recordCiFailure("RA-200");
    expect(result.tripped).toBe(false);
  });

  it("resets an issue's CI failure count once recordActionableCycle runs for a new issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    tracker.recordActionableCycle();
    // A fresh failure on the same issue id in a later cycle starts back at 1, not 3.
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(false);
  });

  it("trips immediately on recordOwnerGated", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    const result = tracker.recordOwnerGated();
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/owner-gated/i);
  });

  it("trips when recordSpend crosses the configured daily budget ceiling", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 5 });
    tracker.recordSpend(3);
    const result = tracker.recordSpend(2.5);
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/budget ceiling/i);
  });

  it("does not trip when cumulative spend stays under the configured ceiling", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 5 });
    tracker.recordSpend(1);
    const result = tracker.recordSpend(1);
    expect(result.tripped).toBe(false);
  });

  it("uses the ceiling passed at construction, not a hardcoded default", () => {
    const cheapTracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 1 });
    const result = cheapTracker.recordSpend(1.5);
    expect(result.tripped).toBe(true);

    const generousTracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 1000 });
    const result2 = generousTracker.recordSpend(1.5);
    expect(result2.tripped).toBe(false);
  });

  it("does not trip on 1 or 2 consecutive unactionable skips", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(false);
  });

  it("trips on the 3rd consecutive unactionable skip", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/3.*consecutive.*skip/i);
  });

  it("resets the consecutive-skip counter when an actionable cycle runs", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    tracker.recordUnactionableSkip();
    tracker.recordActionableCycle();
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(false);
  });

  it("getTripReason returns null when nothing has tripped", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    expect(tracker.getTripReason()).toBeNull();
  });
});
