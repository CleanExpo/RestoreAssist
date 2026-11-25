// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8000: the admin page counts workflows waiting for approval, and offers
// no Resume button for one (resume cannot skip an approval).

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "ADMIN" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const workflow = (id: string, status: string) => ({
  id,
  name: `Workflow ${id}`,
  status,
  totalTasks: 3,
  completedTasks: 1,
  failedTasks: status === "FAILED" ? 1 : 0,
  reportId: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
});

function stubFetch(pausedAwaitingApproval: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workflows: [workflow("p1", "PAUSED"), workflow("f1", "FAILED")],
          count: 2,
          expiredLeaseTasks: 0,
          pausedAwaitingApproval,
        }),
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import WorkflowMonitorPage from "../page";

describe("WorkflowMonitorPage approval pauses (RA-8000)", () => {
  it("shows the paused-awaiting-approval count and offers Resume only for the failed workflow", async () => {
    stubFetch({ workflows: 1, tasks: 1, oldestApprovalRequestedAt: "2026-11-01T00:00:00.000Z" });
    render(<WorkflowMonitorPage />);

    const count = await screen.findByTestId("paused-approval-count");
    await vi.waitFor(() => expect(count).toHaveTextContent("PAUSED awaiting approval: 1"));
    expect(count).toHaveTextContent(/oldest waiting since/);
    expect(await screen.findAllByRole("button", { name: /resume/i })).toHaveLength(1);
  });

  it("shows 'unavailable', never 0, when the count is missing", async () => {
    stubFetch(undefined);
    render(<WorkflowMonitorPage />);
    const count = await screen.findByTestId("paused-approval-count");
    await vi.waitFor(() => expect(count).toHaveTextContent("unavailable"));
  });
});
