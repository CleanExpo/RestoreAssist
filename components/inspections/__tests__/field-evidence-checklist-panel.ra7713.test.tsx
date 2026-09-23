// @vitest-environment jsdom
// RA-7713 part 11: the checklist reports its required progress upward so the
// readiness figure above it can be capped by it.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldEvidenceChecklistPanel } from "../field-evidence-checklist-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = (status: "present" | "missing" | "weak") => ({
  evidenceClass: "MOISTURE_READING",
  displayName: "Moisture Reading",
  stepKey: "moisture-survey",
  stepTitle: "Moisture Survey",
  riskTier: 2,
  requiredCount: 1,
  capturedCount: status === "missing" ? 0 : 1,
  status,
  averageQaScore: null,
  s500Ref: "S500:2021 §10.2",
});

function checklist(required: ReturnType<typeof item>[]) {
  return {
    inspectionId: "insp-1",
    claimType: "WATER_DAMAGE",
    generatedAt: "2026-09-23T00:00:00.000Z",
    categories: { required, recommended: [] },
    gapsByEvidenceClass: {},
    gapsByAffectedArea: [],
    unlinkedEvidence: [],
  };
}

describe("FieldEvidenceChecklistPanel onRequiredProgress", () => {
  it("reports present/total for the required category once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: checklist([item("missing"), item("weak"), item("present")]),
        }),
      }),
    );
    const onRequiredProgress = vi.fn();
    render(
      <FieldEvidenceChecklistPanel
        inspectionId="insp-1"
        onRequiredProgress={onRequiredProgress}
      />,
    );
    await waitFor(() =>
      expect(onRequiredProgress).toHaveBeenLastCalledWith({
        present: 1,
        total: 3,
      }),
    );
  });

  it("reports null when the checklist fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unauthorized" }),
      }),
    );
    const onRequiredProgress = vi.fn();
    render(
      <FieldEvidenceChecklistPanel
        inspectionId="insp-1"
        onRequiredProgress={onRequiredProgress}
      />,
    );
    await waitFor(() => expect(onRequiredProgress).toHaveBeenCalled());
    expect(onRequiredProgress).toHaveBeenLastCalledWith(null);
  });
});
