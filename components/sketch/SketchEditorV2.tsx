"use client";

/**
 * SketchEditorV2 — RA2-V2 orchestrator
 *
 * Replaces SketchEditor.tsx with a composable, tablet-first editor.
 * Architecture:
 *   - SketchCanvas         → Fabric.js base (SSR-safe via dynamic import)
 *   - SketchDockToolbar    → draggable floating tool dock
 *   - SketchFloorTabs      → multi-floor switcher with safe-save
 *   - SketchSelectionPanel → context-sensitive property panel
 *   - SketchMoistureLayer  → React DOM moisture pin overlay
 *   - SketchScaleModal     → 2-click scale calibration
 *   - FloorPlanUnderlayLoader → OTH floor plan fetcher
 *
 * State persistence: auto-saves to /api/inspections/[id]/sketches on change.
 */

import { useState, useRef, useCallback, useEffect, useId } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Save,
  Check,
  FileDown,
  Ruler,
  AlertTriangle,
  Download,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  enqueueSketchSave,
  getPendingEntries,
  getFailedEntries,
  retryFailedEntry,
  removeFailedEntry,
  type SyncQueueEntry,
  type SketchSavePayload,
} from "@/lib/nir-sync-queue";
import toast from "react-hot-toast";

import { SketchDockToolbar } from "./SketchDockToolbar";
import { SketchFloorTabs } from "./SketchFloorTabs";
import type { SketchFloor } from "./SketchFloorTabs";
import { SketchSelectionPanel } from "./SketchSelectionPanel";
import type { SelectedObject, MaterialOption } from "./SketchSelectionPanel";
import { ANZ_MATERIAL_OPTIONS } from "@/lib/anz/material-options";
import { SketchMoistureLayer } from "./SketchMoistureLayer";
import type { MoisturePin } from "./SketchMoistureLayer";
import { SketchScaleModal } from "./SketchScaleModal";
import type { ScaleConfig } from "./SketchScaleModal";
import { FloorPlanUnderlayLoader } from "./FloorPlanUnderlayLoader";
import type { ToolMode, FabricCanvasRef } from "./SketchCanvas";

const SketchCanvas = dynamic(() => import("./SketchCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center flex-1 text-white/40">
      <Loader2 size={20} className="animate-spin mr-2" />
      Loading canvas…
    </div>
  ),
});

// ─── Room colours ──────────────────────────────────────────
const ROOM_COLORS = [
  {
    fill: "rgba(59,130,246,0.10)",
    stroke: "#3b82f6",
    label: "Living / Common",
  },
  { fill: "rgba(16,185,129,0.10)", stroke: "#10b981", label: "Bedroom" },
  { fill: "rgba(245,158,11,0.10)", stroke: "#f59e0b", label: "Kitchen" },
  { fill: "rgba(236,72,153,0.10)", stroke: "#ec4899", label: "Bathroom / WC" },
  {
    fill: "rgba(139,92,246,0.10)",
    stroke: "#8b5cf6",
    label: "Garage / Utility",
  },
  { fill: "rgba(239,68,68,0.10)", stroke: "#ef4444", label: "Damage Zone" },
];

// ─── Floor data ────────────────────────────────────────────
interface FloorData {
  floor: SketchFloor;
  canvasRef: React.MutableRefObject<FabricCanvasRef | null>;
  moisturePins: MoisturePin[];
  backgroundUrl: string | null;
  backgroundOpacity: number;
  scaleConfig: ScaleConfig | null;
}

// ─── Props ─────────────────────────────────────────────────
export interface SketchEditorV2Props {
  inspectionId?: string;
  propertyAddress?: string;
  propertyPostcode?: string;
  readonly?: boolean;
  /**
   * Editor mode. `"guided"` (homeowner self-capture) restricts the toolbar to
   * basic capture tools, hides technician compliance controls (materials, S500
   * water category, WHS gate, jurisdiction/NHCover) and hides export / scale /
   * underlay. Default `"technician"`.
   */
  mode?: "technician" | "guided";
  /**
   * Homeowner self-capture token. When set, the editor saves to the public
   * capture route (POST /api/capture/[token]/sketch) instead of the authed
   * inspection route, and skips the authed load/materials fetches. Pair with
   * mode="guided". (Homeowner Phase 4.)
   */
  captureToken?: string;
  className?: string;
  width?: number;
  height?: number;
  /**
   * RA-2967 — When true and a propertyAddress is present, the floor plan
   * underlay panel attempts to fetch on mount. Driven by the workspace
   * setting `autoFetchFloorPlanOnInspection`.
   */
  autoFetchFloorPlan?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────

function makeFabricCanvas(): React.MutableRefObject<FabricCanvasRef | null> {
  return { current: null };
}

/**
 * Decides the save indicator after one save tick.
 * Invariant: never claim "Saved" unless a floor actually persisted online, and
 * surface an explicit failure for capture-mode saves (which have no offline
 * queue) when nothing saved — otherwise a failed homeowner save silently shows
 * "Saved" and the work is lost.
 */
export function nextSaveIndicator(input: {
  succeededOnline: number;
  captureFailedThisTick: boolean;
}): { markSaved: boolean; captureFailed: boolean } {
  return {
    markSaved: input.succeededOnline > 0,
    captureFailed: input.captureFailedThisTick && input.succeededOnline === 0,
  };
}

export function SketchEditorV2({
  inspectionId,
  propertyAddress,
  propertyPostcode,
  readonly = false,
  mode = "technician",
  captureToken,
  className,
  width = 1200,
  height = 800,
  autoFetchFloorPlan = false,
}: SketchEditorV2Props) {
  const guided = mode === "guided";
  // Homeowner capture mode: save to the public token route; skip authed fetches.
  const captureMode = !!captureToken;
  const uid = useId();

  // ── Floor state ────────────────────────────────────────
  const [floorsData, setFloorsData] = useState<FloorData[]>(() => [
    {
      floor: { id: `${uid}-f0`, floorNumber: 0, floorLabel: "Ground Floor" },
      canvasRef: makeFabricCanvas(),
      moisturePins: [],
      backgroundUrl: null,
      backgroundOpacity: 0.35,
      scaleConfig: null,
    },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  // ── UI state ───────────────────────────────────────────
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [selectedObj, setSelectedObj] = useState<SelectedObject | null>(null);
  // Seed with the offline-bundled ANZ materials so the picker + WHS gate work
  // with no connectivity (spec §4.1); the API replaces this when reachable.
  const [materials, setMaterials] =
    useState<MaterialOption[]>(ANZ_MATERIAL_OPTIONS);
  const [country, setCountry] = useState<"AU" | "NZ">("AU");
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Capture mode (homeowner self-capture) has no offline queue, so a failed
  // save must surface as an explicit error rather than a false "Saved".
  const [captureSaveFailed, setCaptureSaveFailed] = useState(false);
  // RA-1762 — running count of sketch saves currently held in the
  // offline queue (this tab's enqueues only; cross-tab counts come
  // from useNirOffline if the parent provider exposes them). Surfaced
  // in the existing save-status indicator alongside saving / savedAt
  // so the user has feedback that work is buffered, not lost.
  const [offlinePending, setOfflinePending] = useState(0);
  // RA-1769 — entries whose retry budget was exhausted. Surfaced in a
  // separate (red) state in the indicator; clicking opens a recovery
  // panel where the user can retry, export, or discard.
  const [failedEntries, setFailedEntries] = useState<SyncQueueEntry[]>([]);
  const [failedPanelOpen, setFailedPanelOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load sketch data from API ──────────────────────────
  useEffect(() => {
    if (!inspectionId || captureMode) return; // capture mode starts fresh (no authed load)
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}/sketches`);
        if (!res.ok || cancelled) return;
        const { sketches } = (await res.json()) as {
          sketches: Array<{
            id: string;
            floorNumber: number;
            floorLabel: string;
            sketchData: Record<string, unknown> | null;
            backgroundImageUrl?: string | null;
            backgroundImageOpacity?: number | null;
            moisturePoints?: unknown[] | null;
            country?: "AU" | "NZ" | null;
          }>;
        };
        if (cancelled || !sketches?.length) return;

        setCountry(sketches.some((s) => s.country === "NZ") ? "NZ" : "AU");

        const loaded: FloorData[] = sketches.map((s, i) => {
          const canvasRef = makeFabricCanvas();
          const floorData: FloorData = {
            floor: {
              id: s.id ?? `${uid}-f${i}`,
              floorNumber: s.floorNumber,
              floorLabel: s.floorLabel,
            },
            canvasRef,
            moisturePins: (s.moisturePoints as MoisturePin[] | null) ?? [],
            backgroundUrl: s.backgroundImageUrl ?? null,
            // RA-120 (PR4): restore the persisted opacity instead of resetting
            // to the default on every reload (was a per-floor data-loss bug).
            backgroundOpacity:
              typeof s.backgroundImageOpacity === "number"
                ? s.backgroundImageOpacity
                : 0.35,
            scaleConfig:
              ((s.sketchData as Record<string, unknown> | null)
                ?.scaleConfig as ScaleConfig | null) ?? null,
          };
          return floorData;
        });

        setFloorsData(loaded);

        // Load canvas JSON after floors are set
        sketches.forEach((s, i) => {
          if (!s.sketchData) return;
          const ref = loaded[i].canvasRef.current;
          if (ref) {
            ref.loadFromJSON(s.sketchData).catch(() => {});
          }
        });
      } catch {
        // Fail silently — editor starts with empty canvas
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  // ── Load ANZ materials library for the picker (spec §5.1) ──
  useEffect(() => {
    if (captureMode) return; // guided homeowner mode uses the bundled ANZ fallback
    let cancelled = false;
    fetch("/api/materials")
      .then((r) => (r.ok ? r.json() : { materials: [] }))
      .then((d) => {
        // Only override the bundled fallback when the API actually returns data.
        if (
          !cancelled &&
          Array.isArray(d.materials) &&
          d.materials.length > 0
        ) {
          setMaterials(d.materials);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [captureMode]);

  const activeFloor = floorsData[activeIdx];

  // ── Auto-save ───────────────────────────────────────────
  // RA-1762 — replaces the original empty `catch {}` that silently
  // dropped offline saves. Each floor save is now independent
  // (Promise.allSettled), and any per-floor failure (network, 5xx,
  // auth blip) routes the payload to the offline queue. The queue
  // drains on reconnect via lib/nir-sync-queue.ts. Coalescing in
  // enqueueSketchSave guarantees we keep only the latest state per
  // (inspectionId, floorNumber); clientUpdatedAt rides as a header
  // on each POST so the server can drop stale replays via 409.
  // ── Core save (awaitable). scheduleSave() debounces it; flushSaveNow() runs
  // it immediately and resolves after server acknowledgment — call flushSaveNow
  // before a floor switch, PDF export, or scope generation so no edits are lost
  // (RA-6762: the old `await scheduleSave()` returned void and never waited).
  const performSave = useCallback(async (renderImage = false) => {
    setSaving(true);
    let queuedThisTick = 0;
    let succeededOnline = 0;
    let captureFailedThisTick = false;
    const tickStartedAt = Date.now();

    const floorPromises = floorsData.map(async (fd) => {
      const canvas = fd.canvasRef.current;
      if (!canvas) return;
      const sketchData = {
        ...(canvas.toJSON() as Record<string, unknown>),
        scaleConfig: fd.scaleConfig,
      };
      const clientUpdatedAt = Date.now();

      // RA-120 (PR2): on flush saves (floor switch / PDF export / scope gen),
      // rasterise the floor (underlay + annotations are both captured by Fabric
      // toDataURL) and upload it so the canonical report can embed the floor
      // plan. Best-effort: the sketchData save below stays authoritative, so a
      // failed render/upload must never block the save or surface an error.
      let renderedPngUrl: string | undefined;
      if (renderImage && inspectionId && !captureMode) {
        try {
          // Lazy import so the Supabase client (instantiated at module load in
          // lib/supabase) stays out of this component's import graph — eager
          // import broke unit tests that load SketchEditorV2 without Supabase
          // env, and it kept supabase out of the initial client chunk anyway.
          const { uploadRenderedSketch, dataUrlToBlob } = await import(
            "@/lib/sketch-storage"
          );
          const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
          const uploaded = await uploadRenderedSketch(
            dataUrlToBlob(dataUrl),
            inspectionId,
            fd.floor.floorNumber,
          );
          renderedPngUrl = uploaded.publicUrl;
        } catch {
          // leave renderedPngUrl undefined → Prisma keeps the prior render
        }
      }

      const body = {
        floorNumber: fd.floor.floorNumber,
        floorLabel: fd.floor.floorLabel,
        sketchType: "structural",
        sketchData,
        moisturePoints: fd.moisturePins,
        backgroundImageUrl: fd.backgroundUrl,
        backgroundImageOpacity: fd.backgroundOpacity,
        renderedPngUrl,
        country,
      };

      const saveUrl = captureToken
        ? `/api/capture/${captureToken}/sketch`
        : `/api/inspections/${inspectionId}/sketches`;
      try {
        const res = await fetch(saveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-client-updated-at": String(clientUpdatedAt),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`save ${res.status}`);
        succeededOnline++;
      } catch {
        // Capture mode has no offline queue (the queue is bound to the authed
        // sketches route); a failed homeowner save must surface as an error,
        // never as a "Saved" indicator (silent data loss).
        if (captureMode || !inspectionId) {
          captureFailedThisTick = true;
          return;
        }
        // Network failure or non-2xx — queue locally, drain later.
        try {
          await enqueueSketchSave(inspectionId, {
            ...body,
            clientUpdatedAt,
          });
          queuedThisTick++;
        } catch {
          // Both online save AND IDB enqueue failed — nothing more
          // we can do here. Don't bubble; tickStart timer below
          // surfaces the lack of a fresh savedAt so the user knows
          // something is off.
        }
      }
    });

    await Promise.allSettled(floorPromises);

    // Refresh the offline-pending count from the queue so it reflects
    // ground truth (entries can also get added/removed by the SW
    // drain, by other tabs, or by deeper retries we don't see here).
    try {
      const entries = await getPendingEntries(inspectionId);
      const pendingSketches = entries.filter(
        (e) => e.type === "sketch-save",
      ).length;
      setOfflinePending(pendingSketches);
    } catch {
      // IDB unavailable — fall back to the locally incremented count
      // so the UI still surfaces the immediate enqueue feedback.
      if (queuedThisTick > 0) {
        setOfflinePending((c) => c + queuedThisTick);
      }
    }
    // Only refresh savedAt when at least one floor actually saved online —
    // otherwise the indicator would lie about the save being durable. If
    // everything got queued (authed) the user sees "Offline: N pending"; if a
    // capture-mode save failed (no queue) they see an explicit error.
    const indicator = nextSaveIndicator({ succeededOnline, captureFailedThisTick });
    if (indicator.markSaved) {
      setSavedAt(new Date(tickStartedAt));
    }
    // In capture mode a failed save is unrecoverable here (no offline queue),
    // so flag it whenever nothing saved online this tick.
    setCaptureSaveFailed(indicator.captureFailed);
    setSaving(false);
  }, [inspectionId, floorsData, country, captureMode, captureToken]);

  const scheduleSave = useCallback(() => {
    if (readonly) return;
    if (!inspectionId && !captureToken) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSave();
    }, 1500);
  }, [readonly, inspectionId, captureToken, performSave]);

  /** Persist all dirty floors NOW; resolves after server acknowledgment so
   * callers (floor switch, PDF export, scope generation) never race the
   * debounce and lose edits (RA-6762). */
  const flushSaveNow = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (readonly) return;
    if (!inspectionId && !captureToken) return;
    await performSave(true);
  }, [readonly, inspectionId, captureToken, performSave]);

  // RA-1762 / RA-1769 — keep the offline-pending count + failed-entry
  // list fresh. Pending changes when sibling tabs or the SW drain
  // queue entries; failed list grows when MAX_RETRY_COUNT is hit.
  // Cheap polling (5 s) + explicit refresh on `online`.
  useEffect(() => {
    if (!inspectionId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [pending, failed] = await Promise.all([
          getPendingEntries(inspectionId),
          getFailedEntries(inspectionId),
        ]);
        if (cancelled) return;
        setOfflinePending(
          pending.filter((e) => e.type === "sketch-save").length,
        );
        setFailedEntries(failed.filter((e) => e.type === "sketch-save"));
      } catch {
        // IDB unavailable; leave state alone.
      }
    };

    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [inspectionId]);

  // RA-1769 — recovery actions for failed sketch saves.
  const handleRetryFailed = useCallback(async (id: string) => {
    try {
      const ok = await retryFailedEntry(id);
      if (ok) {
        setFailedEntries((prev) => prev.filter((e) => e.id !== id));
        toast.success("Retrying — will sync if reachable");
      } else {
        toast("Entry already removed");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Retry failed — try again",
      );
    }
  }, []);

  const handleExportFailed = useCallback((entry: SyncQueueEntry) => {
    try {
      const blob = new Blob([JSON.stringify(entry, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const payload = entry.payload as Partial<SketchSavePayload> | null;
      const floorLabel =
        payload?.floorLabel ?? `floor-${payload?.floorNumber ?? "?"}`;
      a.href = url;
      a.download = `sketch-recovery-${entry.inspectionId}-${floorLabel}-${entry.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported — keep this file as your backup");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Export failed — try again",
      );
    }
  }, []);

  const handleDiscardFailed = useCallback(async (id: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Discard this failed save? The sketch state will be lost from the queue. " +
          "Export it first if you might want to recover the data later.",
      )
    ) {
      return;
    }
    try {
      await removeFailedEntry(id);
      setFailedEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Discarded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not discard — try again",
      );
    }
  }, []);

  // ── Canvas ready handler ────────────────────────────────
  const handleCanvasReady = useCallback(
    (floorId: string, canvas: FabricCanvasRef) => {
      setFloorsData((prev) =>
        prev.map((fd) => {
          if (fd.floor.id !== floorId) return fd;
          fd.canvasRef.current = canvas;
          return fd;
        }),
      );
      setHistoryState({ canUndo: canvas.canUndo, canRedo: canvas.canRedo });
    },
    [],
  );

  // ── History ─────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    activeFloor?.canvasRef.current?.undo();
    scheduleSave();
  }, [activeFloor, scheduleSave]);

  const handleRedo = useCallback(() => {
    activeFloor?.canvasRef.current?.redo();
    scheduleSave();
  }, [activeFloor, scheduleSave]);

  // ── Zoom ────────────────────────────────────────────────
  const applyZoom = useCallback(
    (factor: number) => {
      const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
        getZoom: () => number;
        setZoom: (z: number) => void;
        renderAll: () => void;
      } | null;
      if (!fc) return;
      const z = Math.max(0.3, Math.min(4, fc.getZoom() * factor));
      fc.setZoom(z);
      fc.renderAll();
    },
    [activeFloor],
  );

  const handleZoomReset = useCallback(() => {
    const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
      setZoom: (z: number) => void;
      renderAll: () => void;
    } | null;
    if (!fc) return;
    fc.setZoom(1);
    fc.renderAll();
  }, [activeFloor]);

  // ── Floor management ────────────────────────────────────
  const handleBeforeSwitch = useCallback(async () => {
    // Durably persist the current floor before switching — flushSaveNow awaits
    // server acknowledgment, unlike the old `await scheduleSave()` which only
    // re-armed the debounce timer and returned immediately (RA-6762).
    await flushSaveNow();
  }, [flushSaveNow]);

  const handleAddFloor = useCallback(() => {
    const newFloorNum = floorsData.length;
    const newFloor: FloorData = {
      floor: {
        id: `${uid}-f${newFloorNum}`,
        floorNumber: newFloorNum,
        floorLabel:
          newFloorNum === 1
            ? "First Floor"
            : newFloorNum === 2
              ? "Second Floor"
              : `Floor ${newFloorNum}`,
      },
      canvasRef: makeFabricCanvas(),
      moisturePins: [],
      backgroundUrl: null,
      backgroundOpacity: 0.35,
      scaleConfig: null,
    };
    setFloorsData((prev) => [...prev, newFloor]);
    setActiveIdx(floorsData.length);
  }, [floorsData, uid]);

  const handleRemoveFloor = useCallback(
    (idx: number) => {
      if (floorsData.length <= 1) return;
      setFloorsData((prev) => prev.filter((_, i) => i !== idx));
      setActiveIdx((prev) => Math.min(prev, floorsData.length - 2));
    },
    [floorsData],
  );

  // ── Background ──────────────────────────────────────────
  const handleApplyBackground = useCallback(
    (url: string, opacity: number) => {
      setFloorsData((prev) =>
        prev.map((fd, i) =>
          i === activeIdx
            ? { ...fd, backgroundUrl: url, backgroundOpacity: opacity }
            : fd,
        ),
      );
      scheduleSave();
    },
    [activeIdx, scheduleSave],
  );

  const handleClearBackground = useCallback(() => {
    setFloorsData((prev) =>
      prev.map((fd, i) =>
        i === activeIdx ? { ...fd, backgroundUrl: null } : fd,
      ),
    );
    scheduleSave();
  }, [activeIdx, scheduleSave]);

  // ── Moisture pins ───────────────────────────────────────
  const handleMoisturePinsChange = useCallback(
    (pins: MoisturePin[]) => {
      setFloorsData((prev) =>
        prev.map((fd, i) =>
          i === activeIdx ? { ...fd, moisturePins: pins } : fd,
        ),
      );
      scheduleSave();
    },
    [activeIdx, scheduleSave],
  );

  // ── Scale calibration ───────────────────────────────────
  const handleCalibrate = useCallback(
    (config: ScaleConfig) => {
      setFloorsData((prev) =>
        prev.map((fd, i) =>
          i === activeIdx ? { ...fd, scaleConfig: config } : fd,
        ),
      );
      scheduleSave();
    },
    [activeIdx, scheduleSave],
  );

  // ── PDF export ───────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      // RA-6762: durably persist all floors before exporting so the PDF
      // reflects the latest edits (and the server-side sketch is current).
      await flushSaveNow();
      const floorPayload = floorsData
        .map((fd) => {
          const canvas = fd.canvasRef.current;
          const fc = canvas?.getFabricCanvas() as {
            toDataURL: (opts: object) => string;
            toJSON: () => object;
          } | null;
          if (!fc) return null;
          return {
            label: fd.floor.floorLabel,
            pngDataUrl: fc.toDataURL({ format: "png", multiplier: 2 }),
            fabricJson: fc.toJSON(),
          };
        })
        .filter(Boolean);

      if (!floorPayload.length) return;
      const res = await fetch(`/api/inspections/${inspectionId}/sketches/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floors: floorPayload }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sketch-${inspectionId?.slice(-8) ?? "export"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setExportingPdf(false);
    }
  }, [floorsData, inspectionId, exportingPdf, flushSaveNow]);

  // ── RA-1607: Import hand-drawn sketch via Claude Vision ─
  const handleImportSketch = useCallback(
    async (file: File) => {
      if (!inspectionId) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/inspections/${inspectionId}/sketches/import-from-image`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(error ?? `Import failed (${res.status})`);
      }
      const { rooms } = (await res.json()) as {
        rooms: { label: string; vertices: { x: number; y: number }[] }[];
      };
      if (!rooms?.length) return;

      const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
        add: (...objs: unknown[]) => void;
        renderAll: () => void;
      } | null;
      if (!fc) return;

      const fabric = await import("fabric");
      const FabricPolygon = (
        fabric as unknown as {
          Polygon: new (
            pts: { x: number; y: number }[],
            opts: object,
          ) => unknown;
        }
      ).Polygon;
      const FabricText = (
        fabric as unknown as {
          IText: new (text: string, opts: object) => unknown;
        }
      ).IText;

      rooms.forEach((room, i) => {
        const color = ROOM_COLORS[i % ROOM_COLORS.length];
        const pts = room.vertices.map((v) => ({
          x: v.x * width,
          y: v.y * height,
        }));

        const polygon = new FabricPolygon(pts, {
          fill: color.fill,
          stroke: color.stroke,
          strokeWidth: 2,
          selectable: true,
          evented: true,
          data: {
            id: `imported-${Date.now()}-${i}`,
            label: room.label,
            type: "room",
            // RA-6760: AI/Vision-imported geometry is reference-only until a
            // technician reviews + confirms it. Without this it would default
            // to operator_measured and inflate billed/scoped quantities.
            provenance: "underlay_reference",
          },
        });

        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const label = new FabricText(room.label, {
          left: cx,
          top: cy,
          originX: "center",
          originY: "center",
          fontSize: 13,
          fill: color.stroke,
          selectable: true,
          evented: true,
          data: { id: `imported-label-${Date.now()}-${i}`, type: "text" },
        });

        fc.add(polygon, label);
      });

      fc.renderAll();
      scheduleSave();
    },
    [inspectionId, activeFloor, width, height, scheduleSave],
  );

  // ── Tool mode change ────────────────────────────────────
  const handleToolChange = useCallback((mode: ToolMode) => {
    setToolMode(mode);
    setSelectedObj(null);
  }, []);

  // ── Canvas get element (for scale modal) ───────────────
  const getCanvasEl = useCallback((): HTMLCanvasElement | null => {
    const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
      lowerCanvasEl?: HTMLCanvasElement;
    } | null;
    return fc?.lowerCanvasEl ?? null;
  }, [activeFloor]);

  const floors = floorsData.map((fd) => fd.floor);

  return (
    <div
      className={cn(
        "relative flex flex-col bg-brand-canvas rounded-2xl overflow-hidden",
        "border border-white/10 shadow-2xl",
        className,
      )}
      style={{ minHeight: height + 80 }}
    >
      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-brand-deep border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            RestoreAssist Sketch
          </span>
          {activeFloor?.scaleConfig && (
            <span className="text-xs text-cyan-400/70">
              {activeFloor.scaleConfig.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Scale calibration button */}
          {!readonly && (
            <button
              type="button"
              onClick={() => setShowScaleModal(true)}
              title="Calibrate scale"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
            >
              <Ruler size={13} />
              Scale
            </button>
          )}

          {/* Save indicator (with RA-1769 failed-entry surfacing) */}
          {!readonly && (
            <span
              role="status"
              aria-live="polite"
              className="relative text-xs text-white/30 min-w-[80px] text-right"
            >
              {failedEntries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setFailedPanelOpen((v) => !v)}
                  className="flex items-center gap-1 justify-end text-destructive hover:text-destructive cursor-pointer"
                  title="Click to view, retry, or export failed sketch saves"
                >
                  <AlertTriangle size={11} />
                  Sync failed: {failedEntries.length} stuck
                </button>
              ) : saving ? (
                <span className="flex items-center gap-1 justify-end">
                  <Loader2 size={11} className="animate-spin" /> Saving…
                </span>
              ) : captureSaveFailed ? (
                <span
                  role="alert"
                  className="flex items-center gap-1 justify-end text-destructive"
                  title="Your last change could not be saved. Check your connection and try again."
                >
                  <AlertTriangle size={11} /> Not saved — retry
                </span>
              ) : offlinePending > 0 ? (
                <span
                  className="flex items-center gap-1 justify-end text-amber-400"
                  title="Saved locally — will sync when reconnected"
                >
                  <Save size={11} /> Offline: {offlinePending} pending
                </span>
              ) : savedAt ? (
                <span className="flex items-center gap-1 justify-end text-success">
                  <Check size={11} />
                  Saved{" "}
                  {savedAt.toLocaleTimeString("en-AU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}

              {/* RA-1769 — recovery panel for failed sketch saves */}
              {failedPanelOpen && failedEntries.length > 0 && (
                <div
                  role="dialog"
                  aria-label="Failed sketch saves"
                  aria-live="off"
                  className="absolute right-0 top-full mt-2 w-[360px] z-50 rounded-lg border border-rose-500/40 bg-slate-900 shadow-xl p-3 text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      {failedEntries.length} stuck save
                      {failedEntries.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFailedPanelOpen(false)}
                      className="text-white/50 hover:text-white"
                      aria-label="Close"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="text-[11px] text-white/50 mb-2 leading-snug">
                    These saves hit the retry cap. Retry them, export the
                    payload to a file as backup, or discard if no longer needed.
                  </p>
                  <ul className="space-y-2 max-h-[260px] overflow-y-auto">
                    {failedEntries.map((entry) => {
                      const payload =
                        entry.payload as Partial<SketchSavePayload> | null;
                      const floorLabel =
                        payload?.floorLabel ??
                        `Floor ${payload?.floorNumber ?? "?"}`;
                      const lastAttempt = entry.lastAttemptAt
                        ? new Date(entry.lastAttemptAt).toLocaleString(
                            "en-AU",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "2-digit",
                              month: "short",
                            },
                          )
                        : "never";
                      return (
                        <li
                          key={entry.id}
                          className="rounded border border-white/10 bg-slate-800/50 p-2"
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className="text-xs text-white/80">
                              {floorLabel}
                            </span>
                            <span className="text-[10px] text-white/40">
                              last try: {lastAttempt}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRetryFailed(entry.id)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                            >
                              <RefreshCw size={10} /> Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportFailed(entry)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-slate-700 text-white/80 hover:bg-slate-600"
                            >
                              <Download size={10} /> Export
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscardFailed(entry.id)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                            >
                              <Trash2 size={10} /> Discard
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </span>
          )}

          {/* PDF export */}
          {!guided && inspectionId && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand-navy text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-colors disabled:opacity-40"
            >
              {exportingPdf ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileDown size={12} />
              )}
              PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Floor tabs ─────────────────────────────────────── */}
      <SketchFloorTabs
        floors={floors}
        activeFloorIdx={activeIdx}
        onBeforeSwitch={handleBeforeSwitch}
        onSwitch={setActiveIdx}
        onAdd={handleAddFloor}
        onRemove={handleRemoveFloor}
        readonly={readonly}
      />

      {/* ── Canvas area ────────────────────────────────────── */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ minHeight: height }}
      >
        {floorsData.map((fd, idx) => (
          <div
            key={fd.floor.id}
            className={cn(
              "absolute inset-0",
              idx === activeIdx ? "block" : "hidden",
            )}
          >
            <SketchCanvas
              ref={fd.canvasRef}
              width={width}
              height={height}
              toolMode={toolMode}
              pxPerMetre={fd.scaleConfig?.pxPerMetre}
              backgroundImageUrl={fd.backgroundUrl}
              backgroundImageOpacity={fd.backgroundOpacity}
              readonly={readonly}
              onReady={(canvas) => handleCanvasReady(fd.floor.id, canvas)}
              onModified={() => {
                scheduleSave();
                const c = fd.canvasRef.current;
                if (c)
                  setHistoryState({ canUndo: c.canUndo, canRedo: c.canRedo });
              }}
              onSelect={setSelectedObj}
              className="w-full h-full"
            />

            {/* Moisture pin overlay */}
            <SketchMoistureLayer
              pins={fd.moisturePins}
              onChange={handleMoisturePinsChange}
              active={toolMode === "photo" && idx === activeIdx}
              width={width}
              height={height}
              className="pointer-events-none"
            />
          </div>
        ))}

        {/* Selection panel */}
        <SketchSelectionPanel
          selected={selectedObj}
          guided={guided}
          materials={materials}
          country={country}
          onCountryChange={(c) => {
            setCountry(c);
            scheduleSave();
          }}
          onCauseChange={(id, cause) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data) (obj.data as Record<string, unknown>).cause = cause;
            fc.renderAll();
            setSelectedObj((prev) =>
              prev && prev.id === id ? { ...prev, cause } : prev,
            );
            scheduleSave();
          }}
          onWaterCategoryChange={(id, category) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data)
              (obj.data as Record<string, unknown>).waterCategory = category;
            fc.renderAll();
            setSelectedObj((prev) =>
              prev && prev.id === id
                ? { ...prev, waterCategory: category }
                : prev,
            );
            scheduleSave();
          }}
          onMaterialChange={(id, slug) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data)
              (obj.data as Record<string, unknown>).material = slug;
            fc.renderAll();
            setSelectedObj((prev) =>
              prev && prev.id === id ? { ...prev, materialSlug: slug } : prev,
            );
            scheduleSave();
          }}
          onConfirmProvenance={(id) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data)
              (obj.data as Record<string, unknown>).provenance =
                "operator_measured";
            fc.renderAll();
            setSelectedObj((prev) =>
              prev && prev.id === id
                ? { ...prev, provenance: "operator_measured" }
                : prev,
            );
            scheduleSave();
          }}
          onRecordWhsPathway={(id, note) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data)
              (obj.data as Record<string, unknown>).whsPathwayNote = note;
            fc.renderAll();
            setSelectedObj((prev) =>
              prev && prev.id === id ? { ...prev, whsPathwayNote: note } : prev,
            );
            scheduleSave();
          }}
          onDeselect={() => setSelectedObj(null)}
          onDelete={(id) => {
            // Remove object from Fabric canvas by matching custom data id
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              remove: (...o: unknown[]) => void;
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              );
            if (obj) {
              fc.remove(obj);
              fc.renderAll();
            }
            setSelectedObj(null);
            scheduleSave();
          }}
          onLabelChange={(id, label) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj?.data) (obj.data as Record<string, unknown>).label = label;
            fc.renderAll();
            scheduleSave();
          }}
          onColorChange={(id, fill, stroke) => {
            const fc = activeFloor?.canvasRef.current?.getFabricCanvas() as {
              getObjects: () => unknown[];
              renderAll: () => void;
            } | null;
            if (!fc) return;
            const obj = fc
              .getObjects()
              .find(
                (o) =>
                  (
                    (o as Record<string, unknown>).data as
                      | Record<string, unknown>
                      | undefined
                  )?.id === id,
              ) as Record<string, unknown> | undefined;
            if (obj) {
              (obj as Record<string, unknown>).fill = fill;
              (obj as Record<string, unknown>).stroke = stroke;
            }
            fc.renderAll();
            scheduleSave();
          }}
        />

        {/* Floating dock toolbar */}
        <SketchDockToolbar
          toolMode={toolMode}
          guided={guided}
          onToolChange={handleToolChange}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onZoomIn={() => applyZoom(1.2)}
          onZoomOut={() => applyZoom(0.8)}
          onZoomReset={handleZoomReset}
          onClear={() => {
            activeFloor?.canvasRef.current?.clear();
            scheduleSave();
          }}
          onImportSketch={
            inspectionId && !readonly ? handleImportSketch : undefined
          }
          readonly={readonly}
        />
      </div>

      {/* ── Floor plan underlay panel ───────────────────────── */}
      {!readonly && !guided && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10 bg-brand-deep">
          <FloorPlanUnderlayLoader
            defaultAddress={propertyAddress}
            defaultPostcode={propertyPostcode}
            inspectionId={inspectionId}
            onApply={handleApplyBackground}
            onClear={handleClearBackground}
            hasBackground={!!activeFloor?.backgroundUrl}
            autoFetch={autoFetchFloorPlan && !!propertyAddress}
            className="border-white/10"
          />
        </div>
      )}

      {/* ── Scale calibration modal ─────────────────────────── */}
      {showScaleModal && (
        <SketchScaleModal
          currentScale={activeFloor?.scaleConfig ?? null}
          onCalibrate={handleCalibrate}
          onClose={() => setShowScaleModal(false)}
          canvasEl={getCanvasEl()}
        />
      )}
    </div>
  );
}
