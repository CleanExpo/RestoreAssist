// @vitest-environment jsdom
// RA-7633: status buttons so an estimate can leave DRAFT. No screen called
// PATCH /api/estimates/[id]/status, so every estimate stayed DRAFT and
// "Generate invoice" (which needs APPROVED) always refused.
//
// Expected button labels are written out by hand here on purpose. Deriving
// them from the shared transition map would let a wrong map pass its own test.
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EstimateStatusWorkflow,
  estimateForParent,
} from "../EstimateStatusWorkflow";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EstimateStatusWorkflow", () => {
  it.each([
    ["DRAFT", ["Submit for Internal Review", "Withdraw Estimate"]],
    [
      "INTERNAL_REVIEW",
      ["Return to Draft", "Mark Sent", "Withdraw Estimate"],
    ],
    [
      "CLIENT_REVIEW",
      [
        "Approve with Client Evidence",
        "Record Rejection",
        "Mark Expired",
        "Withdraw Estimate",
      ],
    ],
  ])(
    "from %s shows exactly the next statuses the server allows, and no others",
    (status, expectedLabels) => {
      render(
        <EstimateStatusWorkflow
          estimateId="est_1"
          status={status}
          onStatusChange={vi.fn()}
        />,
      );

      const group = screen.getByRole("group", {
        name: "Estimate status actions",
      });
      const labels = within(group)
        .getAllByRole("button")
        .map((button) => button.textContent);
      expect(labels).toEqual(expectedLabels);
      // Nothing else in the component is a button.
      expect(screen.getAllByRole("button")).toHaveLength(
        expectedLabels.length,
      );
    },
  );

  // Invoice generation locks an APPROVED estimate itself. Locking by hand
  // first leaves no APPROVED estimate, so invoicing refuses and LOCKED has no
  // way out. The server still allows APPROVED -> LOCKED; the UI must not.
  it("never offers Lock Estimate for an APPROVED estimate, and says it is ready to invoice", () => {
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="APPROVED"
        onStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Lock Estimate" }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/ready to invoice/i)).toBeInTheDocument();
  });

  it("shows no buttons for a terminal status", () => {
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="LOCKED"
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByText("No further status changes are available."),
    ).toBeInTheDocument();
  });

  it("shows no buttons until the estimate has been saved", () => {
    render(
      <EstimateStatusWorkflow
        estimateId={null}
        status="DRAFT"
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByText("Save the estimate before changing its status."),
    ).toBeInTheDocument();
  });

  it("sends PATCH to the status route with the chosen status and reports the new status to the parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { id: "est_1", status: "INTERNAL_REVIEW", version: 3 },
        warnings: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onStatusChange = vi.fn();
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="DRAFT"
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    expect(onStatusChange).toHaveBeenCalledWith("INTERNAL_REVIEW");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/estimates/est_1/status");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "INTERNAL_REVIEW" });
  });

  it("shows the server's refusal message when APPROVED has no client approval, and does not report a change", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: "CONFLICT",
            message:
              "Client cost approval is required before the estimate can be approved",
          },
        }),
      ),
    );
    const onStatusChange = vi.fn();
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="CLIENT_REVIEW"
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Approve with Client Evidence" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Client cost approval is required before the estimate can be approved",
    );
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("lists the server's billing blockers when internal review is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          error: { code: "VALIDATION", message: "Billing incomplete" },
          blockers: [
            { code: "NO_LINE_ITEMS", message: "Add at least one line item" },
          ],
          warnings: [],
        }),
      ),
    );
    const onStatusChange = vi.fn();
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="DRAFT"
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Billing incomplete");
    expect(alert).toHaveTextContent("Add at least one line item");
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("does not report a change the server did not confirm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { data: { id: "est_1", status: "DRAFT" } }),
      ),
    );
    const onStatusChange = vi.fn();
    render(
      <EstimateStatusWorkflow
        estimateId="est_1"
        status="DRAFT"
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server did not confirm the new status.",
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

// What EstimationEngine hands the page after a status change. A brand-new
// estimate saved in this session has no initialEstimateData, only the object
// the save call returned; the page must still hear the new status.
describe("estimateForParent", () => {
  it("(a) new estimate saved this session, no initial data: carries the saved id and the new status", () => {
    const saved = { id: "est_new", reportId: "rep_1", status: "DRAFT" };

    expect(estimateForParent(undefined, saved, "INTERNAL_REVIEW")).toEqual({
      id: "est_new",
      reportId: "rep_1",
      status: "INTERNAL_REVIEW",
    });
  });

  it("(b) existing estimate: keeps its fields and replaces the status", () => {
    const initial = {
      id: "est_old",
      reportId: "rep_1",
      version: 4,
      lineItems: [{ id: "li_1" }],
      status: "CLIENT_REVIEW",
    };

    expect(estimateForParent(initial, null, "APPROVED")).toEqual({
      id: "est_old",
      reportId: "rep_1",
      version: 4,
      lineItems: [{ id: "li_1" }],
      status: "APPROVED",
    });
  });

  it("(c) both a saved copy and initial data: the copy saved this session wins", () => {
    const initial = { id: "est_1", version: 1, status: "DRAFT" };
    const saved = { id: "est_1", version: 2, status: "DRAFT" };

    expect(estimateForParent(initial, saved, "INTERNAL_REVIEW")).toEqual({
      id: "est_1",
      version: 2,
      status: "INTERNAL_REVIEW",
    });
  });

  it("(d) neither: returns null", () => {
    expect(estimateForParent(undefined, null, "INTERNAL_REVIEW")).toBeNull();
    expect(estimateForParent(null, undefined, "INTERNAL_REVIEW")).toBeNull();
  });
});
