// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { InboundJobAlert } from "../InboundJobAlert";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const job = {
  id: "ins_1",
  inspectionNumber: "NIR-2026-11-0001",
  propertyAddress: "12 Example Street",
  inspectionDate: "2026-11-01T00:00:00.000Z",
  claimType: null,
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

describe("InboundJobAlert accept failure (RA-8348)", () => {
  it("shows the message from the apiError envelope instead of crashing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("inbound-jobs")) {
        return { ok: true, status: 200, json: async () => ({ jobs: [job] }) };
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "CONFLICT",
            message: "Inspection already accepted",
            eventId: "evt_1",
          },
        }),
      };
    });

    render(<InboundJobAlert />);
    const accept = await screen.findByRole("button", {
      name: /accept and start inspection/i,
    });
    fireEvent.click(accept);

    expect(
      await screen.findByText("Inspection already accepted"),
    ).toBeInTheDocument();
    await waitFor(() => expect(accept).not.toBeDisabled());
  });
});
