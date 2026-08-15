"use client";

/**
 * Room moisture crop guides — Hydro-style workflow (room-scoped moisture),
 * RestoreAssist styling (cyan guides, not competitor brand orange).
 */

import { cn } from "@/lib/utils";
import type { RoomCropRect } from "@/lib/sketch/room-moisture-crop";
import { ChromeDroplet, ChromeX } from "@/components/brand/chrome-icons";

export interface SketchRoomMoistureCropProps {
  active: boolean;
  crop: RoomCropRect | null;
  roomLabel?: string;
  onExit: () => void;
  className?: string;
}

export function SketchRoomMoistureCrop({
  active,
  crop,
  roomLabel,
  onExit,
  className,
}: SketchRoomMoistureCropProps) {
  if (!active || !crop) return null;

  return (
    <div
      className={cn("absolute inset-0 z-[15] pointer-events-none", className)}
      aria-hidden={false}
      role="region"
      aria-label="Room moisture crop"
    >
      {/* Dim outside crop */}
      <div className="absolute inset-0 bg-brand-deep/35" />
      {/* Guide rectangle */}
      <div
        className="absolute border-2 border-cyan-400/90 shadow-[0_0_0_9999px_rgba(11,27,43,0.45)]"
        style={{
          left: crop.left,
          top: crop.top,
          width: crop.width,
          height: crop.height,
        }}
      >
        <div className="absolute -top-7 left-0 flex items-center gap-1.5 pointer-events-auto">
          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 border border-cyan-400/50 px-2 py-0.5 text-[10px] font-medium text-cyan-50">
            <ChromeDroplet size={11} />
            Moisture map
            {roomLabel ? ` — ${roomLabel}` : ""}
          </span>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-brand-navy/90 border border-white/20 text-white/80 hover:text-white"
            aria-label="Exit room moisture map"
          >
            <ChromeX size={12} />
          </button>
        </div>
        {/* Corner ticks */}
        <span className="absolute -left-0.5 -top-0.5 h-3 w-3 border-l-2 border-t-2 border-cyan-300" />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 border-r-2 border-t-2 border-cyan-300" />
        <span className="absolute -left-0.5 -bottom-0.5 h-3 w-3 border-l-2 border-b-2 border-cyan-300" />
        <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 border-r-2 border-b-2 border-cyan-300" />
      </div>
    </div>
  );
}
