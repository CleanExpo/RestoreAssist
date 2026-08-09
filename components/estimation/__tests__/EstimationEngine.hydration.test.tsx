// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EstimationEngine from "@/components/EstimationEngine";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/estimation/EstimateStatusWorkflow", () => ({
  EstimateStatusWorkflow: ({
    beforeTransition,
  }: {
    beforeTransition?: () => Promise<boolean>;
  }) => (
    <button type="button" onClick={() => void beforeTransition?.()}>
      Attempt status transition
    </button>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EstimationEngine estimate hydration", () => {
  it("preserves nested API totals in the pre-transition save payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "estimate_1", status: "CLIENT_REVIEW" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EstimationEngine
        reportId="report_1"
        initialEstimateData={{
          id: "estimate_1",
          status: "CLIENT_REVIEW",
          version: 3,
          lineItems: [],
          subtotalExGST: 0,
          gst: 0,
          totalIncGST: 0,
          totals: {
            labourSubtotal: 1000,
            equipmentSubtotal: 0,
            chemicalsSubtotal: 0,
            subcontractorSubtotal: 0,
            travelSubtotal: 0,
            wasteSubtotal: 0,
            overheads: 0,
            profit: 0,
            contingency: 0,
            escalation: 0,
            subtotalExGST: 1000,
            gst: 100,
            totalIncGST: 1100,
          },
        }}
        onEstimateComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Attempt status transition" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body as string);

    expect(request[0]).toBe("/api/estimates");
    expect(payload).toMatchObject({
      reportId: "report_1",
      labourSubtotal: 1000,
      subtotalExGST: 1000,
      gst: 100,
      totalIncGST: 1100,
    });
  });
});
