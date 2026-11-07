import { describe, expect, it } from "vitest";
import {
  captureFloorsHaveDrawableContent,
  sketchDataForCaptureEditor,
} from "../capture-floor-hydration";

describe("capture-floor-hydration", () => {
  it("prefers pending sketch over authoritative", () => {
    const pending = { objects: [{ data: { type: "room", id: "p" } }] };
    const authoritative = { objects: [{ data: { type: "room", id: "a" } }] };
    expect(
      sketchDataForCaptureEditor({
        floorNumber: 0,
        floorLabel: "G",
        sketchData: authoritative,
        pendingHomeownerCapture: { sketchData: pending },
      })?.objects,
    ).toEqual(pending.objects);
  });

  it("detects drawable content", () => {
    expect(
      captureFloorsHaveDrawableContent([
        {
          floorNumber: 0,
          floorLabel: "G",
          pendingHomeownerCapture: {
            sketchData: { objects: [{ data: { type: "room" } }] },
          },
        },
      ]),
    ).toBe(true);
  });
});
