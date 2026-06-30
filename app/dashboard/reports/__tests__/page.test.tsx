// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// STORM 100-closeout — render-level coverage for the Reports dashboard page.
// (1) #18: the table's icon-only action + selection controls expose aria-labels.
// (2) The LIVE download path (batch ZIP export) surfaces a toast on failure —
//     the single-report `downloadReport` is currently dead code (its table button
//     is commented out), so the batch path is the real user-facing download.

const refetch = vi.fn();
const useFetch = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({ useFetch: (...a: unknown[]) => useFetch(...a) }));

const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));
vi.mock("@/components/SessionMetadataCard", () => ({
  EvaluatorScoreBadge: () => null,
  PhaseProgressBar: () => null,
}));
vi.mock("@/components/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: () => null,
}));

import ReportsPage from "../page";

const REPORT = {
  id: "rep-1",
  reportNumber: "RPT-0001",
  clientName: "Alpha Restorations",
  propertyAddress: "1 Alpha St, Brisbane",
  status: "COMPLETED",
  createdAt: "2026-01-01T00:00:00.000Z",
  policyType: "Building",
  waterCategory: "1",
  estimatedCost: 1000,
  aiSynopsis: null,
  evaluatorScores: null,
  phases: null,
  fanOutSessions: null,
};

beforeEach(() => {
  useFetch.mockReset();
  toastError.mockReset();
  refetch.mockReset();
  // Reports list resolves with one report; other useFetch calls (if any) get a benign shape.
  useFetch.mockReturnValue({
    data: { reports: [REPORT] },
    loading: false,
    error: null,
    refetch,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportsPage — a11y (#18) and live download error feedback", () => {
  it("gives the table's icon-only action and selection controls accessible names", async () => {
    render(<ReportsPage />);
    const table = await screen.findByRole("table");
    const scope = within(table);

    expect(scope.getByRole("link", { name: /view report/i })).toBeInTheDocument();
    expect(scope.getByRole("link", { name: /edit report/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /duplicate report/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /select report/i })).toBeInTheDocument();
  });

  it("shows an error toast when the batch ZIP download fails", async () => {
    render(<ReportsPage />);
    const table = await screen.findByRole("table");

    // Select the row so the batch-download button becomes enabled.
    fireEvent.click(within(table).getByRole("button", { name: /select report/i }));

    const zipBtn = await screen.findByRole("button", {
      name: /download.*as zip/i,
    });
    await waitFor(() => expect(zipBtn).toBeEnabled());

    // The bulk-export request fails.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      }),
    );

    fireEvent.click(zipBtn);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
