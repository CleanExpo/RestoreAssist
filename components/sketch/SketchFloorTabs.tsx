"use client";

/**
 * SketchFloorTabs — floor switcher with safe flush-save before switch.
 *
 * Prevents the race condition where switching floors mid-draw discards
 * the current floor's unsaved canvas state.
 */

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Layers } from "lucide-react";

export interface SketchFloor {
  id: string;
  floorNumber: number;
  floorLabel: string;
}

export interface SketchFloorTabsProps {
  floors: SketchFloor[];
  activeFloorIdx: number;
  /**
   * Called before floor switch; implementation must flush (save) the
   * current canvas state before resolving.
   */
  onBeforeSwitch?: () => Promise<void>;
  onSwitch: (idx: number) => void;
  onAdd: () => void;
  onRemove?: (idx: number) => void;
  readonly?: boolean;
  className?: string;
}

export function SketchFloorTabs({
  floors,
  activeFloorIdx,
  onBeforeSwitch,
  onSwitch,
  onAdd,
  onRemove,
  readonly = false,
  className,
}: SketchFloorTabsProps) {
  const handleSwitch = useCallback(
    async (idx: number) => {
      if (idx === activeFloorIdx) return;
      await onBeforeSwitch?.();
      onSwitch(idx);
    },
    [activeFloorIdx, onBeforeSwitch, onSwitch],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-2 py-1",
        "border-b border-white/10 bg-[#0d1b2e]",
        "overflow-x-auto scrollbar-none",
        className,
      )}
    >
      <Layers size={13} className="text-white/30 flex-shrink-0 mr-1" />

      {floors.map((floor, idx) => (
        <div key={floor.id} className="flex items-center flex-shrink-0">
          <button
            type="button"
            onClick={() => handleSwitch(idx)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
              idx === activeFloorIdx
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-white/50 hover:text-white/80 hover:bg-white/5",
            )}
          >
            {floor.floorLabel}
          </button>

          {!readonly && floors.length > 1 && idx === activeFloorIdx && (
            <button
              type="button"
              onClick={() => onRemove?.(idx)}
              aria-label={`Remove ${floor.floorLabel}`}
              className="ml-0.5 p-1 text-white/20 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      ))}

      {!readonly && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add floor"
          className="flex items-center gap-1 ml-1 px-2 py-1.5 text-xs text-white/40 hover:text-cyan-400 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
        >
          <Plus size={12} />
          Add floor
        </button>
      )}
    </div>
  );
}
