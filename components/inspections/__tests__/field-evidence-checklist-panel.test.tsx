// @vitest-environment jsdom
// RA-5039 PR2: informational field evidence checklist panel — progress-first,
// collapsible sections, never gates submit/generate (read-only AC).
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FieldEvidenceChecklistPanel } from "../field-evidence-checklist-panel";
import type { FieldEvidenceChecklist } from "@/lib/evidence/field-evidence-checklist";

beforeEach(() => {
  vi.restoreAllMocks();
});

const CHECKLIST_WITH_GAPS: FieldEvidenceChecklist = {
  inspectionId: "insp-1",
  claimType: "WATER_DAMAGE",
  generatedAt: "2026-07-05T00:00:00.000Z",
  categories: {
    required: [
      {
        evidenceClass: "MOISTURE_READING",
        displayName: "Moisture Reading",
        stepKey: "moisture-survey",
        stepTitle: "Moisture Survey",
        riskTier: 2,
        requiredCount: 3,
        capturedCount: 0,
        status: "missing",
        averageQaScore: null,
        s500Ref: "S500:2021 §10.2",
      },
      {
        evidenceClass: "PHOTO_EQUIPMENT",
        displayName: "Equipment Photo",
        stepKey: "equipment",
        stepTitle: "Equipment Placement",
        riskTier: 1,
        requiredCount: 1,
        capturedCount: 1,
        status: "weak",
        averageQaScore: 55,
        s500Ref: "S500:2021 §11.1",
      },
    ],
    recommended: [
      {
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        displayName: "Ambient Environmental Reading",
        stepKey: "environmental",
        stepTitle: "Environmental Readings",
        riskTier: 1,
        requiredCount: 1,
        capturedCount: 0,
        status: "missing",
        averageQaScore: null,
        s500Ref: "S500:2021 §7.3",
      },
    ],
  },
  gapsByEvidenceClass: {},
  gapsByAffectedArea: [
    { roomZoneId: "Bathroom", evidenceCount: 0 },
    { roomZoneId: "Bathroom", evidenceCount: 0 },
  ],
  unlinkedEvidence: ["Laundry Nook"],
};

const CHECKLIST_COMPLETE: FieldEvidenceChecklist = {
  inspectionId: "insp-2",
  claimType: "WATER_DAMAGE",
  generatedAt: "2026-07-05T00:00:00.000Z",
  categories: {
    required: [
      {
        evidenceClass: "MOISTURE_READING",
        displayName: "Moisture Reading",
        stepKey: "moisture-survey",
        stepTitle: "Moisture Survey",
        riskTier: 2,
        requiredCount: 1,
        capturedCount: 3,
        status: "present",
        averageQaScore: 90,
        s500Ref: "S500:2021 §10.2",
      },
    ],
    recommended: [],
  },
  gapsByEvidenceClass: {},
  gapsByAffectedArea: [],
  unlinkedEvidence: [],
};

function mockFetchOk(data: FieldEvidenceChecklist) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data }),
    }),
  );
}

describe("FieldEvidenceChecklistPanel", () => {
  it("shows a loading state before the fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<FieldEvidenceChecklistPanel inspectionId="insp-1" />);
    expect(
      screen.getByText(/loading field evidence checklist/i),
    ).toBeInTheDocument();
  });

  it("shows an error state with a retry action when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unauthorized" }),
      }),
    );
    render(<FieldEvidenceChecklistPanel inspectionId="insp-1" />);
    await waitFor(() =>
      expect(screen.getByText("Unauthorized")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("shows progress summary first and opens required gaps by default", async () => {
    mockFetchOk(CHECKLIST_WITH_GAPS);
    render(<FieldEvidenceChecklistPanel inspectionId="insp-1" />);

    await waitFor(() =>
      expect(screen.getByText(/required gaps/i)).toBeInTheDocument(),
    );

    expect(screen.getByText(/optional completeness check/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/2 complete/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/1 complete/i)).toBeInTheDocument();
    expect(screen.getByText("Moisture Reading")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /capture moisture reading/i }),
    ).toHaveAttribute(
      "href",
      "/dashboard/inspections/insp-1/capture?step=moisture-survey",
    );
  });

  it("dedupes duplicate area gaps and keeps recommended section collapsed when required gaps exist", async () => {
    mockFetchOk(CHECKLIST_WITH_GAPS);
    render(<FieldEvidenceChecklistPanel inspectionId="insp-1" />);

    await waitFor(() =>
      expect(screen.getByText(/areas with no evidence/i)).toBeInTheDocument(),
    );

    // Recommended gaps exist but start collapsed while required gaps are open.
    expect(
      screen.queryByText("Ambient Environmental Reading"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /recommended gaps/i }));
    expect(
      screen.getByText("Ambient Environmental Reading"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /areas with no evidence/i }),
    );
    const areaSection = screen
      .getByRole("button", { name: /areas with no evidence/i })
      .closest("div");
    expect(areaSection).not.toBeNull();
    expect(within(areaSection!).getAllByText("Bathroom")).toHaveLength(1);
  });

  it("renders a single all-complete message when there are no gaps", async () => {
    mockFetchOk(CHECKLIST_COMPLETE);
    render(<FieldEvidenceChecklistPanel inspectionId="insp-2" />);

    await waitFor(() =>
      expect(
        screen.getByText(/all required and recommended field evidence/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/required gaps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/weak qa/i)).not.toBeInTheDocument();
  });

  it("never renders disabled or gating controls — informational only per the read-only AC", async () => {
    mockFetchOk(CHECKLIST_WITH_GAPS);
    const { container } = render(
      <FieldEvidenceChecklistPanel inspectionId="insp-1" />,
    );
    await waitFor(() =>
      expect(screen.getByText(/required gaps/i)).toBeInTheDocument(),
    );

    const disabledButtons = container.querySelectorAll("button[disabled]");
    expect(disabledButtons.length).toBe(0);
    expect(
      screen.queryByRole("button", { name: /submit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate/i }),
    ).not.toBeInTheDocument();
  });
});
