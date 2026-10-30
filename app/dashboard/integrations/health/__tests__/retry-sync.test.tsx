// @vitest-environment jsdom
/**
 * RA-8094 — Integration Health Retry must call OAuth sync and surface errors.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import IntegrationHealthPage from "../page";

const toastError = toast.error as unknown as ReturnType<typeof vi.fn>;

describe("IntegrationHealthPage retry (RA-8094)", () => {
  beforeEach(() => {
    toastError.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("retries via OAuth sync and shows server message on 400", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/integrations/health") {
        return {
          ok: true,
          json: async () => ({
            status: "degraded",
            checks: [],
            summary: {
              total: 1,
              passed: 0,
              warned: 1,
              failed: 0,
              unverified: 0,
            },
            timestamp: new Date().toISOString(),
          }),
        };
      }
      if (url === "/api/integrations/metrics") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            integrations: {
              total: 1,
              connected: 1,
              disconnected: 0,
              error: 0,
              byProvider: {
                xero: {
                  status: "ERROR",
                  lastSyncAt: null,
                  totalSyncs: 3,
                  successfulSyncs: 0,
                  failedSyncs: 3,
                  successRate: 0,
                },
              },
            },
            syncs: {
              total: 3,
              successful: 0,
              failed: 3,
              successRate: 0,
              avgDurationMs: 0,
            },
            circuitBreakers: [],
            rateLimiters: [],
            timestamp: new Date().toISOString(),
          }),
        };
      }
      if (url === "/api/integrations/sync-errors") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            syncErrors: [],
            webhookErrors: [],
          }),
        };
      }
      if (url === "/api/integrations/oauth/xero/sync") {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "OAuth token revoked" },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntegrationHealthPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Retry Failed Syncs/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Retry Failed Syncs/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/oauth/xero/sync",
        expect.objectContaining({ method: "POST" }),
      );
      expect(toastError).toHaveBeenCalledWith(
        "Retry failed: OAuth token revoked",
      );
    });
  });
});
