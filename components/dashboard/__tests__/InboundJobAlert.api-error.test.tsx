// @vitest-environment jsdom
/**
 * RA-8348: the accept route answers a two-tabs race with apiError 409
 * `{ error: { code, message, eventId } }`. InboundJobAlert used to put that
 * object into state and render it as a React child, which crashed the
 * dashboard home to the error boundary.
 */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboundJobAlert } from "../InboundJobAlert";

const job = {
  id: "ins_1",
  inspectionNumber: "NIR-2026-11-0001",
  propertyAddress: "1 Test Street, Brisbane QLD 4000",
  inspectionDate: "2026-11-12T00:00:00.000Z",
  claimType: "WATER",
  insurer: null,
  policyHolder: null,
  claimNumber: null,
};

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("InboundJobAlert accept failure", () => {
  it("shows the apiError message and keeps the banner on screen", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [job] }),
      })
      .mockResolvedValueOnce({
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

    render(<InboundJobAlert />);

    fireEvent.click(await screen.findByRole("button", { name: /Accept/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Inspection already accepted",
      );
    });
    expect(screen.getByTestId("inbound-job-alert")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/inspections/ins_1/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
