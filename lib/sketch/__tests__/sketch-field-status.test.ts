import { describe, expect, it } from "vitest";
import {
  isSketchFieldComplete,
  readSketchFieldMeta,
  withSketchFieldComplete,
  SKETCH_META_KEY,
} from "../sketch-field-status";

describe("sketch field-complete status", () => {
  it("defaults to incomplete", () => {
    expect(isSketchFieldComplete({ objects: [] })).toBe(false);
    expect(readSketchFieldMeta(null)).toEqual({});
  });

  it("marks complete without wiping Fabric objects", () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    const next = withSketchFieldComplete(
      { objects: [{ type: "rect" }], version: "6" },
      true,
      now,
    );
    expect(next.objects).toEqual([{ type: "rect" }]);
    expect(next.version).toBe("6");
    expect(isSketchFieldComplete(next)).toBe(true);
    expect(readSketchFieldMeta(next).fieldCompletedAt).toBe(now.toISOString());
  });

  it("clears completedAt when unmarked", () => {
    const marked = withSketchFieldComplete({ objects: [1] }, true);
    const unmarked = withSketchFieldComplete(marked, false);
    expect(isSketchFieldComplete(unmarked)).toBe(false);
    expect(readSketchFieldMeta(unmarked).fieldCompletedAt).toBeNull();
    expect((unmarked[SKETCH_META_KEY] as { fieldComplete: boolean }).fieldComplete).toBe(
      false,
    );
  });
});
