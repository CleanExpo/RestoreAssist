// @vitest-environment jsdom
/**
 * RA-8447 — the webhooks page must still list events and open the payload
 * viewer when the list API returns only its selected fields (no signature,
 * externalEventId, integrationId or updatedAt).
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({ default: toast }));

import WebhookLogsPage from "../page";

// Exactly the shape app/api/webhooks/logs/route.ts now selects.
const listResponse = {
  events: [
    {
      id: "evt-1",
      provider: "XERO",
      eventType: "INVOICE.UPDATED",
      status: "FAILED",
      retryCount: 2,
      errorMessage: "Xero rejected the update",
      processedAt: null,
      createdAt: new Date().toISOString(),
      payload: { invoiceId: "inv-9-marker" },
      integration: { provider: "XERO", status: "CONNECTED" },
    },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
};

describe("WebhookLogsPage (RA-8447)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => listResponse,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("lists events from the selected fields and opens the payload viewer", async () => {
    render(<WebhookLogsPage />);

    expect(await screen.findByText("INVOICE.UPDATED")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.queryByText(/inv-9-marker/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /payload/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/inv-9-marker/)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Xero rejected the update"),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
