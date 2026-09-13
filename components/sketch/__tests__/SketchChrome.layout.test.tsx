// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchDockToolbar } from "../SketchDockToolbar";
import { SketchSelectionPanel } from "../SketchSelectionPanel";
import { SketchPlanLifecycleBanner } from "../SketchPlanLifecycleBanner";

/**
 * RA-7543 — Sketch chrome must sit in document flow, not overlay the canvas.
 * `sticky` / `fixed` / overlay `absolute` steal pan/zoom pointer events.
 */
const OVERLAY_POS = /(?:^|\s)(?:sticky|fixed|absolute)(?:\s|$)/;

function assertInFlowChrome(el: HTMLElement) {
  expect(el).toHaveAttribute("data-sketch-chrome", "in-flow");
  expect(el.className).not.toMatch(OVERLAY_POS);
  const pos = getComputedStyle(el).position;
  expect(["static", "relative", ""]).toContain(pos);
}

describe("Sketch chrome — no overlay stickiness (RA-7543)", () => {
  it("dock toolbar is in-flow (not sticky/fixed/absolute)", () => {
    render(
      <SketchDockToolbar toolMode="select" onToolChange={vi.fn()} />,
    );
    const toolbar = screen.getByTestId("sketch-dock-toolbar");
    assertInFlowChrome(toolbar);
    expect(screen.getByRole("button", { name: /^Pan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Select/ })).toBeInTheDocument();
  });

  it("selection panel is in-flow (not sticky/fixed/absolute)", () => {
    render(
      <SketchSelectionPanel
        selected={{ id: "el1", type: "room", label: "Lounge" }}
      />,
    );
    const panel = screen.getByTestId("sketch-selection-panel");
    assertInFlowChrome(panel);
    expect(screen.getByText("Room")).toBeInTheDocument();
  });

  it("lifecycle banner is in-flow (not sticky/fixed/absolute)", () => {
    render(<SketchPlanLifecycleBanner phase="plan_ready" />);
    const banner = screen.getByTestId("sketch-plan-lifecycle-banner");
    assertInFlowChrome(banner);
  });
});
