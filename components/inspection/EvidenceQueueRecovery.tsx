"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQueuedEvidenceForInspection,
  retryQueuedEvidence,
  type EvidenceQueueEntry,
} from "@/lib/evidence-upload-queue";
import { SYNC_QUEUE_CHANGED_EVENT } from "@/lib/offline/sync-status-event";
import { OFFLINE_CONTEXT_EVENT } from "@/lib/offline/account-boundary";

function rejectedStatus(status?: number): boolean {
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function rejectionMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `Upload needs account verification (HTTP ${status}). Sign in as the original account before retrying. The saved copy remains on this device.`;
  }
  if (status === 409) {
    return "Upload conflict (HTTP 409). Check the job photo list and keep this saved copy; do not choose the same photo again until the conflict is resolved.";
  }
  if (status === 413) {
    return "Photo is too large (HTTP 413). Save a backup and choose a smaller copy. This saved copy remains on this device.";
  }
  return `Upload rejected (HTTP ${status}). Save a backup and check the photo format or job details. This saved copy remains on this device.`;
}

function readbackMessage(status?: number): string {
  if (status === 401 || status === 403) return `Upload accepted, but account verification blocked job readback (HTTP ${status}). Sign in as the original account and retry; the saved copy remains on this device.`;
  return `Upload may have succeeded, but this photo is not verified in the job list${status ? ` (readback HTTP ${status})` : ""}. Keep the saved copy and retry verification before choosing the same photo again.`;
}

function entryStatusMessage(entry: EvidenceQueueEntry): string {
  if (entry.readbackPending && rejectedStatus(entry.lastStatus)) {
    return `${readbackMessage(entry.readbackStatus)} A later upload retry was rejected (HTTP ${entry.lastStatus}). Save a backup and check the job photo list and photo details before retrying.`;
  }
  if (entry.readbackPending) return readbackMessage(entry.readbackStatus);
  if (rejectedStatus(entry.lastStatus)) return rejectionMessage(entry.lastStatus!);
  if (entry.retryCount >= 5) return `Needs attention${entry.lastStatus ? ` (HTTP ${entry.lastStatus})` : ""}. Save a backup and check the job photo list.`;
  return "Waiting to sync";
}

/** Keeps parked photo uploads visible on their job. Existing blobs remain in
 * IndexedDB until an owner-verified upload succeeds; this UI never deletes. */
export function EvidenceQueueRecovery({ inspectionId, onSynced }: { inspectionId: string; onSynced?: () => void }) {
  const [entries, setEntries] = useState<EvidenceQueueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const previousIds = useRef<string[] | null>(null);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refresh = useCallback(async (): Promise<EvidenceQueueEntry[] | undefined> => {
    try {
      const current = await getQueuedEvidenceForInspection(inspectionId);
      const ids = current.map((entry) => entry.id);
      if (previousIds.current?.some((id) => !ids.includes(id))) onSyncedRef.current?.();
      previousIds.current = ids;
      setEntries(current);
      setError(null);
      return current;
    } catch (cause) {
      previousIds.current = null;
      setEntries([]);
      setError(cause instanceof Error && /verify your account/i.test(cause.message)
        ? "Verify your account to view saved device photos. Existing uploads remain on this device."
        : "Could not read saved photo uploads on this device. Existing uploads were preserved.");
    }
  }, [inspectionId]);

  useEffect(() => {
    void refresh();
    const contextChanged = () => {
      previousIds.current = null;
      void refresh();
    };
    window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener(OFFLINE_CONTEXT_EVENT, contextChanged);
    return () => {
      window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener(OFFLINE_CONTEXT_EVENT, contextChanged);
    };
  }, [refresh]);

  async function retry(entry: EvidenceQueueEntry) {
    setRetrying(entry.id);
    try {
      const uploaded = await retryQueuedEvidence(entry.id, inspectionId);
      const current = await refresh();
      const stillQueued = current?.find((row) => row.id === entry.id);
      if (uploaded === 0 && stillQueued) {
        setError(entryStatusMessage(stillQueued));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry failed. The photo remains saved on this device.");
    } finally {
      setRetrying(null);
    }
  }

  function saveBackup(entry: EvidenceQueueEntry) {
    const url = URL.createObjectURL(entry.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = entry.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (!error && entries.length === 0) return null;
  return (
    <section aria-label="Photos awaiting upload" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <h4 className="font-semibold">Photos saved on this device ({entries.length})</h4>
      <p className="mt-1">These are not attached to the job yet. Keep this device until each upload appears in the photo list.</p>
      {entries.length > 0 && !navigator.locks?.request && <p className="mt-1">Automatic queue replay is unavailable in this browser. Save a backup, upload it from the job photo screen, and confirm it appears there before clearing this device.</p>}
      {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded border border-amber-500/20 p-2">
            <span className="min-w-0 flex-1 truncate">{entry.filename}</span>
            <span>{entryStatusMessage(entry)}</span>
            <button type="button" onClick={() => void retry(entry)} disabled={retrying !== null || !navigator.onLine} className="rounded border px-2 py-1 disabled:opacity-50">
              {retrying === entry.id ? "Retrying…" : "Retry upload"}
            </button>
            <button type="button" onClick={() => saveBackup(entry)} className="rounded border px-2 py-1">Save backup</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
