import { describe, it, expect } from "vitest";
import { createRenderFreshnessTracker } from "../render-freshness";

describe("createRenderFreshnessTracker", () => {
  it("starts clean — nothing to flush on leave", () => {
    const t = createRenderFreshnessTracker();
    expect(t.shouldFlushOnLeave()).toBe(false);
  });

  it("marks a flush needed once an edit happens", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    expect(t.shouldFlushOnLeave()).toBe(true);
  });

  it("clears the flush-needed state after a render is captured", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    t.markRendered();
    expect(t.shouldFlushOnLeave()).toBe(false);
  });

  it("needs a flush again if edits arrive after the last render", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    t.markRendered();
    t.markEdited();
    expect(t.shouldFlushOnLeave()).toBe(true);
  });
});
