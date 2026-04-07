"use client";

/**
 * SketchViewer — RA2-054 (RA-124)
 *
 * Homeowner-friendly, read-only view of sketch floor plans.
 * Filters out technical data (moisture readings, equipment markers, photo pins)
 * and renders a clean, branded presentation suitable for sharing with property owners.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Home,
} from "lucide-react";
import type { FabricCanvasRef } from "./SketchCanvas";

const SketchCanvas = dynamic(() => import("./SketchCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-neutral-400 dark:text-slate-500">
      <Loader2 size={18} className="animate-spin mr-2" />
      Loading floor plan…
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────

export interface SketchViewerFloor {
  floorNumber: number;
  floorLabel: string;
  sketchData: Record<string, unknown> | null;
}

export interface SketchViewerProps {
  inspectionId: string;
  /** Optional header info */
  propertyAddress?: string;
  reportTitle?: string;
  /** Pre-loaded floors — skips the API fetch */
  floors?: SketchViewerFloor[];
  className?: string;
  width?: number;
  height?: number;
}

// ── Homeowner filter ──────────────────────────────────────

const TECHNICAL_DATA_TYPES = new Set([
  "moisture_reading",
  "moisture_marker",
  "equipment_point",
  "equipment_marker",
  "photo_marker",
  "photo_pin",
]);

const STRUCTURAL_OBJECT_TYPES = new Set([
  "polygon",
  "polyline",
  "line",
  "text",
  "i-text",
  "rect",
  "group",
  "path",
]);

/**
 * Strip technical annotation objects (moisture, equipment, photos) from
 * a Fabric.js canvas JSON, keeping only structural shapes and room labels.
 */
function filterHomeownerJson(
  json: Record<string, unknown>,
): Record<string, unknown> {
  if (!json?.objects || !Array.isArray(json.objects)) return json;

  const filtered = json.objects.filter((obj: unknown) => {
    const o = obj as Record<string, unknown>;
    const type = ((o.type as string | undefined) ?? "").toLowerCase();
    const data = (o.data as Record<string, unknown> | undefined) ?? {};
    const dataType = ((data.type as string | undefined) ?? "").toLowerCase();
    const dataCategory = (
      (data.category as string | undefined) ?? ""
    ).toLowerCase();

    // Exclude explicitly flagged technical objects
    if (
      TECHNICAL_DATA_TYPES.has(dataType) ||
      TECHNICAL_DATA_TYPES.has(dataCategory)
    ) {
      return false;
    }

    // Images embedded in the canvas (photo markers) — exclude
    if (type === "image") return false;

    // Keep all recognised structural types; drop unknown types
    return STRUCTURAL_OBJECT_TYPES.has(type) || type === "";
  });

  return { ...json, objects: filtered };
}

// ── Legend ────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: "#3b82f6", label: "Living / Common Area" },
  { color: "#10b981", label: "Bedroom" },
  { color: "#f59e0b", label: "Kitchen" },
  { color: "#ec4899", label: "Bathroom / WC" },
  { color: "#8b5cf6", label: "Garage / Utility" },
  { color: "#ef4444", label: "Affected Area" },
];

// ── Component ─────────────────────────────────────────────

export function SketchViewer({
  inspectionId,
  propertyAddress,
  reportTitle,
  floors: preloadedFloors,
  className,
  width = 1200,
  height = 700,
}: SketchViewerProps) {
  const [floors, setFloors] = useState<SketchViewerFloor[]>(
    preloadedFloors ?? [],
  );
  const [loading, setLoading] = useState(!preloadedFloors);
  const [activeIdx, setActiveIdx] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Keyed by floorNumber
  const canvasRefs = useRef<Map<number, FabricCanvasRef | null>>(new Map());

  // ── Fetch sketches if not pre-loaded ────────────────────
  useEffect(() => {
    if (preloadedFloors) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}/sketches`);
        if (!res.ok || cancelled) return;
        const { sketches } = (await res.json()) as {
          sketches: Array<{
            floorNumber: number;
            floorLabel: string;
            sketchData: Record<string, unknown> | null;
            sketchType?: string;
          }>;
        };
        const structural = sketches
          .filter((s) => !s.sketchType || s.sketchType === "structural")
          .sort((a, b) => a.floorNumber - b.floorNumber);
        if (!cancelled) setFloors(structural);
      } catch {
        // fail silently — viewer shows empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId, preloadedFloors]);

  // ── Load JSON into canvas when it mounts ────────────────
  const handleCanvasReady = useCallback(
    (floorNumber: number, canvas: FabricCanvasRef) => {
      canvasRefs.current.set(floorNumber, canvas);
      const floor = floors.find((f) => f.floorNumber === floorNumber);
      if (floor?.sketchData) {
        const filtered = filterHomeownerJson(floor.sketchData);
        canvas.loadFromJSON(filtered).catch(() => {});
      }
    },
    [floors],
  );

  // Re-load if floor data arrives after canvases are mounted
  useEffect(() => {
    canvasRefs.current.forEach((canvas, floorNumber) => {
      if (!canvas) return;
      const floor = floors.find((f) => f.floorNumber === floorNumber);
      if (floor?.sketchData) {
        const filtered = filterHomeownerJson(floor.sketchData);
        canvas.loadFromJSON(filtered).catch(() => {});
      }
    });
  }, [floors]);

  // ── PDF export ───────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const floorData = floors
        .map((floor) => {
          const canvas = canvasRefs.current.get(floor.floorNumber);
          if (!canvas) return null;
          const fc = canvas.getFabricCanvas() as {
            toDataURL: (opts: object) => string;
            toJSON: () => object;
          } | null;
          if (!fc) return null;
          return {
            label: floor.floorLabel,
            pngDataUrl: fc.toDataURL({ format: "png", multiplier: 2 }),
            fabricJson: fc.toJSON(),
          };
        })
        .filter(Boolean);

      if (!floorData.length) return;

      const res = await fetch(`/api/inspections/${inspectionId}/sketches/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floors: floorData }),
      });
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `floor-plan-${inspectionId.slice(-8)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setExportingPdf(false);
    }
  }, [floors, inspectionId, exportingPdf]);

  const activeFloor = floors[activeIdx];
  const hasMultipleFloors = floors.length > 1;

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div
        className={`flex items-center justify-center h-64 text-neutral-500 dark:text-slate-400 ${className ?? ""}`}
      >
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading floor plans…
      </div>
    );
  }

  if (!floors.length) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-64 text-neutral-400 dark:text-slate-500 gap-2 ${className ?? ""}`}
      >
        <Home size={32} strokeWidth={1.5} />
        <p className="text-sm">No floor plans available for this inspection.</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className={`flex flex-col gap-0 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-neutral-200 dark:border-slate-700 overflow-hidden ${className ?? ""}`}
    >
      {/* ── Branded header ───────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-700 to-blue-600 text-white">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-widest uppercase opacity-80">
            RestoreAssist
          </span>
          <h2 className="text-base font-semibold leading-tight">
            {reportTitle ?? "Property Floor Plan"}
          </h2>
          {propertyAddress && (
            <p className="text-xs opacity-75 mt-0.5">{propertyAddress}</p>
          )}
        </div>

        <button
          onClick={handleExportPdf}
          disabled={exportingPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {exportingPdf ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
          Download PDF
        </button>
      </div>

      {/* ── Floor tabs (multi-floor only) ────────────────── */}
      {hasMultipleFloors && (
        <div className="flex items-center gap-0 border-b border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800/50 px-2">
          <button
            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
            disabled={activeIdx === 0}
            className="p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
            aria-label="Previous floor"
          >
            <ChevronLeft size={16} />
          </button>

          {floors.map((floor, idx) => (
            <button
              key={floor.floorNumber}
              onClick={() => setActiveIdx(idx)}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                idx === activeIdx
                  ? "border-blue-600 text-blue-700 dark:text-blue-400"
                  : "border-transparent text-neutral-500 dark:text-slate-400 hover:text-neutral-800 dark:hover:text-slate-200",
              ].join(" ")}
            >
              {floor.floorLabel}
            </button>
          ))}

          <button
            onClick={() =>
              setActiveIdx((i) => Math.min(floors.length - 1, i + 1))
            }
            disabled={activeIdx === floors.length - 1}
            className="p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
            aria-label="Next floor"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Canvas ───────────────────────────────────────── */}
      <div
        className="relative overflow-auto bg-neutral-100 dark:bg-slate-800/30"
        style={{ minHeight: 320 }}
      >
        {floors.map((floor, idx) => (
          <div
            key={floor.floorNumber}
            className={idx === activeIdx ? "block" : "hidden"}
          >
            <SketchCanvas
              width={width}
              height={height}
              toolMode="pan"
              readonly={true}
              onReady={(canvas) => handleCanvasReady(floor.floorNumber, canvas)}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* ── Legend ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-t border-neutral-100 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800/30">
        <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide mr-1">
          Legend
        </span>
        {LEGEND_ITEMS.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-slate-400"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{
                backgroundColor: item.color + "33",
                borderColor: item.color,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t border-neutral-100 dark:border-slate-700 flex items-center justify-between">
        <p className="text-xs text-neutral-400 dark:text-slate-500">
          Generated by RestoreAssist · Floor plan is indicative only
        </p>
        <p className="text-xs text-neutral-400 dark:text-slate-500">
          {new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
