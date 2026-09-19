// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDamageMarker } from "@/lib/sketch/damage-markers";
import { SketchDamageMarkerLayer } from "../SketchDamageMarkerLayer";

describe("SketchDamageMarkerLayer", () => {
  it("renders a seeded marker from the library with IICRC aria copy", () => {
    const marker = createDamageMarker({
      type: "water_cat3",
      severity: "high",
      room_label: "Kitchen",
      notes: "Black water at kitchen sink",
      x: 150,
      y: 200,
      width: 400,
      height: 500,
    });
    render(
      <SketchDamageMarkerLayer
        markers={[marker]}
        onChange={vi.fn()}
        active={false}
        selectedType="water_cat3"
        selectedSeverity="high"
        width={400}
        height={500}
      />,
    );
    const pin = screen.getByTestId("sketch-damage-marker");
    expect(pin).toHaveAttribute("data-marker-type", "water_cat3");
    expect(
      screen.getByRole("button", { name: /Water Cat 3.*Kitchen/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("places a marker in scene space using overlayVpt (not screen space)", () => {
    const onChange = vi.fn();
    render(
      <SketchDamageMarkerLayer
        markers={[]}
        onChange={onChange}
        active
        selectedType="mould"
        selectedSeverity="moderate"
        overlayViewport={{ zoom: 2, panX: 40, panY: -20 }}
        resolveRoomLabel={() => "Ensuite"}
        width={800}
        height={600}
      />,
    );
    const layer = screen.getByTestId("sketch-damage-marker-layer");
    expect(layer).toHaveAttribute("data-overlay-zoom", "2");
    expect(layer).toHaveAttribute("data-overlay-pan-x", "40");
    expect(layer).toHaveAttribute("data-overlay-pan-y", "-20");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // Scene (200, 160) at zoom 2 / pan (40, -20) → screen (440, 300)
    fireEvent.click(layer, { clientX: 440, clientY: 300 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Array<{
      type: string;
      room_label: string;
      x: number;
      y: number;
      nx?: number;
    }>;
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe("mould");
    expect(next[0].room_label).toBe("Ensuite");
    expect(next[0].x).toBeCloseTo(200);
    expect(next[0].y).toBeCloseTo(160);
    expect(next[0].nx).toBeCloseTo(200 / 800);
  });

  it("does not place on click when the layer is inactive", () => {
    const onChange = vi.fn();
    render(
      <SketchDamageMarkerLayer
        markers={[]}
        onChange={onChange}
        active={false}
        selectedType="fire"
        selectedSeverity="low"
        width={400}
        height={400}
      />,
    );
    fireEvent.click(screen.getByTestId("sketch-damage-marker-layer"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
