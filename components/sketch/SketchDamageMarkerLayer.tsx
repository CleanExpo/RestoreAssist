"use client";

/**
 * IICRC damage-marker overlay — RA-2953.
 *
 * Same viewport class as evidence / moisture pins (RA-7547 #2202):
 * overlayScreenPoint / overlayScenePoint from Fabric viewportTransform.
 * Do not leave markers in screen space.
 */

import { useCallback, useState } from "react";
import { ChromeX } from "@/components/brand/chrome-icons";
import { cn } from "@/lib/utils";
import { pinPixelPosition } from "@/lib/sketch/pin-coords";
import {
  IDENTITY_OVERLAY_VIEWPORT,
  overlayScenePoint,
  overlayScreenPoint,
  type OverlayViewport,
} from "@/lib/sketch/overlay-viewport";
import {
  createDamageMarker,
  damageMarkerAriaLabel,
  damageMarkerFill,
  getDamageMarkerEntry,
  type DamageMarker,
  type DamageMarkerSeverity,
  type DamageMarkerType,
  DAMAGE_MARKER_SEVERITY_STYLES,
} from "@/lib/sketch/damage-markers";

export interface SketchDamageMarkerLayerProps {
  markers: DamageMarker[];
  onChange: (markers: DamageMarker[]) => void;
  active: boolean;
  selectedType: DamageMarkerType;
  selectedSeverity: DamageMarkerSeverity;
  resolveRoomLabel?: (x: number, y: number) => string;
  overlayViewport?: OverlayViewport;
  canvasZoom?: number;
  width: number;
  height: number;
  className?: string;
}

export function SketchDamageMarkerLayer({
  markers,
  onChange,
  active,
  selectedType,
  selectedSeverity,
  resolveRoomLabel,
  overlayViewport,
  canvasZoom = 1,
  width,
  height,
  className,
}: SketchDamageMarkerLayerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const vpt =
    overlayViewport ??
    (canvasZoom === 1 || !canvasZoom
      ? IDENTITY_OVERLAY_VIEWPORT
      : { zoom: canvasZoom, panX: 0, panY: 0 });

  const handleLayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active) return;
      if ((e.target as HTMLElement).closest("[data-damage-marker]")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = overlayScenePoint(e.clientX, e.clientY, rect, vpt);
      const room_label = resolveRoomLabel?.(x, y) ?? "";
      onChange([
        ...markers,
        createDamageMarker({
          type: selectedType,
          severity: selectedSeverity,
          room_label,
          x,
          y,
          width,
          height,
        }),
      ]);
    },
    [
      active,
      height,
      markers,
      onChange,
      resolveRoomLabel,
      selectedSeverity,
      selectedType,
      vpt,
      width,
    ],
  );

  const updateMarker = (id: string, patch: Partial<DamageMarker>) => {
    onChange(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-[21]",
        active ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
        className,
      )}
      onClick={handleLayerClick}
      role="presentation"
      aria-label="Damage marker layer"
      data-testid="sketch-damage-marker-layer"
      data-overlay-zoom={String(vpt.zoom)}
      data-overlay-pan-x={String(vpt.panX)}
      data-overlay-pan-y={String(vpt.panY)}
      tabIndex={active ? 0 : -1}
    >
      {markers.map((marker) => {
        const scene = pinPixelPosition(marker, width, height);
        const screen = overlayScreenPoint(scene.left, scene.top, vpt);
        const entry = getDamageMarkerEntry(marker.type);
        const fill = damageMarkerFill(marker.type, marker.severity);
        const ring = DAMAGE_MARKER_SEVERITY_STYLES[marker.severity].ring;
        const scale = DAMAGE_MARKER_SEVERITY_STYLES[marker.severity].scale;
        return (
          <div
            key={marker.id}
            data-damage-marker
            data-testid="sketch-damage-marker"
            data-marker-type={marker.type}
            data-marker-severity={marker.severity}
            className="absolute pointer-events-auto"
            style={{
              left: screen.left,
              top: screen.top,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(marker.id);
            }}
          >
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white shadow-lg shadow-black/40"
              style={{
                background: fill,
                borderColor: ring,
              }}
              aria-label={damageMarkerAriaLabel(marker)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path d={entry.iconPath} />
              </svg>
              <span className="sr-only">{entry.short}</span>
            </button>
            {marker.room_label ? (
              <span className="absolute -bottom-5 left-1/2 max-w-[7rem] -translate-x-1/2 truncate rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-white/90">
                {marker.room_label}
              </span>
            ) : null}
            {active && (
              <button
                type="button"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
                aria-label="Remove damage marker"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(markers.filter((m) => m.id !== marker.id));
                  if (editingId === marker.id) setEditingId(null);
                }}
              >
                <ChromeX className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {editingId
        ? (() => {
            const marker = markers.find((m) => m.id === editingId);
            if (!marker) return null;
            return (
              <div
                className="absolute inset-0 z-40 flex items-end justify-center bg-black/40 p-4 pointer-events-auto"
                onClick={() => setEditingId(null)}
                role="dialog"
                aria-modal="true"
                aria-label="Edit damage marker"
              >
                <div
                  className="w-full max-w-sm rounded-xl border border-white/10 bg-brand-ink p-4 text-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-semibold">
                    {getDamageMarkerEntry(marker.type).label}
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {getDamageMarkerEntry(marker.type).citation}
                  </p>
                  <label className="mt-3 block text-xs text-white/60">
                    Room
                    <input
                      className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
                      value={marker.room_label}
                      onChange={(e) =>
                        updateMarker(marker.id, { room_label: e.target.value })
                      }
                    />
                  </label>
                  <label className="mt-2 block text-xs text-white/60">
                    Area (m²)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
                      value={marker.dimension_m2 ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateMarker(marker.id, {
                          dimension_m2:
                            e.target.value === "" || Number.isNaN(n)
                              ? undefined
                              : n,
                        });
                      }}
                    />
                  </label>
                  <label className="mt-2 block text-xs text-white/60">
                    Notes
                    <textarea
                      className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
                      rows={2}
                      value={marker.notes ?? ""}
                      onChange={(e) =>
                        updateMarker(marker.id, {
                          notes: e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white"
                      onClick={() => setEditingId(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}
