// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  SketchSelectionPanel,
  type MaterialOption,
} from "../SketchSelectionPanel";

const MATERIALS: MaterialOption[] = [
  { slug: "fibro", name: "Fibro", isPotentialAcm: true },
];
const room = (over: Record<string, unknown> = {}) => ({
  id: "el1",
  type: "room",
  ...over,
});

describe("SketchSelectionPanel — guided (homeowner) mode", () => {
  it("hides technician-only controls when guided", () => {
    render(
      <SketchSelectionPanel
        selected={room({ materialSlug: "fibro" })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
        guided
      />,
    );
    // technician surfaces gone
    expect(screen.queryByLabelText(/material/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/water category/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/asbestos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jurisdiction/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "AU" }),
    ).not.toBeInTheDocument();
    // basic capture surfaces remain
    expect(
      screen.getAllByRole("button", { name: /colour/i }).length,
    ).toBeGreaterThan(0);
  });

  it("shows technician controls by default (mode unset)", () => {
    render(
      <SketchSelectionPanel
        selected={room({ materialSlug: "fibro" })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
      />,
    );
    expect(screen.getByLabelText(/water category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/material/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AU" })).toBeInTheDocument();
  });
});
