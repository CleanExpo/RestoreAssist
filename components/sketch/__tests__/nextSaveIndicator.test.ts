import { describe, expect, it } from "vitest";
import { nextSaveIndicator } from "../SketchEditorV2";

// Regression guard for STORM #3: a failed capture-mode save used to fall through
// and show "Saved" (silent homeowner data loss). The indicator must only mark
// saved on a real online success, and must flag a capture failure otherwise.
describe("nextSaveIndicator", () => {
  it("marks saved when at least one floor saved online", () => {
    expect(nextSaveIndicator({ succeededOnline: 1, captureFailedThisTick: false }))
      .toEqual({ markSaved: true, captureFailed: false });
  });

  it("does NOT mark saved and flags failure when a capture save failed with nothing saved", () => {
    expect(nextSaveIndicator({ succeededOnline: 0, captureFailedThisTick: true }))
      .toEqual({ markSaved: false, captureFailed: true });
  });

  it("does not flag a capture failure when something still saved online (partial)", () => {
    expect(nextSaveIndicator({ succeededOnline: 2, captureFailedThisTick: true }))
      .toEqual({ markSaved: true, captureFailed: false });
  });

  it("authed all-queued tick (nothing online, no capture failure) is neither saved nor failed", () => {
    expect(nextSaveIndicator({ succeededOnline: 0, captureFailedThisTick: false }))
      .toEqual({ markSaved: false, captureFailed: false });
  });
});
