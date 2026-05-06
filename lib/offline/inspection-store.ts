"use client";

import { Network } from "@capacitor/network";

const DB_NAME = "ra-inspection-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export interface InspectionDraft {
  inspectionId: string;
  jobType: string;
  capturedSteps: Record<string, unknown>;
  lastModified: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "inspectionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveInspectionDraft(
  id: string,
  data: Omit<InspectionDraft, "inspectionId" | "lastModified">,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const entry: InspectionDraft = {
      inspectionId: id,
      ...data,
      lastModified: new Date().toISOString(),
    };
    const req = tx.objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadInspectionDraft(
  id: string,
): Promise<InspectionDraft | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as InspectionDraft) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearInspectionDraft(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedDraftCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllQueuedDrafts(): Promise<InspectionDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as InspectionDraft[]);
    req.onerror = () => reject(req.error);
  });
}

// Registers a listener that flushes queued drafts when network reconnects.
// Call once at app startup inside CapacitorProvider when isNative is true.
export async function initInspectionDraftSync(
  onFlush: (draft: InspectionDraft) => Promise<void>,
): Promise<void> {
  await Network.addListener("networkStatusChange", async ({ connected }) => {
    if (!connected) return;
    const drafts = await getAllQueuedDrafts();
    for (const draft of drafts) {
      try {
        await onFlush(draft);
        await clearInspectionDraft(draft.inspectionId);
      } catch {
        // Leave draft in queue for next reconnect
      }
    }
  });
}
