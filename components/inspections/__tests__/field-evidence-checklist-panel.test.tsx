// @vitest-environment jsdom
// RA-5039 PR2: informational field evidence checklist panel — renders the
// FieldEvidenceChecklist (RA-5039 PR1 contract) sectioned by severity, and
// never gates submit/generate actions (read-only AC).
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  gapsByAffectedArea: [{ roomZoneId: "Bathroom", evidenceCount: 0 }],
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

  it("renders the three severity sections plus area gaps and unlinked evidence", async () => {
    mockFetchOk(CHECKLIST_WITH_GAPS);
    render(<FieldEvidenceChecklistPanel inspectionId="insp-1" />);

    await waitFor(() =>
      expect(screen.getByText(/required — missing/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/recommended — missing/i)).toBeInTheDocument();
    expect(screen.getByText(/weak \(qa score < 70\)/i)).toBeInTheDocument();
    expect(screen.getByText("Moisture Reading")).toBeInTheDocument();
    expect(screen.getByText("Equipment Photo")).toBeInTheDocument();
    expect(screen.getByText("Ambient Environmental Reading")).toBeInTheDocument();

    expect(
      screen.getByText(/affected areas with no evidence/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Bathroom")).toBeInTheDocument();

    expect(
      screen.getByText(/evidence tagged to unrecognised rooms/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Laundry Nook")).toBeInTheDocument();
  });

  it("renders a single all-complete message when there are no gaps", async () => {
    mockFetchOk(CHECKLIST_COMPLETE);
    render(<FieldEvidenceChecklistPanel inspectionId="insp-2" />);

    await waitFor(() =>
      expect(
        screen.getByText(/all required and recommended field evidence/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/required — missing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/weak \(qa score < 70\)/i)).not.toBeInTheDocument();
  });

  it("never renders disabled or gating controls — informational only per the read-only AC", async () => {
    mockFetchOk(CHECKLIST_WITH_GAPS);
    const { container } = render(
      <FieldEvidenceChecklistPanel inspectionId="insp-1" />,
    );
    await waitFor(() =>
      expect(screen.getByText(/required — missing/i)).toBeInTheDocument(),
    );

    // The panel has no submit/generate button of its own, and renders no
    // disabled controls — it must never gate the neighbouring hard gates.
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
