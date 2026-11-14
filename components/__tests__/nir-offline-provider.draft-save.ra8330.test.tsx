// @vitest-environment jsdom
/**
 * RA-8330 (crease RC-B): the badge read only the offline queue, which Save
 * Draft never uses, so it said "Synced" right after a draft failed to save.
 */
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockSession =
  | { data: null; status: "unauthenticated" | "loading" }
  | { data: { user: { id: string } }; status: "authenticated" };

const auth = vi.hoisted(() => ({
  session: { data: null, status: "unauthenticated" } as MockSession,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => auth.session,
}));

vi.mock("@/lib/offline/account-boundary", () => ({
  OFFLINE_CONTEXT_EVENT: "restoreassist-offline-context",
  clearOfflineContext: () => {},
  setOfflineSession: () => {},
  listenForOfflineInvalidation: () => () => {},
  // The owner is verified exactly while the session is authenticated, so the
  // badge reads "Synced" whenever no draft failure is showing.
  getOfflineOwner: () =>
    auth.session.status === "authenticated" ? auth.session.data.user.id : null,
  refreshOfflineOwner: () => Promise.resolve(null),
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

const tree = () => (
  <NirOfflineProvider>
    <NirSyncStatusBadge />
  </NirOfflineProvider>
);

function renderBadge() {
  render(tree());
  return screen.findByRole("status");
}

const signedIn = (id: string): MockSession => ({
  data: { user: { id } },
  status: "authenticated",
});

describe("sync badge after a draft save", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.session = { data: null, status: "unauthenticated" };
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

/**
 * The failure belongs to the account that made the save. next-auth `update()`
 * sets the status to "loading" while it refreshes, so the user id is briefly
 * absent even though the account has not changed.
 */
describe("draft-save failure across session changes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.session = signedIn("user-a");
  });

  async function failDraftAsUserA() {
    const { rerender } = render(tree());
    const badge = await screen.findByRole("status");
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"),
    );
    act(() => reportDraftSave(false));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Draft not saved"),
    );
    const moveTo = (next: MockSession) => {
      auth.session = next;
      rerender(tree());
    };
    return { badge, moveTo };
  }

  it("keeps the failure through a same-account session refresh", async () => {
    const { badge, moveTo } = await failDraftAsUserA();

    moveTo({ data: null, status: "loading" });
    moveTo(signedIn("user-a"));

    // Give any effect a chance to run before asserting the flag held.
    await act(async () => {});
    expect(badge).toHaveAttribute("aria-label", "Sync status: Draft not saved");
  });

  it("clears the failure when a different account signs in", async () => {
    const { badge, moveTo } = await failDraftAsUserA();

    moveTo({ data: null, status: "loading" });
    moveTo(signedIn("user-b"));

    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"),
    );
  });

  it("clears the failure when the user signs out", async () => {
    const { badge, moveTo } = await failDraftAsUserA();

    moveTo({ data: null, status: "unauthenticated" });

    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"),
    );
  });
});
