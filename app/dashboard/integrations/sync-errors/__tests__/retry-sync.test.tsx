// @vitest-environment jsdom
/**
 * RA-8094 — Sync Errors Retry must call OAuth sync, not /api/integrations/nir-sync.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import SyncErrorsPage from "../page";

const toastError = toast.error as unknown as ReturnType<typeof vi.fn>;
const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;

const failedRow = {
  id: "log_1",
  integrationId: "int_xero",
  integration: {
    id: "int_xero",
    provider: "xero",
    name: "Xero",
    status: "CONNECTED",
  },
  syncType: "FULL",
  status: "FAILED",
  recordsProcessed: 1,
  recordsFailed: 1,
  errorMessage: "Upstream timeout",
  startedAt: "2026-10-29T12:00:00.000Z",
  completedAt: null,
};

describe("SyncErrorsPage retry (RA-8094)", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("posts to OAuth sync and shows structured error text", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/integrations/sync-errors") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            syncErrors: [failedRow],
            webhookErrors: [],
            pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
          }),
        };
      }
      if (url === "/api/integrations/oauth/xero/sync") {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: { code: "VALIDATION", message: "Reconnect Xero" },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SyncErrorsPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/oauth/xero/sync",
        expect.objectContaining({ method: "POST" }),
      );
      expect(toastError).toHaveBeenCalledWith(
        "Retry failed: Reconnect Xero",
      );
    });

    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).includes("/api/integrations/nir-sync"),
      ),
    ).toBe(false);
  });
});
