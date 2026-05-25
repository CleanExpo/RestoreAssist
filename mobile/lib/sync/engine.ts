import { useCallback, useEffect, useRef, useState } from "react";
import * as SQLite from "expo-sqlite";
import { useAppStore } from "@/lib/store";
import type { OfflineMutationType } from "@/shared/types";

export type SyncStatus = "idle" | "syncing" | "error";
export type QueuedMutationStatus = "pending" | "processing" | "failed";

export interface QueuedMutation {
  id: string;
  type: OfflineMutationType;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  body: string;
  inspectionId: string | null;
  status: QueuedMutationStatus;
  retryCount: number;
  queuedAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
}

interface QueueMutationInput {
  mutationId?: string;
  type: OfflineMutationType;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  body: string;
  inspectionId?: string | null;
}

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://restoreassist.app";
const DB_NAME = "restoreassist-offline.db";
const MAX_RETRY_COUNT = 5;
const STALE_PROCESSING_MS = 2 * 60 * 1000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function createMutationId(): string {
  return `ra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_mutations (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          body TEXT NOT NULL,
          inspectionId TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          retryCount INTEGER NOT NULL DEFAULT 0,
          queuedAt TEXT NOT NULL,
          lastAttemptAt TEXT,
          lastError TEXT
        );
        CREATE INDEX IF NOT EXISTS offline_mutations_status_idx
          ON offline_mutations(status, queuedAt);
        CREATE INDEX IF NOT EXISTS offline_mutations_inspection_idx
          ON offline_mutations(inspectionId, queuedAt);
      `);
      return db;
    });
  }

  return dbPromise;
}

export async function queueJsonMutation(
  input: QueueMutationInput,
): Promise<QueuedMutation> {
  const db = await getDb();
  const mutation: QueuedMutation = {
    id: input.mutationId ?? createMutationId(),
    type: input.type,
    endpoint: input.endpoint,
    method: input.method,
    body: input.body,
    inspectionId: input.inspectionId ?? null,
    status: "pending",
    retryCount: 0,
    queuedAt: new Date().toISOString(),
    lastAttemptAt: null,
    lastError: null,
  };

  try {
    await db.runAsync(
      `
        INSERT INTO offline_mutations (
          id, type, endpoint, method, body, inspectionId, status,
          retryCount, queuedAt, lastAttemptAt, lastError
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      mutation.id,
      mutation.type,
      mutation.endpoint,
      mutation.method,
      mutation.body,
      mutation.inspectionId,
      mutation.status,
      mutation.retryCount,
      mutation.queuedAt,
      mutation.lastAttemptAt,
      mutation.lastError,
    );
  } catch (error) {
    const existing = await getQueuedMutation(mutation.id);
    if (existing) return existing;
    throw error;
  }

  await refreshQueueSnapshot();
  return mutation;
}

export async function getQueuedMutation(
  id: string,
): Promise<QueuedMutation | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<QueuedMutation>(
      "SELECT * FROM offline_mutations WHERE id = ?",
      id,
    )) ?? null
  );
}

export async function listQueuedMutations(
  status?: QueuedMutationStatus,
): Promise<QueuedMutation[]> {
  const db = await getDb();
  if (status) {
    return db.getAllAsync<QueuedMutation>(
      "SELECT * FROM offline_mutations WHERE status = ? ORDER BY queuedAt ASC",
      status,
    );
  }

  return db.getAllAsync<QueuedMutation>(
    "SELECT * FROM offline_mutations ORDER BY queuedAt ASC",
  );
}

export async function getQueueCounts(): Promise<{
  pending: number;
  failed: number;
}> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: string; count: number }>(
    "SELECT status, COUNT(*) as count FROM offline_mutations GROUP BY status",
  );

  return rows.reduce(
    (acc, row) => {
      if (row.status === "pending" || row.status === "processing") {
        acc.pending += row.count;
      }
      if (row.status === "failed") acc.failed += row.count;
      return acc;
    },
    { pending: 0, failed: 0 },
  );
}

export async function refreshQueueSnapshot(): Promise<void> {
  const counts = await getQueueCounts();
  const snapshot: {
    queuedMutationCount: number;
    failedMutationCount: number;
    syncError?: string | null;
  } = {
    queuedMutationCount: counts.pending,
    failedMutationCount: counts.failed,
  };
  if (counts.failed === 0) snapshot.syncError = null;
  useAppStore.getState().setSyncSnapshot(snapshot);
}

async function recoverStaleProcessingRows(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  await db.runAsync(
    `
      UPDATE offline_mutations
      SET status = 'pending',
          lastError = 'Recovered after interrupted sync'
      WHERE status = 'processing'
        AND (lastAttemptAt IS NULL OR lastAttemptAt < ?)
    `,
    cutoff,
  );
}

async function markAttempt(entry: QueuedMutation): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `
      UPDATE offline_mutations
      SET status = 'processing', lastAttemptAt = ?, lastError = NULL
      WHERE id = ?
    `,
    new Date().toISOString(),
    entry.id,
  );
}

async function markSynced(entry: QueuedMutation): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM offline_mutations WHERE id = ?", entry.id);
}

async function markRetry(
  entry: QueuedMutation,
  message: string,
): Promise<void> {
  const db = await getDb();
  const nextRetryCount = entry.retryCount + 1;
  const nextStatus = nextRetryCount >= MAX_RETRY_COUNT ? "failed" : "pending";

  await db.runAsync(
    `
      UPDATE offline_mutations
      SET status = ?, retryCount = ?, lastAttemptAt = ?, lastError = ?
      WHERE id = ?
    `,
    nextStatus,
    nextRetryCount,
    new Date().toISOString(),
    message.slice(0, 500),
    entry.id,
  );
}

async function markFailed(
  entry: QueuedMutation,
  message: string,
): Promise<void> {
  const db = await getDb();
  const nextRetryCount = Math.min(entry.retryCount + 1, MAX_RETRY_COUNT);
  await db.runAsync(
    `
      UPDATE offline_mutations
      SET status = 'failed', retryCount = ?, lastAttemptAt = ?, lastError = ?
      WHERE id = ?
    `,
    nextRetryCount,
    new Date().toISOString(),
    message.slice(0, 500),
    entry.id,
  );
}

export async function replayQueuedMutations(
  apiBase = API_BASE,
): Promise<number> {
  await recoverStaleProcessingRows();

  const entries = await listQueuedMutations("pending");
  let synced = 0;

  for (const entry of entries) {
    await markAttempt(entry);

    try {
      const response = await fetch(`${apiBase}${entry.endpoint}`, {
        method: entry.method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": entry.id,
          "X-RestoreAssist-Mutation-Id": entry.id,
        },
        body: entry.body,
        credentials: "include",
      });

      if (response.ok) {
        await markSynced(entry);
        synced++;
      } else if (response.status >= 500 || response.status === 408) {
        await markRetry(entry, `Server returned ${response.status}`);
      } else {
        const body = await response.json().catch(() => ({}));
        await markFailed(
          entry,
          (body as { error?: string }).error ??
            `Mutation rejected with ${response.status}`,
        );
      }
    } catch (error) {
      await markRetry(
        entry,
        error instanceof Error ? error.message : "Network error",
      );
    }
  }

  await refreshQueueSnapshot();
  if (synced > 0) {
    useAppStore.getState().triggerRefresh();
  }
  return synced;
}

export function useSyncEngine(): { status: SyncStatus; drain: () => void } {
  const isOnline = useAppStore((s) => s.isOnline);
  const setSyncSnapshot = useAppStore((s) => s.setSyncSnapshot);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const drainingRef = useRef(false);

  const drain = useCallback(() => {
    if (!isOnline || drainingRef.current) return;
    drainingRef.current = true;
    setStatus("syncing");
    setSyncSnapshot({ syncStatus: "syncing" });

    replayQueuedMutations()
      .then(() => {
        setStatus("idle");
        setSyncSnapshot({ syncStatus: "idle" });
      })
      .catch((error) => {
        setStatus("error");
        setSyncSnapshot({
          syncStatus: "error",
          syncError: error instanceof Error ? error.message : "Sync failed",
        });
      })
      .finally(() => {
        drainingRef.current = false;
      });
  }, [isOnline, setSyncSnapshot]);

  useEffect(() => {
    refreshQueueSnapshot().catch(() => {
      setStatus("error");
      setSyncSnapshot({ syncStatus: "error", syncError: "Queue unavailable" });
    });
  }, [setSyncSnapshot]);

  useEffect(() => {
    if (!isOnline) return;

    drain();
    const interval = setInterval(drain, 15_000);
    return () => clearInterval(interval);
  }, [drain, isOnline]);

  return { status, drain };
}
