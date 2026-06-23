"use client";

/**
 * SketchMoistureLayer — React DOM overlay for moisture reading pins.
 *
 * Renders as an absolutely-positioned div over the Fabric.js canvas.
 * Pins are React nodes (not Fabric objects) so they survive canvas reloads.
 *
 * IICRC S500:2021 §8.1 — moisture class colours:
 *   Class 1 (< 15% WME) → green
 *   Class 2 (15–25%)    → yellow
 *   Class 3 (25–40%)    → orange
 *   Class 4 (≥ 40%)     → red
 */

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, Droplets } from "lucide-react";
import {
  deriveIicrClass,
  getClassInfo,
  MATERIAL_TYPES,
  type MaterialTypeId,
} from "@/lib/sketch/iicrc-utils";
import { pinDryingStatus } from "@/lib/sketch/pin-drying";
import { toNormalized, pinPixelPosition } from "@/lib/sketch/pin-coords";

export interface MoisturePin {
  id: string;
  x: number; // legacy absolute canvas pixel coordinate (back-compat)
  y: number;
  /** Normalized 0..1 position (RA-6763) — stable under zoom/pan/resize. */
  nx?: number;
  ny?: number;
  wme: number; // wood moisture equivalent %
  material: MaterialTypeId;
  note?: string;
  /** Derived from wme — stored for filtering/reporting */
  iicrClass: 1 | 2 | 3 | 4;
}

export interface SketchMoistureLayerProps {
  pins: MoisturePin[];
  onChange: (pins: MoisturePin[]) => void;
  /** When true, clicking the canvas drops a new pin */
  active: boolean;
  /** Canvas scale factor (devicePixelRatio or zoom) for coordinate mapping */
  canvasZoom?: number;
  width: number;
  height: number;
  className?: string;
}

let pinCounter = 0;
function newPinId() {
  return `mp-${Date.now()}-${++pinCounter}`;
}

export function SketchMoistureLayer({
  pins,
  onChange,
  active,
  canvasZoom = 1,
  width,
  height,
  className,
}: SketchMoistureLayerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Drop new pin ─────────────────────────────────────────
  const handleLayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active) return;
      if ((e.target as HTMLElement).closest("[data-pin]")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvasZoom;
      const y = (e.clientY - rect.top) / canvasZoom;
      // RA-6763: also store the normalized position so the pin stays anchored
      // when the canvas is zoomed/panned/resized.
      const { nx, ny } = toNormalized(x, y, width, height);
      const pin: MoisturePin = {
        id: newPinId(),
        x,
        y,
        nx,
        ny,
        wme: 16,
        material: "plasterboard",
        iicrClass: deriveIicrClass(16),
      };
      onChange([...pins, pin]);
      setEditingId(pin.id);
    },
    [active, pins, onChange, canvasZoom, width, height],
  );

  const updatePin = useCallback(
    (id: string, patch: Partial<MoisturePin>) => {
      onChange(
        pins.map((p) => {
          if (p.id !== id) return p;
          const updated = { ...p, ...patch };
          updated.iicrClass = deriveIicrClass(updated.wme);
          return updated;
        }),
      );
    },
    [pins, onChange],
  );

  const removePin = useCallback(
    (id: string) => {
      onChange(pins.filter((p) => p.id !== id));
      setEditingId(null);
    },
    [pins, onChange],
  );

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none",
        active && "pointer-events-auto cursor-crosshair",
        className,
      )}
      style={{ width, height }}
      onClick={handleLayerClick}
    >
      {pins.map((pin) => {
        const info = getClassInfo(pin.iicrClass);
        const { left, top } = pinPixelPosition(pin, width, height);
        return (
          <PinMarker
            key={pin.id}
            pin={pin}
            left={left}
            top={top}
            info={info}
            isEditing={editingId === pin.id}
            onEdit={() => setEditingId(pin.id)}
            onClose={() => setEditingId(null)}
            onUpdate={(patch) => updatePin(pin.id, patch)}
            onRemove={() => removePin(pin.id)}
          />
        );
      })}
    </div>
  );
}

// ── Pin marker ────────────────────────────────────────────────

interface PinMarkerProps {
  pin: MoisturePin;
  /** Rendered pixel position for the current canvas size (RA-6763). */
  left: number;
  top: number;
  info: ReturnType<typeof getClassInfo>;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<MoisturePin>) => void;
  onRemove: () => void;
}

function PinMarker({
  pin,
  left,
  top,
  info,
  isEditing,
  onEdit,
  onClose,
  onUpdate,
  onRemove,
}: PinMarkerProps) {
  return (
    <div
      data-pin={pin.id}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
      style={{ left, top }}
    >
      {/* Pin dot */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title={`${info.label} — ${pin.wme}% WME`}
        aria-label={`Moisture reading: ${pin.wme}% WME (${info.label})`}
        className={cn(
          "w-11 h-11 rounded-full border-2 border-white/80 shadow-lg",
          "flex items-center justify-center text-white text-xs font-bold",
          "hover:scale-110 transition-transform",
        )}
        style={{ backgroundColor: info.color }}
      >
        {pin.wme}
      </button>

      {/* Popup editor */}
      {isEditing && (
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-52"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-brand-navy border border-white/10 rounded-xl shadow-2xl p-3 space-y-2.5 text-white text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5">
                <Droplets size={12} style={{ color: info.color }} />
                Moisture Reading
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close moisture reading"
                className="flex items-center justify-center min-w-11 min-h-11 -mr-1.5 text-white/30 hover:text-white/70"
              >
                <X size={12} />
              </button>
            </div>

            {/* WME input */}
            <div>
              <label className="block text-white/50 mb-1">WME % reading</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={pin.wme}
                onChange={(e) =>
                  onUpdate({ wme: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            {/* Material selector */}
            <div>
              <label className="block text-white/50 mb-1">Material</label>
              <select
                value={pin.material}
                onChange={(e) =>
                  onUpdate({ material: e.target.value as MaterialTypeId })
                }
                className="w-full px-2 py-1.5 rounded-lg bg-[#0d1b2e] border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
              >
                {MATERIAL_TYPES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* S500 drying status (spec §5.2) */}
            {(() => {
              const dry = pinDryingStatus(pin);
              return (
                <div
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium",
                    dry.dryStandardMet
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-rose-500/15 text-rose-300",
                  )}
                >
                  <span>S500 dry standard ({dry.targetMc}% WME)</span>
                  <span className="font-semibold">
                    {dry.dryStandardMet ? "DRY" : "NOT YET DRY"}
                  </span>
                </div>
              );
            })()}

            {/* Note */}
            <div>
              <label className="block text-white/50 mb-1">
                Note (optional)
              </label>
              <input
                type="text"
                value={pin.note ?? ""}
                onChange={(e) => onUpdate({ note: e.target.value })}
                placeholder="e.g. near skirting board"
                className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            {/* IICRC class badge */}
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: info.color + "20", color: info.color }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: info.color }}
              />
              {info.label} — {info.description}
            </div>

            {/* Delete */}
            <button
              type="button"
              onClick={onRemove}
              className="w-full min-h-11 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
            >
              <X size={11} />
              Remove pin
            </button>
          </div>
          {/* Arrow */}
          <div className="w-2 h-2 rotate-45 bg-brand-navy border-r border-b border-white/10 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}
