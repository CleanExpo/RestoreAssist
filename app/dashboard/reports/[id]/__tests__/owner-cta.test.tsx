// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const auth = { userId: "owner-1" };
const report = {
  id: "report-1",
  userId: "owner-1",
  reportNumber: "RPT-1",
  propertyAddress: "1 Example St",
  status: "DRAFT",
  inspection: null as { id: string } | null,
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: auth.userId } }, status: "authenticated" }),
}));
vi.mock("@/components/InspectionReportViewer", () => ({ default: () => null }));
vi.mock("@/components/reports/weakness-findings-panel", () => ({
  WeaknessFindingsPanel: () => null,
}));
vi.mock("@/components/claims/StartClaimProgressButton", () => ({
  StartClaimProgressButton: () => null,
}));

import ReportDetailPage from "../page";

beforeEach(() => {
  push.mockReset();
  auth.userId = "owner-1";
  report.userId = "owner-1";
  report.inspection = null;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...report }),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("report detail inspection job action", () => {
  it("lets the report owner start a linked draft", async () => {
    render(<ReportDetailPage params={Promise.resolve({ id: "report-1" })} />);
    const button = await screen.findByRole("button", { name: "Create inspection job" });
    fireEvent.click(button);
    expect(push).toHaveBeenCalledWith("/dashboard/inspections/new?reportId=report-1");
  });

  it("does not offer a manager another owner's write action", async () => {
    auth.userId = "manager-2";
    render(<ReportDetailPage params={Promise.resolve({ id: "report-1" })} />);
    await screen.findByText("RPT-1");
    expect(screen.queryByRole("button", { name: "Create inspection job" })).not.toBeInTheDocument();
  });

  it("does not offer a second linked job", async () => {
    report.inspection = { id: "inspection-1" };
    render(<ReportDetailPage params={Promise.resolve({ id: "report-1" })} />);
    await waitFor(() => expect(screen.getByText("RPT-1")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Create inspection job" })).not.toBeInTheDocument();
  });
});
