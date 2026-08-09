// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortalReportDetail from "@/app/portal/reports/[id]/page";

const { portalFetchMock, routerPushMock, routerMock } = vi.hoisted(() => ({
  portalFetchMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerMock: { push: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/portal/client-session", () => ({
  getStoredClientSession: () => ({ clientId: "client-1" }),
  portalFetch: (...args: unknown[]) => portalFetchMock(...args),
}));

vi.mock("@/components/portal/PortalNav", () => ({
  default: () => <nav>Portal navigation</nav>,
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const report = {
  id: "report-1",
  title: "Water damage report",
  description: null,
  status: "PUBLISHED",
  reportVersion: 4,
  propertyAddress: "1 Test Street",
  hazardType: "WATER",
  totalCost: 1200,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-08T01:02:03.000Z",
  waterCategory: null,
  waterClass: null,
  completionDate: null,
  scopeOfWorksDocument: null,
  costEstimationDocument: "Published cost estimate",
  detailedReport: null,
  client: {
    name: "Client",
    email: "client@example.com",
    phone: null,
  },
  user: {
    name: "Restorer",
    businessName: "Restore Co",
    businessPhone: null,
    businessEmail: null,
  },
  approvals: [
    {
      id: "approval-1",
      approvalType: "COST_ESTIMATE",
      status: "PENDING",
      requestedAt: "2026-08-08T00:00:00.000Z",
      respondedAt: null,
      clientComments: null,
      amount: 1200,
    },
  ],
};

afterEach(cleanup);

beforeEach(() => {
  routerPushMock.mockReset();
  routerMock.push = routerPushMock;
  portalFetchMock.mockReset();
  portalFetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ report }),
  });
});

async function renderReportPage() {
  const params = Object.assign(Promise.resolve({ id: report.id }), {
    status: "fulfilled",
    value: { id: report.id },
  });

  render(<PortalReportDetail params={params} />);

  return screen.findByRole("button", { name: "Review & Respond" });
}

describe("portal report approval dialog", () => {
  it("provides a named modal and explicitly labelled 44px controls", async () => {
    const trigger = await renderReportPage();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Cost Estimate Approval",
    });
    const decision = screen.getByLabelText("Your Decision");
    const comments = screen.getByLabelText("Comments (Optional)");

    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveAccessibleDescription(
      /response applies to this report revision/i,
    );
    expect(decision).toHaveAttribute("id", "approval-decision");
    expect(comments).toHaveAttribute("id", "approval-comments");
    expect(decision).toHaveClass("min-h-11");
    expect(comments).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "min-h-11",
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "min-h-11",
      "min-w-11",
    );
    expect(screen.getByRole("button", { name: "Submit decision" })).toHaveClass(
      "min-h-11",
    );
  });

  it("moves focus into the modal and traps it there while open", async () => {
    const trigger = await renderReportPage();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");

    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement),
    );

    trigger.focus();

    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement),
    );
  });

  it("closes on Escape and restores focus to the opening control", async () => {
    const trigger = await renderReportPage();
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("closes on outside interaction when idle", async () => {
    const trigger = await renderReportPage();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    const overlay = document.querySelector(
      '[data-slot="dialog-overlay"]',
    ) as HTMLElement;

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(overlay, { button: 0, ctrlKey: false });
    fireEvent.click(overlay);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("locks mutable controls and preserves approval provenance while submitting", async () => {
    const trigger = await renderReportPage();
    portalFetchMock.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Submit decision" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Your Decision")).toBeDisabled();
      expect(screen.getByLabelText("Comments (Optional)")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
    expect(
      screen.getByRole("button", { name: "Submitting approval..." }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Submitting approval..." }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    const [, request] = portalFetchMock.mock.calls[1];
    expect(JSON.parse(request.body)).toEqual({
      approvalId: "approval-1",
      approvalType: "COST_ESTIMATE",
      status: "APPROVED",
      clientComments: null,
      reportVersion: 4,
      reportUpdatedAt: "2026-08-08T01:02:03.000Z",
    });
  });
});
