"use client";

/**
 * SketchSelectionPanel — context-sensitive panel that appears when an object
 * is selected on the canvas.  Floats over the canvas (absolute position).
 *
 * Exposes room type, label, colour, opacity, and stroke controls.
 */

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Trash2, X } from "lucide-react";

const ROOM_COLORS = [
  { fill: "rgba(59,130,246,0.10)",  stroke: "#3b82f6", label: "Living / Common" },
  { fill: "rgba(16,185,129,0.10)",  stroke: "#10b981", label: "Bedroom" },
  { fill: "rgba(245,158,11,0.10)",  stroke: "#f59e0b", label: "Kitchen" },
  { fill: "rgba(236,72,153,0.10)",  stroke: "#ec4899", label: "Bathroom / WC" },
  { fill: "rgba(139,92,246,0.10)",  stroke: "#8b5cf6", label: "Garage / Utility" },
  { fill: "rgba(239,68,68,0.10)",   stroke: "#ef4444", label: "Damage Zone" },
];

export interface SelectedObject {
  id: string;
  type: string;
  label?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
}

export interface SketchSelectionPanelProps {
  selected: SelectedObject | null;
  onLabelChange?: (id: string, label: string) => void;
  onColorChange?: (id: string, fill: string, stroke: string) => void;
  onOpacityChange?: (id: string, opacity: number) => void;
  onDelete?: (id: string) => void;
  onDeselect?: () => void;
  className?: string;
}

export function SketchSelectionPanel({
  selected,
  onLabelChange,
  onColorChange,
  onOpacityChange,
  onDelete,
  onDeselect,
  className,
}: SketchSelectionPanelProps) {
  if (!selected) return null;

  const isRoom = selected.type === "room" || selected.type === "polygon";
  const isText = selected.type === "text_label" || selected.type === "i-text";
  const isLine = selected.type === "wall" || selected.type === "line";

  return (
    <div
      className={cn(
        "absolute top-4 right-4 z-20 w-56",
        "bg-[#1C2E47]/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl",
        "p-3 space-y-2.5 text-sm text-white",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wide">
          {isRoom ? "Room" : isText ? "Label" : isLine ? "Wall" : "Object"}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          className="text-white/30 hover:text-white/60 transition-colors"
          aria-label="Deselect"
        >
          <X size={14} />
        </button>
      </div>

      {/* Label input (rooms + text) */}
      {(isRoom || isText) && (
        <div>
          <label className="block text-xs text-white/50 mb-1">Label</label>
          <input
            type="text"
            defaultValue={selected.label ?? ""}
            onBlur={(e) => onLabelChange?.(selected.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onLabelChange?.(selected.id, (e.target as HTMLInputElement).value);
              }
            }}
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="Room name…"
          />
        </div>
      )}

      {/* Room colour picker */}
      {isRoom && (
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Colour</label>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_COLORS.map((c) => (
              <button
                key={c.stroke}
                type="button"
                title={c.label}
                onClick={() => onColorChange?.(selected.id, c.fill, c.stroke)}
                className={cn(
                  "w-7 h-7 rounded-lg border-2 transition-all",
                  selected.stroke === c.stroke
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: c.stroke }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Opacity (rooms) */}
      {isRoom && (
        <div>
          <div className="flex justify-between text-xs text-white/50 mb-1">
            <span>Opacity</span>
            <span className="tabular-nums">
              {Math.round((selected.opacity ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            defaultValue={selected.opacity ?? 1}
            onInput={(e) =>
              onOpacityChange?.(
                selected.id,
                parseFloat((e.target as HTMLInputElement).value),
              )
            }
            className="w-full accent-cyan-400"
          />
        </div>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete?.(selected.id)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-colors text-xs font-medium"
      >
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  );
}
