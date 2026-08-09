// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("../ProfessionalDocumentViewer", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("../IicrcInclusionPanel", () => ({
  default: () => null,
}));

vi.mock("../AiOwnershipBanner", () => ({
  default: () => null,
}));

import InspectionReportViewer from "../InspectionReportViewer";

describe("InspectionReportViewer download", () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-report"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("downloads through the canonical artifact-aware report endpoint", async () => {
    const pdf = new Blob(["mock-pdf"], { type: "application/pdf" });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/reports/report_mock") {
          return {
            ok: true,
            json: async () => ({
              id: "report_mock",
              reportNumber: "RA-2026-0001",
              reportDepthLevel: "Enhanced",
              detailedReport: "# Mock inspection report",
            }),
          };
        }
        if (url === "/api/reports/report_mock/download") {
          return {
            ok: true,
            blob: async () => pdf,
            headers: new Headers({
              "Content-Disposition":
                'attachment; filename="RestoreAssist-RA-2026-0001.pdf"',
            }),
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionReportViewer reportId="report_mock" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Download PDF" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/report_mock/download",
      ),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          "/api/reports/report_mock/download-inspection-report",
      ),
    ).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Inspection Report PDF downloaded",
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
