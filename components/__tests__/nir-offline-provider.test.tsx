// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// nir-offline-refresh-unhandled-rejection — refreshStatus fans out to three
// IndexedDB-backed reads via an unguarded Promise.all and is called
// fire-and-forget from the initial mount, a 30s setInterval, the online
// handler, and the SW-message handler. If any read rejects (IDB deletion,
// Safari private-mode, invalidated cached connection), the rejection must be
// swallowed so the badge reports unavailable instead of claiming synced or
// producing a recurring unhandled promise rejection every 30 seconds.

const authState = vi.hoisted(() => ({ authenticated: false }));
vi.mock("next-auth/react", () => ({ useSession: () => ({
  data: authState.authenticated ? { user: { id: "synthetic-a" } } : null,
  status: authState.authenticated ? "authenticated" : "unauthenticated",
}) }));

const getSyncStatus = vi.fn();
const getQueueStats = vi.fn();
const getQueuedEvidenceCount = vi.fn();
const getQueuedVoiceNoteCount = vi.fn();

vi.mock("@/lib/nir-sync-queue", () => ({
  getSyncStatus: () => getSyncStatus(),
  getQueueStats: () => getQueueStats(),
  initSyncOnReconnect: () => () => {},
  drainQueue: vi.fn(),
}));

vi.mock("@/lib/evidence-upload-queue", () => ({
  getQueuedEvidenceCount: (strict?: boolean) => getQueuedEvidenceCount(strict),
  initEvidenceSyncOnReconnect: () => () => {},
}));

vi.mock("@/lib/voice-note-queue", () => ({
  getQueuedVoiceNoteCount: (strict?: boolean) => getQueuedVoiceNoteCount(strict),
  initVoiceNoteSyncOnReconnect: () => () => {},
  pruneVoiceNoteQueue: vi.fn(),
}));

import {
  NirOfflineProvider,
  NirSyncStatusBadge,
} from "@/components/nir-offline-provider";
import { notifySyncQueueChanged } from "@/lib/offline/sync-status-event";

describe("NirOfflineProvider refreshStatus resilience", () => {
  let unhandled: PromiseRejectionEvent[];
  const onUnhandled = (e: PromiseRejectionEvent) => unhandled.push(e);

  beforeEach(() => {
    authState.authenticated = false;
    unhandled = [];
    window.addEventListener("unhandledrejection", onUnhandled);
    getSyncStatus.mockReset();
    getQueueStats.mockReset();
    getQueuedEvidenceCount.mockReset();
    getQueuedVoiceNoteCount.mockReset();
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", onUnhandled);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the badge at last-known-good and warns (no unhandled rejection) when an IDB read rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getSyncStatus.mockRejectedValue(new Error("IndexedDB connection invalidated"));
    getQueueStats.mockRejectedValue(new Error("db.transaction threw"));
    getQueuedEvidenceCount.mockRejectedValue(new Error("countByStatus onerror"));
    getQueuedVoiceNoteCount.mockRejectedValue(new Error("voice note count read failed"));

    render(
      <NirOfflineProvider>
        <NirSyncStatusBadge />
      </NirOfflineProvider>,
    );

    // A failed queue read must not claim that writes are synced.
    const badge = await screen.findByRole("status");
    expect(badge).toHaveAttribute("aria-label", "Sync status: Sync status unavailable");

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[NIR Offline] Failed to refresh sync status:",
        expect.any(Error),
      ),
    );
    await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Sync status unavailable"));

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
    getQueuedVoiceNoteCount.mockResolvedValue(1);

    render(
      <NirOfflineProvider>
        <NirSyncStatusBadge />
      </NirOfflineProvider>,
    );

    const badge = await screen.findByRole("status");
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Pending sync"),
    );
    // pending (2) + evidence (1) + voice notes (1) = 4
    expect(badge).toHaveTextContent("(4)");
    expect(unhandled).toHaveLength(0);
  });

  it("RA-1609: reflects pendingVoiceNotes count on its own in the badge total", async () => {
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockResolvedValue({
      pending: 0,
      failed: 0,
      conflicts: 0,
      status: "SYNCED",
    });
    getQueuedEvidenceCount.mockResolvedValue(0);
    getQueuedVoiceNoteCount.mockResolvedValue(3);

    render(
      <NirOfflineProvider>
        <NirSyncStatusBadge />
      </NirOfflineProvider>,
    );

    const badge = await screen.findByRole("status");
    await waitFor(() => expect(badge).toHaveTextContent("(3)"));
    expect(badge).toHaveAttribute("aria-label", "Sync status: Pending sync");
    expect(unhandled).toHaveLength(0);
  });

  it("shows failed saves as needing attention even when the main queue reports synced", async () => {
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockResolvedValue({ pending: 0, failed: 1, conflicts: 0, status: "SYNCED" });
    getQueuedEvidenceCount.mockResolvedValue(0);
    getQueuedVoiceNoteCount.mockResolvedValue(0);
    render(<NirOfflineProvider><NirSyncStatusBadge /></NirOfflineProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Sync needs attention"));
  });

  it("marks sync status unavailable when one upload queue cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockResolvedValue({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" });
    getQueuedEvidenceCount.mockRejectedValue(new Error("Photo queue unavailable"));
    getQueuedVoiceNoteCount.mockResolvedValue(0);
    render(<NirOfflineProvider><NirSyncStatusBadge /></NirOfflineProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Sync status unavailable"));
    expect(getQueuedEvidenceCount).toHaveBeenCalledWith(true);
    expect(getQueuedVoiceNoteCount).toHaveBeenCalledWith(true);
    expect(warn).toHaveBeenCalled();
  });

  it("moves from synced to pending and failed immediately after queue changes", async () => {
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockResolvedValue({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" });
    getQueuedEvidenceCount.mockResolvedValue(0);
    getQueuedVoiceNoteCount.mockResolvedValue(0);
    render(<NirOfflineProvider><NirSyncStatusBadge /></NirOfflineProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Synced"));

    getQueuedEvidenceCount.mockResolvedValue(1);
    notifySyncQueueChanged();
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Pending sync"));

    getQueuedEvidenceCount.mockResolvedValue(0);
    getQueueStats.mockResolvedValue({ pending: 0, failed: 1, conflicts: 0, status: "SYNCED" });
    notifySyncQueueChanged();
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Sync needs attention"));
  });

  it("does not show green for an authenticated session whose offline owner cannot be verified", async () => {
    authState.authenticated = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockResolvedValue({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" });
    getQueuedEvidenceCount.mockResolvedValue(0);
    getQueuedVoiceNoteCount.mockResolvedValue(0);

    render(<NirOfflineProvider><NirSyncStatusBadge /></NirOfflineProvider>);
    await waitFor(() => expect(getQueueStats).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Sync status unavailable"));
    expect(screen.queryByRole("status", { name: "Sync status: Synced" })).not.toBeInTheDocument();
  });

  it("does not let an older status read restore green after a queue-change event", async () => {
    let finishOldRead!: (value: { pending: number; failed: number; conflicts: number; status: string }) => void;
    getSyncStatus.mockResolvedValue("SYNCED");
    getQueueStats.mockImplementationOnce(() => new Promise((resolve) => { finishOldRead = resolve; }))
      .mockResolvedValue({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" });
    getQueuedEvidenceCount.mockResolvedValueOnce(0).mockResolvedValue(1);
    getQueuedVoiceNoteCount.mockResolvedValue(0);
    render(<NirOfflineProvider><NirSyncStatusBadge /></NirOfflineProvider>);
    await waitFor(() => expect(getQueueStats).toHaveBeenCalled());
    notifySyncQueueChanged();
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Pending sync"));
    finishOldRead({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Sync status: Pending sync");
  });
});
