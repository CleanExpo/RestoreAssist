import { describe, it, expect } from "vitest";
import {
  createRenderFreshnessTracker,
  didForcedRenderSaveSucceed,
} from "../render-freshness";

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

  it("keeps a failed forced render dirty so leave-time flush retries it", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    t.recordRenderAttempt(
      didForcedRenderSaveSucceed([
        { vectorPersisted: true, renderUploaded: false },
      ]),
    );
    expect(t.shouldFlushOnLeave()).toBe(true);

    t.recordRenderAttempt(
      didForcedRenderSaveSucceed([
        { vectorPersisted: true, renderUploaded: true },
      ]),
    );
    expect(t.shouldFlushOnLeave()).toBe(false);
  });

  it("clears the flush-needed state only after a successful forced render", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    t.recordRenderAttempt(
      didForcedRenderSaveSucceed([
        { vectorPersisted: true, renderUploaded: true },
        { vectorPersisted: true, renderUploaded: true },
      ]),
    );
    expect(t.shouldFlushOnLeave()).toBe(false);
  });

  it("does not treat an uploaded render as fresh until its vector save persists", () => {
    expect(
      didForcedRenderSaveSucceed([
        { vectorPersisted: false, renderUploaded: true },
      ]),
    ).toBe(false);
  });

  it("needs a flush again if edits arrive after the last successful render", () => {
    const t = createRenderFreshnessTracker();
    t.markEdited();
    t.recordRenderAttempt(true);
    t.markEdited();
    expect(t.shouldFlushOnLeave()).toBe(true);
  });
});
