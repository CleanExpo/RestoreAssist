// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SketchMeasurementChecklist } from "../SketchMeasurementChecklist";

describe("SketchMeasurementChecklist", () => {
  it("renders nothing when empty", () => {
    const { container } = render(
      <SketchMeasurementChecklist inspectionId="i1" rooms={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists rooms with open links", () => {
    render(
      <SketchMeasurementChecklist
        inspectionId="insp_1"
        rooms={[
          {
            id: "r1",
            label: "Kitchen",
            floorLabel: "Ground",
            reason: "homeowner",
          },
        ]}
      />,
    );
    expect(screen.getByRole("region")).toHaveTextContent(/Kitchen/);
    expect(screen.getByRole("link", { name: /Open room/i })).toHaveAttribute(
      "href",
      expect.stringContaining("sketchRoomId=r1"),
    );
  });
});
