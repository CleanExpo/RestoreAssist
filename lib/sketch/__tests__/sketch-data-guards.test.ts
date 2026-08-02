import { describe, expect, it } from "vitest";
import {
  isEmptySketchData,
  pickSketchDataForSave,
  sketchObjectCount,
} from "../sketch-data-guards";

describe("sketch-data-guards", () => {
  it("counts objects and detects empty blobs", () => {
    expect(sketchObjectCount({ objects: [{ type: "path" }] })).toBe(1);
    expect(isEmptySketchData({ objects: [] })).toBe(true);
    expect(isEmptySketchData({ objects: [{ type: "path" }] })).toBe(false);
    expect(
      isEmptySketchData({ backgroundImage: { src: "x" }, objects: [] }),
    ).toBe(false);
  });

  it("never lets an empty live read clobber a non-empty snapshot", () => {
    const snapshot = { objects: [{ type: "rect" }], version: "6" };
    const emptyLive = { objects: [], version: "6" };
    expect(pickSketchDataForSave(emptyLive, snapshot)).toEqual(snapshot);
    expect(pickSketchDataForSave(snapshot, emptyLive)).toEqual(snapshot);
  });
});
