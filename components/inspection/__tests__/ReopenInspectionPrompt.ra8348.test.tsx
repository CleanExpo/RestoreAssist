// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReopenInspectionPrompt from "../ReopenInspectionPrompt";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("ReopenInspectionPrompt reopen failure (RA-8348)", () => {
  it("shows the message from the apiError envelope instead of crashing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: "CONFLICT",
          message: "Inspection already accepted",
          eventId: "evt_1",
        },
      }),
    });

    render(
      <ReopenInspectionPrompt
        inspectionId="ins_1"
        inspectionNumber="NIR-2026-11-0001"
        status="CLOSED"
        isAdmin
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reopen job/i }));
    fireEvent.change(screen.getByLabelText(/reason for reopening/i), {
      target: { value: "Finance correction needed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm reopen/i }));

    expect(
      await screen.findByText("Inspection already accepted"),
    ).toBeInTheDocument();
  });
});
