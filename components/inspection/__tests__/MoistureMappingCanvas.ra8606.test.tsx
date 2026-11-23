// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";

afterEach(() => {
  cleanup();
});

// RA-8606: the Equipment tab let a technician place drying equipment that no
// screen saved, so it vanished on reload. RA-8605: the Upload Floor Plan button
// showed on the job page, which has no upload handler. The canvas must offer an
// editing control only when its owner passed the matching save handler.
const readings = [
  {
    id: "r1",
    location: "Kitchen wall",
    surfaceType: "drywall",
    moistureLevel: 42,
    depth: "Surface",
    notes: null,
  },
];

describe("MoistureMappingCanvas save-handler gating (RA-8606)", () => {
  it("offers no way to place equipment when no onEquipmentPointsChange is passed", () => {
    render(<MoistureMappingCanvas readings={readings} />);
    expect(
      screen.queryByRole("button", { name: /^equipment$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Place Equipment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /air mover/i })).toBeNull();
  });

  it("shows saved equipment view-only when there is no save handler", () => {
    render(
      <MoistureMappingCanvas
        readings={readings}
        initialEquipmentPoints={[
          { id: "eq-1", x: 100, y: 100, equipmentType: "air_mover" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^equipment$/i }));
    expect(screen.queryByText("Place Equipment")).not.toBeInTheDocument();
    expect(screen.getByText(/total units/i)).toBeInTheDocument();
  });

  it("offers the equipment palette when onEquipmentPointsChange is passed", () => {
    render(
      <MoistureMappingCanvas
        readings={readings}
        onEquipmentPointsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^equipment$/i }));
    expect(screen.getByText("Place Equipment")).toBeInTheDocument();
  });

  it("hides Upload Floor Plan when no onImageUpload is passed", () => {
    render(<MoistureMappingCanvas readings={readings} />);
    expect(screen.queryByText(/upload floor plan/i)).not.toBeInTheDocument();
  });

  it("shows Upload Floor Plan when onImageUpload is passed", () => {
    render(
      <MoistureMappingCanvas
        readings={readings}
        onImageUpload={vi.fn().mockResolvedValue("https://example.test/p.png")}
      />,
    );
    expect(screen.getByText(/upload floor plan/i)).toBeInTheDocument();
  });
});
