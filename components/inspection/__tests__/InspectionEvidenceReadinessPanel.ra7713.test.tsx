// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import InspectionEvidenceReadinessPanel from "@/components/inspection/InspectionEvidenceReadinessPanel";

afterEach(() => cleanup());

// RA-7713 part 11: "Ready 100% — 6/6 evidence checks complete" sat directly
// above "Field Evidence Checklist — Required 0/10 complete".
const allSectionsDone = {
  claimType: "WATER",
  status: "COMPLETED",
  photosCount: 2,
  moistureReadingsCount: 4,
  affectedAreasCount: 1,
  classificationsCount: 1,
  selectedScopeItemsCount: 1,
  costEstimateCount: 1,
  totalCost: 1200,
  onSelectTab: vi.fn(),
};

describe("InspectionEvidenceReadinessPanel readiness cap (RA-7713 part 11)", () => {
  it("shows Not started, not 100%, when 0 of 10 required items are captured", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...allSectionsDone}
        requiredEvidence={{ present: 0, total: 10 }}
      />,
    );
    // The observed defect, asserted without relying on any new markup.
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    const meter = screen.getByTestId("evidence-readiness-meter");
    expect(meter).toHaveTextContent("Not started");
    expect(meter).not.toHaveTextContent("100%");
    expect(meter).toHaveTextContent("0/10 required field evidence captured");
    expect(meter).toHaveTextContent("6/6 job sections recorded");
    expect(
      screen.queryByText("Evidence package is ready for issue"),
    ).not.toBeInTheDocument();
  });

  it("caps the percentage at required-checklist completion", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...allSectionsDone}
        requiredEvidence={{ present: 3, total: 10 }}
      />,
    );
    expect(screen.getByTestId("evidence-readiness-meter")).toHaveTextContent(
      "30%",
    );
  });

  it("does not claim a percentage while the required checklist is unknown", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...allSectionsDone}
        requiredEvidence={null}
      />,
    );
    const meter = screen.getByTestId("evidence-readiness-meter");
    expect(meter).not.toHaveTextContent("100%");
    expect(meter).toHaveTextContent("—");
  });

  it("reaches 100% only when both are complete", () => {
    render(
      <InspectionEvidenceReadinessPanel
        {...allSectionsDone}
        requiredEvidence={{ present: 10, total: 10 }}
      />,
    );
    expect(screen.getByTestId("evidence-readiness-meter")).toHaveTextContent(
      "100%",
    );
    expect(
      screen.getByText("Evidence package is ready for issue"),
    ).toBeInTheDocument();
  });
});
