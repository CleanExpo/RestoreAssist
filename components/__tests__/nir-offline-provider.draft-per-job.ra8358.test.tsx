// @vitest-environment jsdom
/**
 * RA-8358: a draft-save failure belongs to one inspection. A later success on
 * a different inspection must not clear it.
 * RA-8360: a failure reported after sign-out must not carry into the next
 * account.
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
import * as draftStatus from "@/lib/offline/draft-save-status";
import type { DraftRef } from "@/lib/offline/draft-save-status";

const { reportDraftSave } = draftStatus;
// Optional call so these tests fail on their assertions, not on a missing
// export, when run against the code before RA-8358.
const setActiveDraft = (draft: DraftRef | null) => draftStatus.setActiveDraft?.(draft);

const A = { inspectionId: "insp-a", formKey: "form-a" };
const B = { inspectionId: "insp-b", formKey: "form-b" };

const tree = () => (
  <NirOfflineProvider>
    <NirSyncStatusBadge />
  </NirOfflineProvider>
);

const signedIn = (id: string): MockSession => ({
  data: { user: { id } },
  status: "authenticated",
});

async function renderSynced() {
  const utils = render(tree());
  const badge = await screen.findByRole("status");
  await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"));
  return { badge, ...utils };
}

describe("draft-save failure is kept per inspection (RA-8358)", () => {
  beforeEach(() => {
    auth.session = signedIn("user-a");
    setActiveDraft(null);
  });

  it("a failure on A then a success on B still shows A unsaved", async () => {
    const { badge } = await renderSynced();

    act(() => reportDraftSave(false, A, "user-a"));
    act(() => reportDraftSave(true, B, "user-a"));

    await act(async () => {});
    expect(badge).toHaveAttribute("aria-label", "Sync status: 1 draft not saved");
    expect(screen.getByRole("link", { name: "1 draft not saved" })).toHaveAttribute(
      "href",
      "/dashboard/inspections/new?draft=insp-a",
    );
  });

  it("a success on A clears only A", async () => {
    const { badge } = await renderSynced();

    act(() => reportDraftSave(false, A, "user-a"));
    act(() => reportDraftSave(false, B, "user-a"));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: 2 drafts not saved"),
    );

    act(() => reportDraftSave(true, A, "user-a"));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: 1 draft not saved"),
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/inspections/new?draft=insp-b",
    );

    act(() => reportDraftSave(true, B, "user-a"));
    await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"));
  });

  it("on an inspection, shows that inspection's state, not another's", async () => {
    act(() => setActiveDraft(A));
    const { badge } = await renderSynced();

    act(() => reportDraftSave(false, B, "user-a"));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: 1 draft not saved"),
    );

    act(() => reportDraftSave(false, A, "user-a"));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: Draft not saved"),
    );
  });

  it("a failure before the inspection existed clears when that form saves", async () => {
    const { badge } = await renderSynced();
    const unsaved = { inspectionId: null, formKey: "form-new" };

    act(() => reportDraftSave(false, unsaved, "user-a"));
    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: 1 draft not saved"),
    );

    // The retry created the inspection and saved everything.
    act(() => reportDraftSave(true, { inspectionId: "insp-new", formKey: "form-new" }, "user-a"));
    await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"));
  });
});

describe("draft-save failure across sign-out (RA-8360)", () => {
  beforeEach(() => {
    auth.session = signedIn("user-a");
    setActiveDraft(null);
  });

  it("a failure that lands after sign-out does not show for the next user", async () => {
    const { badge, rerender } = await renderSynced();
    const moveTo = (next: MockSession) => {
      auth.session = next;
      rerender(tree());
    };

    moveTo({ data: null, status: "unauthenticated" });
    moveTo({ data: null, status: "loading" });
    // User A's save was still in flight and fails now, with no account known.
    act(() => reportDraftSave(false, A, null));
    moveTo(signedIn("user-b"));

    await act(async () => {});
    await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"));
  });

  it("a late failure tagged with the old user never shows for the new user", async () => {
    const { badge, rerender } = await renderSynced();
    const moveTo = (next: MockSession) => {
      auth.session = next;
      rerender(tree());
    };

    moveTo({ data: null, status: "loading" });
    moveTo(signedIn("user-b"));
    act(() => reportDraftSave(false, A, "user-a"));

    await act(async () => {});
    await waitFor(() => expect(badge).toHaveAttribute("aria-label", "Sync status: Synced"));
  });

  it("keeps a failure from first page load through the first sign-in", async () => {
    auth.session = { data: null, status: "loading" };
    const utils = render(tree());
    const badge = await screen.findByRole("status");

    act(() => reportDraftSave(false, A, null));
    auth.session = signedIn("user-a");
    utils.rerender(tree());

    await waitFor(() =>
      expect(badge).toHaveAttribute("aria-label", "Sync status: 1 draft not saved"),
    );
  });
});
