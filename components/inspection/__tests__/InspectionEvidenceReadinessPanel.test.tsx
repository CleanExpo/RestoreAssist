// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import InspectionEvidenceReadinessPanel from "@/components/inspection/InspectionEvidenceReadinessPanel";

afterEach(() => cleanup());

const baseProps = {
  status: "DRAFT",
  photosCount: 2,
  affectedAreasCount: 1,
  classificationsCount: 1,
  selectedScopeItemsCount: 1,
  costEstimateCount: 1,
  totalCost: 1200,
  onSelectTab: vi.fn(),
};

describe("InspectionEvidenceReadinessPanel", () => {
  it("flags missing moisture as an action for water claims", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...baseProps}
        claimType="WATER"
        moistureReadingsCount={0}
      />,
    );

    expect(screen.getByText("Evidence readiness")).toBeInTheDocument();
    expect(screen.getAllByText("Moisture evidence").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Required for water claims/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Add moisture/i }).length,
    ).toBeGreaterThan(0);
  });

  it("marks moisture as not required for non-water claims", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...baseProps}
        claimType="FIRE"
        moistureReadingsCount={0}
      />,
    );

    expect(
      screen.getByText(/Fire claim — moisture readings are not required/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Not required")).toBeInTheDocument();
  });

  it("shows issue-ready status when all evidence is complete and job is completed", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...baseProps}
        status="COMPLETED"
        claimType="WATER"
        moistureReadingsCount={3}
      />,
    );

    expect(
      screen.getByText("Evidence package is ready for issue"),
    ).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
