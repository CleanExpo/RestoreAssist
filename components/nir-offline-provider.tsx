"use client";

/**
 * NIR Offline Provider
 *
 * Client component that:
 *   1. Registers the service worker (public/sw.js) on mount in production only
 *      (dev: unregister any existing SW — cache-first /_next/static breaks Turbopack)
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
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { clearOfflineContext, getOfflineOwner, setOfflineSession, refreshOfflineOwner, listenForOfflineInvalidation, OFFLINE_CONTEXT_EVENT } from "@/lib/offline/account-boundary";
import { SYNC_QUEUE_CHANGED_EVENT } from "@/lib/offline/sync-status-event";
import Link from "next/link";
import {
  ACTIVE_DRAFT_EVENT,
  DRAFT_SAVE_STATUS_EVENT,
  draftKey,
  getActiveDraft,
  isSameDraft,
  type DraftRef,
  type DraftSaveStatusDetail,
} from "@/lib/offline/draft-save-status";

import {
  getSyncStatus,
  getQueueStats,
  initSyncOnReconnect,
  type SyncStatus,
  type QueueStats,
} from "@/lib/nir-sync-queue";
import {
  getQueuedEvidenceCount,
  initEvidenceSyncOnReconnect,
} from "@/lib/evidence-upload-queue";
import {
  getQueuedVoiceNoteCount,
  initVoiceNoteSyncOnReconnect,
  pruneVoiceNoteQueue,
} from "@/lib/voice-note-queue";

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

/** RA-8358: one inspection whose last Save Draft did not write everything. */
export interface UnsavedDraft extends DraftRef {
  /** The account that made the failed save (RA-8360). */
  userId: string | null;
}

/**
 * RA-8360: who the provider believes is signed in. "unknown" is the first page
 * load, before next-auth has answered; "signed-out" follows a real sign-out.
 */
type DraftAccount =
  | { kind: "unknown" }
  | { kind: "signed-out" }
  | { kind: "user"; id: string };

interface NirOfflineContextValue {
  syncStatus: SyncStatus;
  queueStats: QueueStats;
  isServiceWorkerReady: boolean;
  /** Count of evidence (photo) uploads pending upload — RA-1462 */
  pendingEvidenceUploads: number;
  /** Count of voice notes queued/transcribed/errored, not yet consumed — RA-1609 */
  pendingVoiceNotes: number;
  statusCheckFailed: boolean;
  /** An authenticated session needs a server-verified offline owner before a green status is trustworthy. */
  ownerVerificationRequired: boolean;
  ownerVerified: boolean;
  /**
   * RA-8358: every inspection whose last Save Draft did not write everything,
   * for the signed-in account. An entry clears only when the same inspection
   * later saves in full; a save of a different inspection leaves it alone.
   */
  unsavedDrafts: UnsavedDraft[];
  /** RA-8358: the draft the open inspection form shows, or null when none is open. */
  activeDraft: DraftRef | null;
  /** Manually trigger a sync drain of queued writes. */
  triggerSync: () => Promise<void>;
}

const NirOfflineContext = createContext<NirOfflineContextValue>({
  syncStatus: "OFFLINE",
  queueStats: { pending: 0, failed: 0, conflicts: 0, status: "OFFLINE" },
  isServiceWorkerReady: false,
  pendingEvidenceUploads: 0,
  pendingVoiceNotes: 0,
  statusCheckFailed: false,
  ownerVerificationRequired: false,
  ownerVerified: false,
  unsavedDrafts: [],
  activeDraft: null,
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
    className: "bg-success-subtle text-success-subtle-foreground border-success-subtle-foreground/30",
    dot: "bg-green-500",
  },
  PENDING_SYNC: {
    label: "Pending sync",
    className: "bg-warning-subtle text-warning-subtle-foreground border-warning-subtle-foreground/30",
    dot: "bg-amber-400 animate-pulse",
  },
  SYNC_CONFLICT: {
    label: "Sync conflict",
    className: "bg-destructive-subtle text-destructive-subtle-foreground border-destructive-subtle-foreground/30",
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
  const { syncStatus, queueStats, pendingEvidenceUploads, pendingVoiceNotes, statusCheckFailed, ownerVerificationRequired, ownerVerified, unsavedDrafts, activeDraft } =
    useNirOffline();
  // RA-8358: on an inspection, show that inspection's draft state. Anywhere
  // else (or when this inspection saved), count the drafts that did not save
  // and link to the job when there is exactly one.
  const activeDraftFailed =
    activeDraft !== null && unsavedDrafts.some((d) => isSameDraft(d, activeDraft));
  const otherUnsaved = activeDraft
    ? unsavedDrafts.filter((d) => !isSameDraft(d, activeDraft))
    : unsavedDrafts;
  const draftLabel = activeDraftFailed
    ? "Draft not saved"
    : otherUnsaved.length === 1
      ? "1 draft not saved"
      : otherUnsaved.length > 1
        ? `${otherUnsaved.length} drafts not saved`
        : null;
  const draftHref =
    !activeDraftFailed && otherUnsaved.length === 1 && otherUnsaved[0].inspectionId
      ? `/dashboard/inspections/new?draft=${encodeURIComponent(otherUnsaved[0].inspectionId)}`
      : null;
  const unverifiedOwner = ownerVerificationRequired && !ownerVerified;
  const totalPending = unverifiedOwner ? 0 :
    queueStats.pending + pendingEvidenceUploads + pendingVoiceNotes;
  const config = draftLabel
    ? { label: draftLabel, className: STATUS_CONFIG.SYNC_CONFLICT.className, dot: STATUS_CONFIG.SYNC_CONFLICT.dot }
    : statusCheckFailed || (unverifiedOwner && typeof navigator !== "undefined" && navigator.onLine)
    ? { label: "Sync status unavailable", className: STATUS_CONFIG.PENDING_SYNC.className, dot: STATUS_CONFIG.PENDING_SYNC.dot }
    : queueStats.failed > 0
      ? { label: "Sync needs attention", className: STATUS_CONFIG.SYNC_CONFLICT.className, dot: STATUS_CONFIG.SYNC_CONFLICT.dot }
      : syncStatus === "SYNC_CONFLICT" || queueStats.conflicts > 0
        ? STATUS_CONFIG.SYNC_CONFLICT
        : syncStatus === "OFFLINE"
          ? STATUS_CONFIG.OFFLINE
          : totalPending > 0
            ? STATUS_CONFIG.PENDING_SYNC
            : STATUS_CONFIG[syncStatus];

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
      {draftHref ? (
        <Link href={draftHref} className="underline underline-offset-2">
          {config.label}
        </Link>
      ) : (
        <span>{config.label}</span>
      )}
      {totalPending > 0 && (
        <span className="ml-0.5 tabular-nums">({totalPending})</span>
      )}
    </div>
  );
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

interface NirOfflineProviderProps {
  children: ReactNode;
}

export function NirOfflineProvider({ children }: NirOfflineProviderProps) {
  const { data: session, status: sessionStatus } = useSession();
  const sessionUserId = sessionStatus === "authenticated" ? session?.user?.id ?? null : null;
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("OFFLINE");
  const [queueStats, setQueueStats] = useState<QueueStats>({
    pending: 0,
    failed: 0,
    conflicts: 0,
    status: "OFFLINE",
  });
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);
  const [pendingEvidenceUploads, setPendingEvidenceUploads] = useState(0);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState(0);
  const [statusCheckFailed, setStatusCheckFailed] = useState(false);
  const [ownerVerified, setOwnerVerified] = useState(false);
  // RA-8358: failures keyed by inspection. Held in memory only; nothing about
  // the badge is written to localStorage or IndexedDB.
  const [unsavedDraftMap, setUnsavedDraftMap] = useState<Record<string, UnsavedDraft>>({});
  const [activeDraft, setActiveDraftState] = useState<DraftRef | null>(getActiveDraft);

  // A draft-save failure belongs to the account that made the save (RA-8330
  // round 7, RA-8360). A next-auth refresh sets the status to "loading", which
  // briefly makes sessionUserId null for the same account; that keeps the
  // account as it was and must not clear anything.
  const draftAccount = useRef<DraftAccount>({ kind: "unknown" });

  useEffect(() => {
    const onDraftSave = (event: Event) => {
      const detail = (event as CustomEvent<DraftSaveStatusDetail>).detail;
      if (!detail || typeof detail.formKey !== "string") return;
      const draft: DraftRef = { inspectionId: detail.inspectionId ?? null, formKey: detail.formKey };
      const account = draftAccount.current;
      // The account the save belongs to: the one the form named, else the one
      // signed in now, else none yet known.
      const owner = detail.userId ?? (account.kind === "user" ? account.id : null);
      setUnsavedDraftMap((prev) => {
        const next: Record<string, UnsavedDraft> = {};
        // Drop this draft's earlier entries, including one from before its
        // inspection existed. Entries for any other inspection stay.
        for (const [key, entry] of Object.entries(prev)) {
          if (!isSameDraft(entry, draft)) next[key] = entry;
        }
        if (detail.ok) return next;
        // RA-8360: a failure for an account that is no longer signed in, or
        // one that arrives after sign-out, is not shown to anyone.
        if (account.kind === "signed-out") return next;
        if (account.kind === "user" && owner !== null && owner !== account.id) return next;
        next[draftKey(draft)] = { ...draft, userId: owner };
        return next;
      });
    };
    const onActiveDraft = (event: Event) => {
      setActiveDraftState((event as CustomEvent<DraftRef | null>).detail ?? null);
    };
    window.addEventListener(DRAFT_SAVE_STATUS_EVENT, onDraftSave);
    window.addEventListener(ACTIVE_DRAFT_EVENT, onActiveDraft);
    // The form may have announced itself before this listener existed.
    setActiveDraftState(getActiveDraft());
    return () => {
      window.removeEventListener(DRAFT_SAVE_STATUS_EVENT, onDraftSave);
      window.removeEventListener(ACTIVE_DRAFT_EVENT, onActiveDraft);
    };
  }, []);

  // Clear on a real sign-out or a switch to a different account.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      // Only a session that ended is a sign-out. Arriving signed out is not:
      // a failure reported then still shows, and the first sign-in claims it.
      if (draftAccount.current.kind === "user") draftAccount.current = { kind: "signed-out" };
      setUnsavedDraftMap({});
      return;
    }
    if (!sessionUserId) return;
    const previous = draftAccount.current;
    draftAccount.current = { kind: "user", id: sessionUserId };
    if (previous.kind === "user" && previous.id === sessionUserId) return;
    // First sign-in on this page load: keep failures from before next-auth
    // answered unless another account made them, and claim them for this one.
    // After a sign-out or from another account: keep only this account's own.
    setUnsavedDraftMap((prev) => {
      const next: Record<string, UnsavedDraft> = {};
      for (const [key, entry] of Object.entries(prev)) {
        if (entry.userId === sessionUserId) next[key] = entry;
        else if (previous.kind === "unknown" && entry.userId === null) {
          next[key] = { ...entry, userId: sessionUserId };
        }
      }
      return next;
    });
  }, [sessionStatus, sessionUserId]);

  // Sign-out and account changes prune the map above, and a failure that
  // arrives for another account is never added, so every entry is this one's.
  const unsavedDrafts = Object.values(unsavedDraftMap);
  const statusReadVersion = useRef(0);

  const refreshStatus = useCallback(async () => {
    const version = ++statusReadVersion.current;
    const owner = getOfflineOwner();
    try {
      const [status, stats, evidenceCount, voiceNoteCount] = await Promise.all([
        getSyncStatus(),
        getQueueStats(),
        getQueuedEvidenceCount(true),
        getQueuedVoiceNoteCount(true),
      ]);
      if (version !== statusReadVersion.current || owner !== getOfflineOwner()) return;
      setSyncStatus(status);
      setQueueStats(stats);
      setPendingEvidenceUploads(evidenceCount);
      setPendingVoiceNotes(voiceNoteCount);
      setStatusCheckFailed(false);
      setOwnerVerified(getOfflineOwner() !== null);
    } catch (err) {
      // Preserve the counts, but mark the result unavailable rather than
      // claiming queued work is synced after a failed read.
      console.warn("[NIR Offline] Failed to refresh sync status:", err);
      if (version === statusReadVersion.current) setStatusCheckFailed(true);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!await refreshOfflineOwner()) return;
    const { drainQueue } = await import("@/lib/nir-sync-queue");
    const { drainEvidenceQueue } = await import("@/lib/evidence-upload-queue");
    const { drainVoiceNoteQueue } = await import("@/lib/voice-note-queue");
    // Claims first: each one's photo joins the evidence queue drained just below.
    try {
      const { drainOfflineClaims } = await import("@/lib/offline/claim-capture-queue");
      await drainOfflineClaims();
    } catch (err) {
      // A failure here must not stop the existing queues from draining.
      console.warn("[NIR Offline] Offline claim drain failed:", err);
    }
    await Promise.all([drainQueue(), drainEvidenceQueue(), drainVoiceNoteQueue()]);
    await refreshStatus();
  }, [refreshStatus]);

  // A session the server says does not exist ends the device copy that opens
  // offline capture. Only a definite 401 does it, so a failed session fetch while
  // offline never strands a technician (lib/offline/device-identity.ts).
  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;
    void import("@/lib/offline/device-identity").then((m) => m.confirmDeviceIdentityOnline());
  }, [sessionStatus]);

  useEffect(() => {
    setOfflineSession(sessionUserId);
    setOwnerVerified(getOfflineOwner() !== null);
    const stopListening = listenForOfflineInvalidation();
    let disposed = false;
    const verify = async () => {
      if (!sessionUserId || disposed) return;
      setOfflineSession(sessionUserId);
      await refreshOfflineOwner();
      if (!disposed && getOfflineOwner()) await triggerSync();
    };
    void verify();
    window.addEventListener("online", verify);
    window.addEventListener("focus", verify);
    const onOfflineContextChange = () => {
      setOwnerVerified(getOfflineOwner() !== null);
      void refreshStatus();
    };
    window.addEventListener(OFFLINE_CONTEXT_EVENT, onOfflineContextChange);
    return () => {
      disposed = true;
      clearOfflineContext(false);
      stopListening();
      window.removeEventListener("online", verify);
      window.removeEventListener("focus", verify);
      window.removeEventListener(OFFLINE_CONTEXT_EVENT, onOfflineContextChange);
    };
  }, [sessionUserId, triggerSync, refreshStatus]);

  useEffect(() => {
    // 1. Service worker — production only. In development, actively unregister
    // any leftover SW and drop nir-* caches so Turbopack chunks are never
    // served stale (symptoms: "module factory is not available" on global-error).
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV !== "production") {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) {
            void reg.unregister();
          }
        });
        if ("caches" in window) {
          void caches.keys().then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("nir-"))
                .map((key) => caches.delete(key)),
            ),
          );
        }
        console.info("[NIR SW] Skipped registration in development");
      } else {
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
    }

    // 2. Initialise reconnect listeners (returns cleanup fns)
    const cleanupSync = initSyncOnReconnect();
    const cleanupEvidenceSync = initEvidenceSyncOnReconnect();
    const cleanupVoiceNoteSync = initVoiceNoteSyncOnReconnect();

    // 2b. Drop consumed/stale voice notes on init (RA-1609)
    void pruneVoiceNoteQueue();

    // 3. Initial status read
    refreshStatus();

    // 4. Poll status every 30s for real-time badge updates
    const interval = setInterval(refreshStatus, 30_000);

    // 5. Update status on online/offline events
    const onlineHandler = () => refreshStatus();
    const offlineHandler = () => {
      statusReadVersion.current++;
      setSyncStatus("OFFLINE");
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, refreshStatus);

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
      cleanupEvidenceSync();
      cleanupVoiceNoteSync();
      clearInterval(interval);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, refreshStatus);
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
      value={{
        syncStatus,
        queueStats,
        isServiceWorkerReady,
        pendingEvidenceUploads,
        pendingVoiceNotes,
        statusCheckFailed,
        ownerVerificationRequired: sessionStatus === "authenticated",
        ownerVerified,
        unsavedDrafts,
        activeDraft,
        triggerSync,
      }}
    >
      {children}
    </NirOfflineContext.Provider>
  );
}
