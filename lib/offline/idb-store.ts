/**
 * One small IndexedDB helper for the offline modules added in RA-7877
 * (device-identity.ts, claim-capture-queue.ts).
 *
 * It owns the rule that a write is finished when the TRANSACTION commits, not
 * when the request succeeds: a late quota or storage abort after the request
 * would otherwise let a caller tell the technician "saved" for a claim that is
 * not on the device. Reads resolve at the request.
 */
export interface StoreSpec {
  db: string;
  version: number;
  store: string;
  keyPath: string;
}

export function storeOperation<T>(
  spec: StoreSpec,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(spec.db, spec.version);
    open.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(spec.store)) db.createObjectStore(spec.store, { keyPath: spec.keyPath });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let value: T;
      let settled = false;
      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        db.close?.();
        outcome();
      };
      try {
        const tx = db.transaction(spec.store, mode);
        const request = work(tx.objectStore(spec.store));
        request.onsuccess = () => {
          value = request.result;
          if (mode === "readonly") finish(() => resolve(value));
        };
        request.onerror = () => finish(() => reject(request.error));
        tx.oncomplete = () => finish(() => resolve(value));
        tx.onabort = () => finish(() => reject(tx.error ?? new Error("Storage write was not committed")));
        tx.onerror = () => finish(() => reject(tx.error ?? request.error));
      } catch (error) {
        finish(() => reject(error));
      }
    };
  });
}
