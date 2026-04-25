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
import { Loader2, Save, Check, FileDown, Ruler } from "lucide-react";

import { SketchDockToolbar } from "./SketchDockToolbar";
import { SketchFloorTabs } from "./SketchFloorTabs";
import type { SketchFloor } from "./SketchFloorTabs";
import { SketchSelectionPanel } from "./SketchSelectionPanel";
import type { SelectedObject } from "./SketchSelectionPanel";
import { SketchMoistureLayer } from "./SketchMoistureLayer";
import type { MoisturePin } from "./SketchMoistureLayer";
import { SketchHeatmapLayer } from "./SketchHeatmapLayer";
import type { Point } from "./SketchHeatmapLayer";
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
  className?: string;
  width?: number;
  height?: number;
}

// ─── Helpers ───────────────────────────────────────────────

function makeFabricCanvas(): React.MutableRefObject<FabricCanvasRef | null> {
  return { current: null };
}

export function SketchEditorV2({
  inspectionId,
  propertyAddress,
  propertyPostcode,
  readonly = false,
  className,
  width = 1200,
  height = 800,
}: SketchEditorV2Props) {
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
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [showHeatmap, setShowHeatmap] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load sketch data from API ──────────────────────────
  useEffect(() => {
    if (!inspectionId) return;
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
            moisturePoints?: unknown[] | null;
          }>;
        };
        if (cancelled || !sketches?.length) return;

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
            backgroundOpacity: 0.35,
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

  const activeFloor = floorsData[activeIdx];

  // ── Auto-save ───────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!inspectionId || readonly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        for (const fd of floorsData) {
          const canvas = fd.canvasRef.current;
          if (!canvas) continue;
          const sketchData = {
            ...(canvas.toJSON() as Record<string, unknown>),
            scaleConfig: fd.scaleConfig,
          };
          await fetch(`/api/inspections/${inspectionId}/sketches`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              floorNumber: fd.floor.floorNumber,
              floorLabel: fd.floor.floorLabel,
              sketchData,
              moisturePoints: fd.moisturePins,
              backgroundImageUrl: fd.backgroundUrl,
            }),
          });
        }
        setSavedAt(new Date());
      } catch {
        // Non-fatal
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [inspectionId, readonly, floorsData]);

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
    // Flush save before switching floors (prevents race condition)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await scheduleSave();
  }, [scheduleSave]);

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
  }, [floorsData, inspectionId, exportingPdf]);

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
        "relative flex flex-col bg-[#050505] rounded-2xl overflow-hidden",
        "border border-white/10 shadow-2xl",
        className,
      )}
      style={{ minHeight: height + 80 }}
    >
      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d1b2e] border-b border-white/10 flex-shrink-0">
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

          {/* Save indicator */}
          {!readonly && (
            <span className="text-xs text-white/30 min-w-[80px] text-right">
              {saving ? (
                <span className="flex items-center gap-1 justify-end">
                  <Loader2 size={11} className="animate-spin" /> Saving…
                </span>
              ) : savedAt ? (
                <span className="flex items-center gap-1 justify-end text-emerald-400">
                  <Check size={11} />
                  Saved{" "}
                  {savedAt.toLocaleTimeString("en-AU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </span>
          )}

          {/* PDF export */}
          {inspectionId && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#1C2E47] text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-colors disabled:opacity-40"
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
              className="w-full h-full"
            />

            {/* Heat-map overlay — rendered below pin markers */}
            <SketchHeatmapLayer
              pins={fd.moisturePins}
              polygon={
                (fd.moisturePins.length > 0
                  ? [
                      { x: 0, y: 0 },
                      { x: width, y: 0 },
                      { x: width, y: height },
                      { x: 0, y: height },
                    ]
                  : []) as Point[]
              }
              material={
                fd.moisturePins[0]?.material ?? "other"
              }
              visible={showHeatmap && idx === activeIdx}
              width={width}
              height={height}
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
          showHeatmap={showHeatmap}
          onToggleHeatmap={() => setShowHeatmap((v) => !v)}
          readonly={readonly}
        />
      </div>

      {/* ── Floor plan underlay panel ───────────────────────── */}
      {!readonly && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10 bg-[#0d1b2e]">
          <FloorPlanUnderlayLoader
            defaultAddress={propertyAddress}
            defaultPostcode={propertyPostcode}
            inspectionId={inspectionId}
            onApply={handleApplyBackground}
            onClear={handleClearBackground}
            hasBackground={!!activeFloor?.backgroundUrl}
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
