// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReportDetailHonestyPanel } from "@/components/reports/ReportDetailHonestyPanel";

afterEach(() => cleanup());

describe("ReportDetailHonestyPanel (RA-7550)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profile: { subscriptionStatus: "ACTIVE" } }),
      }),
    );
  });

  it("explains AI draft vs issued report and Upload PDF", () => {
    render(
      <ReportDetailHonestyPanel
        report={{
          status: "IN_PROGRESS",
          detailedReport: "AI-ASSISTED DRAFT body",
        }}
      />,
    );

    expect(screen.getByTestId("report-detail-honesty-panel")).toBeInTheDocument();
    expect(
      screen.getByText(/AI draft is not an issued report/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("report-detail-upload-pdf-hint")).toHaveTextContent(
      /Upload PDF/i,
    );
    expect(
      screen.getByTestId("report-honesty-ownership-label"),
    ).toHaveTextContent("AI draft");
  });
});
