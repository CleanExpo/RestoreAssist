// @vitest-environment jsdom
// RA-8388: the "N issues must be resolved" list was a set of plain rows
// hidden behind a Details toggle. A technician could read what was wrong and
// had nothing to select. Every gap that names a real step must take them there.
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubmissionGatePanel } from "../submission-gate-panel";
import type {
  EvidenceGap,
  SubmissionValidationResult,
} from "@/lib/evidence/submission-validator";

function gap(overrides: Partial<EvidenceGap>): EvidenceGap {
  return {
    stepKey: "moisture_survey",
    stepTitle: "Moisture Survey",
    riskTier: 2,
    issue: "below_minimum",
    detail: "4/5 evidence items captured",
    ...overrides,
  } as EvidenceGap;
}

function mockValidation(partial: Partial<SubmissionValidationResult>) {
  const validation = {
    canSubmit: false,
    score: 60,
    blockingGaps: [],
    warningGaps: [],
    totalSteps: 8,
    completedSteps: 6,
    ...partial,
  } as SubmissionValidationResult;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ validation }),
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SubmissionGatePanel", () => {
  it("opens the list by default when something blocks, and each issue selects its step", async () => {
    mockValidation({
      blockingGaps: [
        gap({}),
        gap({
          stepKey: "environmental",
          stepTitle: "Environmental Readings",
          issue: "missing_evidence",
          detail: "No evidence captured",
        }),
      ],
    });
    const onSelectStep = vi.fn();
    render(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
        onSelectStep={onSelectStep}
      />,
    );

    // No click on "Details" first: the list is already there.
    const moisture = await screen.findByRole("button", {
      name: /Moisture Survey.*4\/5 evidence items captured/,
    });
    const environmental = screen.getByRole("button", {
      name: /Environmental Readings/,
    });

    fireEvent.click(moisture);
    fireEvent.click(environmental);
    expect(onSelectStep.mock.calls).toEqual([
      ["moisture_survey"],
      ["environmental"],
    ]);
  });

  it("links each issue to its capture step when no handler is given", async () => {
    mockValidation({ blockingGaps: [gap({})] });
    render(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
      />,
    );
    const link = await screen.findByRole("link", { name: /Moisture Survey/ });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/inspections/insp-1/capture?step=moisture_survey",
    );
  });

  it("does not make a synthetic gap selectable, because it has no step to go to", async () => {
    mockValidation({
      blockingGaps: [
        gap({
          stepKey: "_qa_score",
          stepTitle: "Evidence quality",
          detail: "Score below threshold",
        }),
      ],
    });
    const onSelectStep = vi.fn();
    render(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
        onSelectStep={onSelectStep}
      />,
    );
    await screen.findByText("Evidence quality");
    expect(
      screen.queryByRole("button", { name: /Evidence quality/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Evidence quality/ }),
    ).not.toBeInTheDocument();
  });

  it("checks again when the evidence count changes, so a fixed issue clears without a reload", async () => {
    mockValidation({ blockingGaps: [gap({})] });
    const { rerender } = render(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
        revalidateKey={4}
      />,
    );
    await screen.findByText("1 issue must be resolved");

    // The fifth reading is captured: the page's evidence count goes up and
    // the server now reports nothing blocking.
    mockValidation({ canSubmit: true, blockingGaps: [] });
    rerender(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
        revalidateKey={5}
      />,
    );
    await screen.findByText("Evidence validation passed");
    expect(
      screen.queryByText("1 issue must be resolved"),
    ).not.toBeInTheDocument();
  });

  it("keeps warnings folded away when nothing blocks, and makes them selectable once opened", async () => {
    mockValidation({
      canSubmit: true,
      warningGaps: [
        gap({
          stepKey: "equipment",
          stepTitle: "Equipment Placement",
          riskTier: 1,
          detail: "Skipped with a reason",
        }),
      ],
    });
    const onSelectStep = vi.fn();
    render(
      <SubmissionGatePanel
        inspectionId="insp-1"
        isReadyToSubmit
        onSubmit={() => {}}
        submitting={false}
        onSelectStep={onSelectStep}
      />,
    );
    await screen.findByText("Evidence validation passed");
    expect(
      screen.getByRole("button", { name: /Submit Inspection/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Equipment Placement")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Equipment Placement/ }),
    );
    await waitFor(() =>
      expect(onSelectStep).toHaveBeenCalledWith("equipment"),
    );
  });
});
