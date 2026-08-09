// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateStatusWorkflow } from "../EstimateStatusWorkflow";

const onTransition = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  onTransition.mockReset();
});

describe("EstimateStatusWorkflow", () => {
  it("renders only transitions legal from the current status", () => {
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="DRAFT"
        onTransition={onTransition}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Withdraw Estimate" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Approve with Client Evidence/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Lock Estimate/i }),
    ).not.toBeInTheDocument();
  });

  it("sends a legal transition to the existing status API and trusts its response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: "estimate_1", status: "INTERNAL_REVIEW", version: 2 },
        warnings: [{ code: "REVIEW", message: "Check mobilisation" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="DRAFT"
        onTransition={onTransition}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/estimates/estimate_1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INTERNAL_REVIEW" }),
    });
    expect(onTransition).toHaveBeenCalledWith({
      id: "estimate_1",
      status: "INTERNAL_REVIEW",
      version: 2,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Check mobilisation");
  });

  it("shows the active transition and disables every action while awaiting the backend", async () => {
    let resolveResponse: ((response: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    );
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="DRAFT"
        onTransition={onTransition}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    expect(
      await screen.findByRole("button", { name: "Updating…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Withdraw Estimate" }),
    ).toBeDisabled();

    resolveResponse?.({
      ok: true,
      json: async () => ({
        data: { id: "estimate_1", status: "INTERNAL_REVIEW" },
      }),
    });
    await waitFor(() => expect(onTransition).toHaveBeenCalledTimes(1));
  });

  it("keeps CLIENT_REVIEW unchanged when backend approval provenance is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: "CONFLICT",
            message:
              "Client cost approval is required before the estimate can be approved",
          },
        }),
      }),
    );
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="CLIENT_REVIEW"
        onTransition={onTransition}
      />,
    );

    expect(
      screen.getByText(/backend finds a matching approved client response/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Approve with Client Evidence" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Client cost approval is required",
      ),
    );
    expect(onTransition).not.toHaveBeenCalled();
    expect(screen.getByText("CLIENT REVIEW")).toBeInTheDocument();
  });

  it("does not accept a successful response that fails to confirm the requested status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: "estimate_1", status: "CLIENT_REVIEW" },
        }),
      }),
    );
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="CLIENT_REVIEW"
        onTransition={onTransition}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Approve with Client Evidence" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "server did not confirm",
      ),
    );
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("does not call the status API when saving current edits fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="DRAFT"
        beforeTransition={vi.fn().mockResolvedValue(false)}
        onTransition={onTransition}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Save the current estimate successfully",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("shows completeness blockers and restores controls after rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { code: "VALIDATION", message: "Billing incomplete" },
          blockers: [
            { code: "NO_LINE_ITEMS", message: "Add at least one line item." },
          ],
        }),
      }),
    );
    render(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="DRAFT"
        onTransition={onTransition}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Add at least one line item.",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Submit for Internal Review" }),
    ).toBeEnabled();
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("renders no mutation control before save or from a terminal status", () => {
    const { rerender } = render(
      <EstimateStatusWorkflow
        estimateId={null}
        status="DRAFT"
        onTransition={onTransition}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Save the estimate");
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    rerender(
      <EstimateStatusWorkflow
        estimateId="estimate_1"
        status="LOCKED"
        onTransition={onTransition}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No further status transitions",
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
