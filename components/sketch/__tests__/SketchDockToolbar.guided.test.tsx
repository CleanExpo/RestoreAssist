// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchDockToolbar } from "../SketchDockToolbar";

// ToolBtn accessible name is `${label} (${shortcut})`, e.g. "Wall (L)".
const BASIC = [/^Select/, /^Room/, /^Label/, /^Photo/, /^Pan/];
const TECH_ONLY = [
  /^Wall/,
  /^Door/,
  /^Window/,
  /^Damage/,
  /^Freehand/,
  /^Arrow/,
  /^Measure/,
  /^Moisture/,
];

describe("SketchDockToolbar — guided (homeowner) mode", () => {
  it("shows only the basic capture tools when guided", () => {
    render(
      <SketchDockToolbar toolMode="select" onToolChange={vi.fn()} guided />,
    );
    for (const name of BASIC) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    for (const name of TECH_ONLY) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("shows the full tool set by default", () => {
    render(<SketchDockToolbar toolMode="select" onToolChange={vi.fn()} />);
    for (const name of [...BASIC, ...TECH_ONLY]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
