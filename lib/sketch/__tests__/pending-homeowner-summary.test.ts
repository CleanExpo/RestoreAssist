import { describe, expect, it } from "vitest";
import { summarizePendingHomeownerCapture } from "../pending-homeowner-summary";

describe("summarizePendingHomeownerCapture", () => {
  it("counts pending floors and rooms", () => {
    const summary = summarizePendingHomeownerCapture([
      {
        floorNumber: 0,
        floorLabel: "Ground",
        pendingHomeownerCapture: {
          sketchData: {
            objects: [
              { data: { type: "room", id: "a" } },
              { data: { type: "room", id: "b" } },
            ],
          },
        },
      },
      { floorNumber: 1, floorLabel: "Level 1", pendingHomeownerCapture: null },
    ]);
    expect(summary.pendingFloors).toBe(1);
    expect(summary.pendingRoomCount).toBe(2);
    expect(summary.floorLabels).toEqual(["Ground"]);
  });
});
