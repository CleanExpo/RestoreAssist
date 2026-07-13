// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NIRClaimAssessmentPanel from "../NIRClaimAssessmentPanel";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe("NIRClaimAssessmentPanel — locked claim type (RA-1029)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );
  });

  it("hides claim-type chips when lockedClaimType is set", async () => {
    render(
      <NIRClaimAssessmentPanel
        inspectionId="insp_1"
        lockedClaimType="MOULD"
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("nir-claim-assessment-panel"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("nir-claim-type-chips")).not.toBeInTheDocument();
    expect(screen.getByTestId("nir-claim-type-locked")).toHaveTextContent(
      /Mould/i,
    );
  });

  it("shows claim-type chips when unlocked", async () => {
    render(
      <NIRClaimAssessmentPanel
        inspectionId="insp_1"
        initialClaimType="WATER"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("nir-claim-type-chips")).toBeInTheDocument();
    });
  });

  it("renders mould condition-level field when locked to MOULD", async () => {
    render(
      <NIRClaimAssessmentPanel
        inspectionId="insp_1"
        lockedClaimType="MOULD"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Condition Level/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Mould Category/i)).not.toBeInTheDocument();
  });

  it("renders fire residue fields when locked to FIRE", async () => {
    render(
      <NIRClaimAssessmentPanel
        inspectionId="insp_1"
        lockedClaimType="FIRE"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Smoke Residue Type/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Smoke Type$/)).not.toBeInTheDocument();
  });
});
