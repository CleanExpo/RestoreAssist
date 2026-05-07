// IndexedDB cache for the field dashboard active job list.
// Survives page reload and app backgrounding. Written on every successful
// API fetch; read as fallback when the device is offline.

const DB_NAME = "ra-field-cache";
const DB_VERSION = 1;
const STORE = "jobs";
const CACHE_KEY = "active-jobs";

export interface CachedJob {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
  inspectionDate: string;
  moistureReadingCount: number;
  criticalMissing: number;
  readyToLeave: boolean;
}

interface JobCacheEntry {
  key: string;
  jobs: CachedJob[];
  fetchedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheJobs(jobs: CachedJob[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const entry: JobCacheEntry = {
        key: CACHE_KEY,
        jobs,
        fetchedAt: new Date().toISOString(),
      };
      const req = tx.objectStore(STORE).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache write failure is non-fatal — just skip it
  }
}

export async function getCachedJobs(): Promise<{
  jobs: CachedJob[];
  fetchedAt: string | null;
}> {
  try {
    const db = await openDb();
    const entry = await new Promise<JobCacheEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(CACHE_KEY);
      req.onsuccess = () => resolve((req.result as JobCacheEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
    return {
      jobs: entry?.jobs ?? [],
      fetchedAt: entry?.fetchedAt ?? null,
    };
  } catch {
    return { jobs: [], fetchedAt: null };
  }
}
