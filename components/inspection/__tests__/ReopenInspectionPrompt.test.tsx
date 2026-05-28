// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReopenInspectionPrompt from "../ReopenInspectionPrompt";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const baseProps = {
  inspectionId: "ins_1",
  inspectionNumber: "NIR-2026-05-0001",
  status: "CLOSED",
  isAdmin: true,
  onReopened: vi.fn(),
};

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  baseProps.onReopened.mockReset();
});

describe("ReopenInspectionPrompt", () => {
  it("does not render for non-admin users", () => {
    render(<ReopenInspectionPrompt {...baseProps} isAdmin={false} />);

    expect(
      screen.queryByTestId("reopen-inspection-prompt"),
    ).not.toBeInTheDocument();
  });

  it("does not render for non-terminal statuses", () => {
    render(<ReopenInspectionPrompt {...baseProps} status="IN_BILLING" />);

    expect(
      screen.queryByTestId("reopen-inspection-prompt"),
    ).not.toBeInTheDocument();
  });

  it("requires a reason before confirming reopen", async () => {
    render(<ReopenInspectionPrompt {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Reopen job/i }));

    const confirm = await screen.findByRole("button", {
      name: /Confirm reopen/i,
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason for reopening/i), {
      target: { value: "valid finance correction" },
    });
    expect(confirm).not.toBeDisabled();
  });

  it("posts the reason and calls onReopened on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { previousStatus: "CLOSED", newStatus: "IN_BILLING" },
      }),
    });

    render(<ReopenInspectionPrompt {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Reopen job/i }));
    fireEvent.change(await screen.findByLabelText(/Reason for reopening/i), {
      target: { value: "Finance correction after invoice dispute" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm reopen/i }));

    await waitFor(() => {
      expect(baseProps.onReopened).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inspections/ins_1/reopen",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reason: "Finance correction after invoice dispute",
        }),
      }),
    );
  });

  it("renders API errors without calling onReopened", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "Inspection status drifted" }),
    });

    render(<ReopenInspectionPrompt {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Reopen job/i }));
    fireEvent.change(await screen.findByLabelText(/Reason for reopening/i), {
      target: { value: "Finance correction after invoice dispute" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm reopen/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Inspection status drifted/i,
      );
    });
    expect(baseProps.onReopened).not.toHaveBeenCalled();
  });
});
