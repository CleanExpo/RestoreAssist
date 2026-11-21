// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SketchInvestigationLayer } from "@/components/sketch/SketchInvestigationLayer";
import { buildInvestigationOverlay } from "@/lib/sketch/investigation-overlay";

function overlay() {
  return buildInvestigationOverlay({
    width: 1000,
    height: 800,
    moisturePins: [
      { id: "p1", x: 100, y: 100, wme: 28, material: "timber", iicrClass: 3 },
    ],
    damageMarkers: [
      {
        id: "m1",
        type: "water_cat2",
        severity: "high",
        room_label: "Laundry",
        x: 400,
        y: 300,
        notes: "Looks safe now",
      },
    ],
    evidencePins: [],
    resolveRoomLabel: () => "Laundry",
  });
}

describe("SketchInvestigationLayer", () => {
  it("renders each observation at its viewport-mapped position", () => {
    render(
      <SketchInvestigationLayer
        overlay={overlay()}
        overlayViewport={{ zoom: 2, panX: 10, panY: 20 }}
      />,
    );
    const items = screen.getAllByTestId("investigation-observation");
    expect(items).toHaveLength(2);
    expect(items[0].style.left).toBe("210px");
    expect(items[0].style.top).toBe("220px");
    expect(items[0].getAttribute("aria-label")).toContain("WME 28 % (Observed)");
    expect(items[0].getAttribute("aria-label")).toContain(
      "Moisture class Class 3 (Calculated)",
    );
  });

  it("is read-only on the plan: the layer passes pointer events through", () => {
    render(<SketchInvestigationLayer overlay={overlay()} />);
    expect(
      screen.getByTestId("sketch-investigation-layer").className,
    ).toContain("pointer-events-none");
  });

  it("states that no source or pathway is recorded and lists receptors", () => {
    render(<SketchInvestigationLayer overlay={overlay()} />);
    expect(screen.getByTestId("investigation-source").textContent).toMatch(
      /No source hypothesis recorded/,
    );
    expect(screen.getByTestId("investigation-pathway").textContent).toMatch(
      /not inferred/,
    );
    expect(
      within(screen.getByTestId("investigation-receptors")).getByText(
        /Laundry — 2 observations/,
      ),
    ).toBeTruthy();
  });

  it("surfaces unsupported wording as a warning, not a finding", () => {
    render(<SketchInvestigationLayer overlay={overlay()} />);
    const flagged = screen.getByTestId("investigation-flagged");
    expect(flagged.textContent).toMatch(/not an assessment/);
    expect(screen.getByTestId("investigation-summary").textContent).not.toMatch(
      /Looks safe now/,
    );
  });

  it("shows an empty state for a floor without evidence", () => {
    render(
      <SketchInvestigationLayer
        overlay={buildInvestigationOverlay({
          width: 100,
          height: 100,
          moisturePins: [],
          damageMarkers: [],
          evidencePins: [],
        })}
      />,
    );
    expect(screen.queryAllByTestId("investigation-observation")).toHaveLength(0);
    expect(screen.getByTestId("investigation-receptors").textContent).toMatch(
      /None observed yet/,
    );
    expect(screen.getByTestId("investigation-gaps").textContent).toBe(
      "None found.",
    );
  });
});
