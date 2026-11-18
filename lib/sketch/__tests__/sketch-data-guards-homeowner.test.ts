import { describe, expect, it } from "vitest";
import { sketchHasUnconfirmedRooms } from "../sketch-data-guards";

describe("sketchHasUnconfirmedRooms — homeowner", () => {
  it("flags promoted homeowner underlay rooms", () => {
    expect(
      sketchHasUnconfirmedRooms({
        objects: [
          {
            data: {
              type: "room",
              provenance: "underlay_reference",
              captureAdapter: "homeowner",
            },
          },
        ],
      }),
    ).toBe(true);
  });
});
