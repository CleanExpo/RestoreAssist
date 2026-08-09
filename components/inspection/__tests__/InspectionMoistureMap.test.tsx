// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InspectionMoistureMap } from "../InspectionMoistureMap";

afterEach(cleanup);

const reading = {
  id: "reading_1",
  location: "Kitchen wall",
  surfaceType: "plasterboard",
  moistureLevel: 28,
  depth: "Surface",
  notes: null,
};

describe("InspectionMoistureMap", () => {
  it("binds the tenant-loaded inspection field in the detail page", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
      "utf8",
    );

    expect(pageSource).toMatch(
      /floorPlanImageUrl=\{inspection\.floorPlanImageUrl \?\? null\}/,
    );
  });

  it("renders the persisted inspection floor plan through the real canvas", () => {
    const floorPlanImageUrl = "https://cdn.example.test/floor-plan.png";
    const { container } = render(
      <InspectionMoistureMap
        readings={[reading]}
        floorPlanImageUrl={floorPlanImageUrl}
      />,
    );

    const canvas = screen.getByRole("img", {
      name: /moisture mapping canvas/i,
    });
    const background = container.querySelector("svg image");

    expect(canvas).toBeTruthy();
    expect(background?.getAttribute("href")).toBe(floorPlanImageUrl);
  });

  it("keeps the empty-reading state safe without mounting a canvas", () => {
    render(
      <InspectionMoistureMap
        readings={[]}
        floorPlanImageUrl="https://cdn.example.test/floor-plan.png"
      />,
    );

    expect(
      screen.getByText("No moisture readings to map — add readings first"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("img", { name: /moisture mapping canvas/i }),
    ).toBeNull();
  });
});
