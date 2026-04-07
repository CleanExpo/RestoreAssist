"use client";

/**
 * NIR Offline Provider
 *
 * Client component that:
 *   1. Registers the service worker (public/sw.js) on mount
 *   2. Initialises the IndexedDB sync queue reconnect listener
 *   3. Exposes sync status via context for the persistent status bar
 *
 * Place this in app/layout.tsx inside the body, outside the main content area:
 *
 *   <NirOfflineProvider>
 *     {children}
 *   </NirOfflineProvider>
 *
 * The sync status indicator satisfies OFFLINE_REQUIREMENTS.syncStatusIndicator
 * from nir-field-reality-spec.ts — states: SYNCED | PENDING_SYNC | SYNC_CONFLICT | OFFLINE
 *
 * PERMISSIONS NOTE:
 *   The current next.config.mjs Permissions-Policy blocks camera and microphone:
 *     camera=()  → photo capture will fail (required for NIR photo documentation, S500 §5.3)
 *     microphone=() → voice notes will fail (required per PHYSICAL_UX_REQUIREMENTS.voiceNoteSupport)
 *   These must be removed from the Permissions-Policy header before field deployment.
 *   Ticket: update next.config.mjs to allow camera and microphone for the /portal path.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  getSyncStatus,
  getQueueStats,
  initSyncOnReconnect,
  type SyncStatus,
  type QueueStats,
} from "@/lib/nir-sync-queue";

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface NirOfflineContextValue {
  syncStatus: SyncStatus;
  queueStats: QueueStats;
  isServiceWorkerReady: boolean;
  /** Manually trigger a sync drain (e.g. on pull-to-refresh) */
  triggerSync: () => Promise<void>;
}

const NirOfflineContext = createContext<NirOfflineContextValue>({
  syncStatus: "OFFLINE",
  queueStats: { pending: 0, failed: 0, conflicts: 0, status: "OFFLINE" },
  isServiceWorkerReady: false,
  triggerSync: async () => {},
});

export function useNirOffline() {
  return useContext(NirOfflineContext);
}

// ─── SYNC STATUS BADGE ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; className: string; dot: string }
> = {
  SYNCED: {
    label: "Synced",
    className: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  PENDING_SYNC: {
    label: "Pending sync",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-400 animate-pulse",
  },
  SYNC_CONFLICT: {
    label: "Sync conflict",
    className: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  OFFLINE: {
    label: "Offline",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    dot: "bg-slate-400",
  },
};

/**
 * Persistent sync status indicator.
 * Satisfies OFFLINE_REQUIREMENTS.syncStatusIndicator: "Always visible — persistent status bar element"
 */
export function NirSyncStatusBadge() {
  const { syncStatus, queueStats } = useNirOffline();
  const config = STATUS_CONFIG[syncStatus];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Sync status: ${config.label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
      {queueStats.pending > 0 && (
        <span className="ml-0.5 tabular-nums">({queueStats.pending})</span>
      )}
    </div>
  );
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

interface NirOfflineProviderProps {
  children: ReactNode;
}

export function NirOfflineProvider({ children }: NirOfflineProviderProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("OFFLINE");
  const [queueStats, setQueueStats] = useState<QueueStats>({
    pending: 0,
    failed: 0,
    conflicts: 0,
    status: "OFFLINE",
  });
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);

  const refreshStatus = useCallback(async () => {
    const [status, stats] = await Promise.all([
      getSyncStatus(),
      getQueueStats(),
    ]);
    setSyncStatus(status);
    setQueueStats(stats);
  }, []);

  const triggerSync = useCallback(async () => {
    const { drainQueue } = await import("@/lib/nir-sync-queue");
    await drainQueue();
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    // 1. Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          setIsServiceWorkerReady(true);
          console.info("[NIR SW] Registered, scope:", registration.scope);
        })
        .catch((err) => {
          console.warn("[NIR SW] Registration failed:", err);
        });
    }

    // 2. Initialise reconnect listener (returns cleanup fn)
    const cleanupSync = initSyncOnReconnect();

    // 3. Initial status read
    refreshStatus();

    // 4. Poll status every 30s for real-time badge updates
    const interval = setInterval(refreshStatus, 30_000);

    // 5. Update status on online/offline events
    const onlineHandler = () => refreshStatus();
    const offlineHandler = () => setSyncStatus("OFFLINE");

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    // 6. Listen for SW sync messages
    const swMessageHandler = (event: MessageEvent) => {
      if (event.data?.type === "NIR_SYNC_TRIGGER") {
        refreshStatus();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", swMessageHandler);
    }

    return () => {
      cleanupSync();
      clearInterval(interval);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          swMessageHandler,
        );
      }
    };
  }, [refreshStatus]);

  return (
    <NirOfflineContext.Provider
      value={{ syncStatus, queueStats, isServiceWorkerReady, triggerSync }}
    >
      {children}
    </NirOfflineContext.Provider>
  );
}
