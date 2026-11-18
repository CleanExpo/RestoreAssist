// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RA-8455: a restorer's approval request is saved as a PENDING ReportApproval
// row. The homeowner must be able to answer it from /portal/reports/[id];
// before this fix the page showed a "PENDING" badge and no control.

const portalFetch = vi.fn();
vi.mock("@/lib/portal/client-session", () => ({
  getStoredClientSession: () => ({ clientId: "c_1" }),
  portalFetch: (...a: unknown[]) => portalFetch(...a),
}));
// A stable router: the page's effect depends on it, so a new object per
// render would refetch forever.
const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/portal/ClientPortalAccountLayout", () => ({
  ClientPortalAccountLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import PortalReportDetail from "../page";

type Approval = {
  id: string;
  approvalType: "SCOPE_OF_WORK" | "COST_ESTIMATE";
  status: string;
  requestedAt: string;
  respondedAt: string | null;
  clientComments: string | null;
};

function report(approvals: Approval[]) {
  return {
    id: "r_1",
    title: "Kitchen water damage",
    description: null,
    status: "PENDING",
    propertyAddress: "1 Test Street",
    hazardType: "WATER",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    completionDate: null,
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    client: { name: "Home Owner", email: "h@example.com", phone: null },
    user: {
      name: null,
      businessName: "Test Restorations",
      businessPhone: null,
      businessEmail: null,
    },
    approvals,
  };
}

const pendingCost: Approval = {
  id: "ap_req",
  approvalType: "COST_ESTIMATE",
  status: "PENDING",
  requestedAt: "2026-11-02T00:00:00.000Z",
  respondedAt: null,
  clientComments: null,
};
const answeredCost: Approval = {
  id: "ap_old",
  approvalType: "COST_ESTIMATE",
  status: "CHANGES_REQUESTED",
  requestedAt: "2026-11-01T00:00:00.000Z",
  respondedAt: "2026-11-01T01:00:00.000Z",
  clientComments: "Please split the drying line",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function renderWith(approvals: Approval[]) {
  portalFetch.mockImplementation(async () =>
    jsonResponse({ report: report(approvals) }),
  );
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PortalReportDetail params={Promise.resolve({ id: "r_1" })} />
      </Suspense>,
    );
  });
  await screen.findByText("Kitchen water damage");
  // The approval card is the heading's grandparent (card > header row > h3).
  const card = screen.getByRole("heading", { name: "Cost Estimate" })
    .parentElement?.parentElement;
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

beforeEach(() => {
  portalFetch.mockReset();
});

describe("/portal/reports/[id] approvals", () => {
  it("gives the homeowner a control to answer a pending cost request", async () => {
    const card = await renderWith([pendingCost]);
    expect(
      within(card).getByRole("button", { name: /review & approve/i }),
    ).toBeInTheDocument();
    expect(within(card).getByText(/your restorer has asked/i)).toBeInTheDocument();
  });

  it("answers the pending request through the approvals route without an amount", async () => {
    const card = await renderWith([pendingCost]);
    fireEvent.click(within(card).getByRole("button", { name: /review & approve/i }));
    portalFetch.mockResolvedValueOnce(jsonResponse({ approval: { id: "ap_req" } }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /^submit$/i }));
    });

    const post = portalFetch.mock.calls.find(
      ([url, init]) =>
        url === "/api/portal/reports/r_1/approvals" && init?.method === "POST",
    );
    expect(post).toBeDefined();
    const body = JSON.parse(post![1].body as string);
    expect(body).toMatchObject({ approvalType: "COST_ESTIMATE", status: "APPROVED" });
    expect(body).not.toHaveProperty("amount");
  });

  it("shows an answered approval as a badge with no control", async () => {
    const card = await renderWith([answeredCost]);
    expect(within(card).getByText("CHANGES REQUESTED")).toBeInTheDocument();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("lets a newer request win over an older answer", async () => {
    // API order is createdAt desc: the re-request comes first.
    const card = await renderWith([pendingCost, answeredCost]);
    expect(
      within(card).getByRole("button", { name: /review & approve/i }),
    ).toBeInTheDocument();
    expect(within(card).queryByText("CHANGES REQUESTED")).toBeNull();
  });
});
