// @vitest-environment jsdom
// RA-5041 UI: fixture-driven tests for the weakness findings review panel.
// The route (PR2, #1782) is mocked via global.fetch — this suite is green
// independently of whether #1782 has merged.
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeaknessFindingsPanel } from "../weakness-findings-panel";
import type { WeaknessFinding } from "@/lib/services/weakness-detection/types";

const P0_FINDING: WeaknessFinding = {
  id: "f_p0",
  checkClass: "redline_language",
  severity: "P0",
  evidenceAnchor: {
    reportSectionId: "technicianNotes",
    field: "technicianFieldReport",
    quotedText: "guaranteed dry",
  },
  description: 'Absolute language "guaranteed dry" is a red-line breach.',
  suggestedAction: "Rewrite using a verifiable moisture reading instead.",
  detectionMethod: "deterministic",
};

const P1_FINDING: WeaknessFinding = {
  id: "f_p1",
  checkClass: "contradiction",
  severity: "P1",
  evidenceAnchor: "unverified/missing",
  description: "Summary contradicts the technician notes.",
  suggestedAction: "Reconcile the two sections before handoff.",
  detectionMethod: "llm",
};

const P2_FINDING: WeaknessFinding = {
  id: "f_p2",
  checkClass: "scope_expansion",
  severity: "P2",
  evidenceAnchor: {
    reportSectionId: "scopeItems",
    field: "description",
    quotedText: "additional ceiling replacement",
  },
  description: "No authorised scope recorded to compare against.",
  suggestedAction: "Attach the signed scope-of-works for comparison.",
  detectionMethod: "deterministic",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function runButton() {
  return screen.getByRole("button", { name: /run weakness check/i });
}

describe("WeaknessFindingsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the idle prompt and run trigger before any run", () => {
    render(<WeaknessFindingsPanel reportId="report_1" />);

    expect(runButton()).toBeInTheDocument();
    expect(
      screen.getByText(/run the weakness check before handing this report off/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("weakness-group-P0")).not.toBeInTheDocument();
  });

  it("shows a loading state while the check is in flight and calls onRunStart", async () => {
    const onRunStart = vi.fn();
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);

    render(<WeaknessFindingsPanel reportId="report_1" onRunStart={onRunStart} />);
    fireEvent.click(runButton());

    expect(onRunStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/running weakness check/i)).toBeInTheDocument();

    resolveFetch(
      jsonResponse({ data: { findings: [], llmReviewApplied: false } }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/no weakness findings detected/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders the all-clear state when a run returns no findings", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ data: { findings: [], llmReviewApplied: true } }),
    );
    const onGateChange = vi.fn();

    render(
      <WeaknessFindingsPanel reportId="report_1" onGateChange={onGateChange} />,
    );
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(screen.getByTestId("weakness-all-clear")).toBeInTheDocument(),
    );
    expect(onGateChange).toHaveBeenLastCalledWith({
      hasUnresolvedP0: false,
      p0Count: 0,
    });
  });

  it("groups findings by severity with P0 rendered first as a hard-stop banner", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({
        data: {
          findings: [P2_FINDING, P0_FINDING, P1_FINDING],
          llmReviewApplied: true,
        },
      }),
    );

    render(<WeaknessFindingsPanel reportId="report_1" />);
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(screen.getByTestId("weakness-group-P0")).toBeInTheDocument(),
    );

    // DOM order: P0 hard-stop banner first, then P1 "reviewer required", then P2.
    const groups = Array.from(
      document.querySelectorAll('[data-testid^="weakness-group-"]'),
    ).map((el) => el.getAttribute("data-testid"));
    expect(groups).toEqual([
      "weakness-group-P0",
      "weakness-group-P1",
      "weakness-group-P2",
    ]);

    expect(
      screen.getByText(/hard stop.*1 red-line breach/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/reviewer required — 1 finding/i)).toBeInTheDocument();
    expect(screen.getByText(/improvement — 1 finding/i)).toBeInTheDocument();

    // Finding detail rendering: label, description, evidence anchor,
    // suggested action, detection-method badge.
    expect(screen.getByText("Red-line language")).toBeInTheDocument();
    expect(
      screen.getByText(/absolute language "guaranteed dry"/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/technicianNotes.*technicianFieldReport/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/rewrite using a verifiable moisture reading/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Deterministic").length).toBeGreaterThan(0);

    // P1 finding has no evidence field — literal unverified/missing state.
    expect(screen.getByText("Evidence: unverified/missing")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
  });

  it("reports the P0 gate as blocked until acknowledged, then unblocked (no raw gating)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ data: { findings: [P0_FINDING], llmReviewApplied: false } }),
    );
    const onGateChange = vi.fn();

    const { rerender } = render(
      <WeaknessFindingsPanel
        reportId="report_1"
        acknowledged={false}
        onGateChange={onGateChange}
      />,
    );
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(
        screen.getByText(/export is blocked until these are acknowledged/i),
      ).toBeInTheDocument(),
    );
    expect(onGateChange).toHaveBeenLastCalledWith({
      hasUnresolvedP0: true,
      p0Count: 1,
    });

    // Host acknowledges (e.g. after its own "Export anyway" confirmation) —
    // export becomes possible without a fresh run or any raw gating.
    rerender(
      <WeaknessFindingsPanel
        reportId="report_1"
        acknowledged={true}
        onGateChange={onGateChange}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/p0 flags acknowledged — export unblocked/i),
      ).toBeInTheDocument(),
    );
    expect(onGateChange).toHaveBeenLastCalledWith({
      hasUnresolvedP0: false,
      p0Count: 1,
    });
  });

  it("shows an error state with a retry that re-runs the check", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ error: "Report not found" }, false))
      .mockResolvedValueOnce(
        jsonResponse({ data: { findings: [], llmReviewApplied: false } }),
      );

    render(<WeaknessFindingsPanel reportId="report_1" />);
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(screen.getByText("Report not found")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /re-run weakness check/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/no weakness findings detected/i),
      ).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows a fallback error message when the fetch itself rejects", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );

    render(<WeaknessFindingsPanel reportId="report_1" />);
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(
        screen.getByText(/failed to run weakness check/i),
      ).toBeInTheDocument(),
    );
  });
});
