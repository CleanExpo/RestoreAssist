// @vitest-environment jsdom
/**
 * RA-8241 — captureInitialFloors prop contract.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/sketch/SketchCanvas", () => ({
  SketchCanvas: () => null,
}));

describe("SketchEditorV2 capture hydration props", () => {
  it("accepts captureInitialFloors on the public props type", async () => {
    const mod = await import("../SketchEditorV2");
    expect(mod.SketchEditorV2).toBeDefined();
    const props: import("../SketchEditorV2").SketchEditorV2Props = {
      captureToken: "tok",
      mode: "guided",
      captureInitialFloors: [
        {
          floorNumber: 0,
          floorLabel: "Ground",
          pendingHomeownerCapture: { sketchData: { objects: [] } },
        },
      ],
    };
    expect(props.captureInitialFloors).toHaveLength(1);
  });
});
