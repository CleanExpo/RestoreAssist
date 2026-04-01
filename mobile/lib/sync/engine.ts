import { useEffect } from 'react';

export type SyncStatus = 'idle' | 'syncing' | 'error';

/**
 * Sync engine stub — offline-first sync between local SQLite and remote API.
 * Full implementation in RA-292 and RA-294.
 */
export function useSyncEngine(): { status: SyncStatus } {
  useEffect(() => {
    // TODO: RA-292 — implement full sync engine
    console.log('[SyncEngine] Stub initialised');
  }, []);

  return { status: 'idle' };
}
