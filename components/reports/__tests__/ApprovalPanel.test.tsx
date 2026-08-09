// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalPanel from "../ApprovalPanel";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ApprovalPanel", () => {
  it("renders pending approvals as client-portal status only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          approvals: [
            {
              id: "approval_1",
              reportId: "report_1",
              approvalType: "COST_ESTIMATE",
              status: "PENDING",
              requestedAt: "2026-08-09T10:00:00.000Z",
              respondedAt: null,
              clientComments: null,
              amount: 1100,
              createdAt: "2026-08-09T10:00:00.000Z",
            },
          ],
        }),
      }),
    );

    render(<ApprovalPanel reportId="report_1" />);

    expect(
      await screen.findByText("Awaiting client portal response"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reject", exact: true }),
    ).not.toBeInTheDocument();
  });
});
