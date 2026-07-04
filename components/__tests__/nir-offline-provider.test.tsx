// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// nir-offline-refresh-unhandled-rejection — refreshStatus fans out to three
// IndexedDB-backed reads via an unguarded Promise.all and is called
// fire-and-forget from the initial mount, a 30s setInterval, the online
// handler, and the SW-message handler. If any read rejects (IDB deletion,
// Safari private-mode, invalidated cached connection), the rejection must be
// swallowed so the badge stays at its last-known-good state instead of
// producing a recurring unhandled promise rejection every 30 seconds.

const getSyncStatus = vi.fn();
const getQueueStats = vi.fn();
const getQueuedEvidenceCount = vi.fn();

vi.mock("@/lib/nir-sync-queue", () => ({
  getSyncStatus: () => getSyncStatus(),
  getQueueStats: () => getQueueStats(),
  initSyncOnReconnect: () => () => {},
  drainQueue: vi.fn(),
}));

vi.mock("@/lib/evidence-upload-queue", () => ({
  getQueuedEvidenceCount: () => getQueuedEvidenceCount(),
  initEvidenceSyncOnReconnect: () => () => {},
}));

import {
  NirOfflineProvider,
  NirSyncStatusBadge,
} from "@/components/nir-offline-provider";

describe("NirOfflineProvider refreshStatus resilience", () => {
  let unhandled: PromiseRejectionEvent[];
  const onUnhandled = (e: PromiseRejectionEvent) => unhandled.push(e);

  beforeEach(() => {
    unhandled = [];
    window.addEventListener("unhandledrejection", onUnhandled);
    getSyncStatus.mockReset();
    getQueueStats.mockReset();
    getQueuedEvidenceCount.mockReset();
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", onUnhandled);
    vi.restoreAllMocks();
  });

  it("keeps the badge at last-known-good and warns (no unhandled rejection) when an IDB read rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getSyncStatus.mockRejectedValue(new Error("IndexedDB connection invalidated"));
    getQueueStats.mockRejectedValue(new Error("db.transaction threw"));
    getQueuedEvidenceCount.mockRejectedValue(new Error("countByStatus onerror"));

    render(
      <NirOfflineProvider>
        <NirSyncStatusBadge />
      </NirOfflineProvider>,
    );

    // Badge must remain at the default known-good "Offline" state.
    const badge = await screen.findByRole("status");
    expect(badge).toHaveAttribute("aria-label", "Sync status: Offline");

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[NIR Offline] Failed to refresh sync status:",
        expect.any(Error),
      ),
    );

    // Allow any dangling microtasks/rejections to flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).toHaveLength(0);
  });

  it("renders the resolved status when the IDB reads succeed", async () => {
    getSyncStatus.mockResolvedValue("PENDING_SYNC");
    getQueueStats.mockResolvedValue({
      pending: 2,
      failed: 0,
      conflicts: 0,
      status: "PENDING_SYNC",
    });
    getQueuedEvidenceCount.mockResolvedValue(1);

    render(
      <NirOfflineProvider>
        <NirSyncStatusBadge />
      </NirOfflineProvider>,
    );

    const badge = await screen.findByRole("status");
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Pending sync"),
    );
    // pending (2) + evidence (1) = 3
    expect(badge).toHaveTextContent("(3)");
    expect(unhandled).toHaveLength(0);
  });
});
