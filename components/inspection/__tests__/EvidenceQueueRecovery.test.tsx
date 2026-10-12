// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getQueuedEvidenceForInspection = vi.fn();
const retryQueuedEvidence = vi.fn();
vi.mock("@/lib/evidence-upload-queue", () => ({
  getQueuedEvidenceForInspection: (...args: unknown[]) => getQueuedEvidenceForInspection(...args),
  retryQueuedEvidence: (...args: unknown[]) => retryQueuedEvidence(...args),
}));

import { EvidenceQueueRecovery } from "../EvidenceQueueRecovery";
import { SYNC_QUEUE_CHANGED_EVENT } from "@/lib/offline/sync-status-event";
import { OFFLINE_CONTEXT_EVENT } from "@/lib/offline/account-boundary";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("EvidenceQueueRecovery", () => {
  it("describes an accepted upload with failed job readback without blaming the file format", async () => {
    getQueuedEvidenceForInspection.mockResolvedValue([{ id: "ev-1", filename: "room.webp", retryCount: 1, readbackPending: true, readbackStatus: 404, blob: new Blob(["synthetic"]) }]);
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    expect(await screen.findByText(/not verified in the job list/)).toBeInTheDocument();
    expect(screen.queryByText(/photo format/i)).not.toBeInTheDocument();
  });
  it("shows the later HTTP rejection while preserving earlier unverified upload state", async () => {
    getQueuedEvidenceForInspection.mockResolvedValue([{ id: "ev-1", filename: "room.webp", retryCount: 2, readbackPending: true, readbackStatus: 404, lastStatus: 400, blob: new Blob(["synthetic"]) }]);
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    expect(await screen.findByText(/not verified in the job list.*later upload retry was rejected \(HTTP 400\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save backup" })).toBeEnabled();
    if (!navigator.locks?.request) expect(screen.getByText(/Automatic queue replay is unavailable/)).toBeInTheDocument();
  });
  it("shows parked job photos and explicitly retries without deleting the local entry", async () => {
    getQueuedEvidenceForInspection.mockResolvedValue([{ id: "ev-1", filename: "room.webp", retryCount: 5, lastStatus: 400, blob: new Blob(["synthetic"]) }]);
    retryQueuedEvidence.mockResolvedValue(0);
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    expect(await screen.findByText("room.webp")).toBeInTheDocument();
    expect(screen.getByText(/Upload rejected \(HTTP 400\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() => expect(retryQueuedEvidence).toHaveBeenCalledWith("ev-1", "job-1"));
    expect(screen.getByText("room.webp")).toBeInTheDocument();
  });

  it("shows a rejected first replay immediately instead of calling it waiting", async () => {
    getQueuedEvidenceForInspection
      .mockResolvedValueOnce([{ id: "ev-1", filename: "room.webp", retryCount: 0, blob: new Blob(["synthetic"]) }])
      .mockResolvedValue([{ id: "ev-1", filename: "room.webp", retryCount: 1, lastStatus: 413, blob: new Blob(["synthetic"]) }]);
    retryQueuedEvidence.mockResolvedValue(0);
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    await screen.findByText("Waiting to sync");
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/HTTP 413.*Save a backup/i);
    expect(screen.getByRole("button", { name: "Save backup" })).toBeEnabled();
    expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
  });

  it.each([
    { status: 401, message: /Sign in as the original account/i },
    { status: 403, message: /Sign in as the original account/i },
    { status: 409, message: /do not choose the same photo again/i },
  ])("gives the correct remedy for HTTP $status without suggesting a new upload", async ({ status, message }) => {
    getQueuedEvidenceForInspection.mockResolvedValue([{ id: "ev-1", filename: "room.webp", retryCount: 1, lastStatus: status, blob: new Blob(["synthetic"]) }]);
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/choose a supported photo/i)).not.toBeInTheDocument();
  });

  it("reports an unreadable device queue rather than showing a false empty state", async () => {
    getQueuedEvidenceForInspection.mockRejectedValue(new Error("IndexedDB unavailable"));
    render(<EvidenceQueueRecovery inspectionId="job-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/existing uploads were preserved/i);
  });

  it("hides owner-scoped filenames but shows account verification when offline identity is lost", async () => {
    getQueuedEvidenceForInspection
      .mockResolvedValueOnce([{ id: "ev-1", filename: "private-room.webp", retryCount: 0 }])
      .mockRejectedValue(new Error("Verify your account to view saved device photos"));
    const onSynced = vi.fn();
    render(<EvidenceQueueRecovery inspectionId="job-1" onSynced={onSynced} />);
    await screen.findByText("private-room.webp");
    window.dispatchEvent(new Event(OFFLINE_CONTEXT_EVENT));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Verify your account/);
    expect(screen.queryByText("private-room.webp")).not.toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
  });

  it("refreshes the job photo list when a queued row disappears after sync", async () => {
    getQueuedEvidenceForInspection.mockResolvedValueOnce([{ id: "ev-1", filename: "room.webp", retryCount: 0 }]).mockResolvedValueOnce([]);
    const onSynced = vi.fn();
    render(<EvidenceQueueRecovery inspectionId="job-1" onSynced={onSynced} />);
    await screen.findByText("room.webp");
    window.dispatchEvent(new Event(SYNC_QUEUE_CHANGED_EVENT));
    await waitFor(() => expect(onSynced).toHaveBeenCalledTimes(1));
  });
});
