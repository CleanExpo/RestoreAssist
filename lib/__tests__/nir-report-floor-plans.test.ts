import { describe, expect, it } from "vitest";
import { describeNirFloorPlans } from "../nir-report-generation";

describe("describeNirFloorPlans", () => {
  it("states explicitly when no floor plan was supplied", () => {
    expect(describeNirFloorPlans([])).toEqual([
      "No floor plan was supplied for this inspection.",
    ]);
  });

  it("distinguishes included and unavailable floor plans", () => {
    expect(
      describeNirFloorPlans([
        {
          label: "Ground Floor",
          source: "rendered_sketch",
          status: "included",
        },
        {
          label: "Uploaded Floor Plan",
          source: "uploaded_floor_plan",
          status: "unavailable",
          reason: "The stored image could not be retrieved.",
        },
      ]),
    ).toEqual([
      "Ground Floor: included as a floor-plan page.",
      "Uploaded Floor Plan: unavailable — The stored image could not be retrieved.",
    ]);
  });
});
