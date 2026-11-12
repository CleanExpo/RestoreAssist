// @vitest-environment jsdom
/**
 * RA-8330 (crease RC-B): the badge read only the offline queue, which Save
 * Draft never uses, so it said "Synced" right after a draft failed to save.
 */
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@/lib/nir-sync-queue", () => ({
  getSyncStatus: () => Promise.resolve("SYNCED"),
  getQueueStats: () =>
    Promise.resolve({ pending: 0, failed: 0, conflicts: 0, status: "SYNCED" }),
  initSyncOnReconnect: () => () => {},
  drainQueue: vi.fn(),
}));

vi.mock("@/lib/evidence-upload-queue", () => ({
  getQueuedEvidenceCount: () => Promise.resolve(0),
  initEvidenceSyncOnReconnect: () => () => {},
}));

vi.mock("@/lib/voice-note-queue", () => ({
  getQueuedVoiceNoteCount: () => Promise.resolve(0),
  initVoiceNoteSyncOnReconnect: () => () => {},
  pruneVoiceNoteQueue: vi.fn(),
}));

import { NirOfflineProvider, NirSyncStatusBadge } from "@/components/nir-offline-provider";
import { reportDraftSave } from "@/lib/offline/draft-save-status";

function renderBadge() {
  render(
    <NirOfflineProvider>
      <NirSyncStatusBadge />
    </NirOfflineProvider>,
  );
  return screen.findByRole("status");
}

describe("sync badge after a draft save", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not say Synced after a draft save failed", async () => {
    const badge = await renderBadge();
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"),
    );

    act(() => reportDraftSave(false));

    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Draft not saved"),
    );
  });

  it("returns to Synced once a later draft save succeeds", async () => {
    const badge = await renderBadge();
    act(() => reportDraftSave(false));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Draft not saved"),
    );

    act(() => reportDraftSave(true));

    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"),
    );
  });
});
