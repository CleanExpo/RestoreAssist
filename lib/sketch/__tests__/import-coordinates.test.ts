import { describe, expect, it } from "vitest";
import { mapNormalizedVerticesToCanvas } from "../import-coordinates";

describe("mapNormalizedVerticesToCanvas", () => {
  it("uses the live canvas size when the viewport changes", () => {
    let width = 1200;
    let height = 820;
    const canvas = {
      getWidth: () => width,
      getHeight: () => height,
    };

    width = 800;
    height = 600;

    expect(
      mapNormalizedVerticesToCanvas(
        [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 1 },
        ],
        canvas,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 300 },
      { x: 800, y: 600 },
    ]);
  });
});
