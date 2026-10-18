"use client";

/**
 * First-room coach after "Draw from scratch".
 * Field techs place a default room in one tap — don't hide that behind a toast.
 */

import { cn } from "@/lib/utils";
import type { RoomTemplateKind } from "@/lib/sketch/room-defaults";

export interface SketchCreateCoachProps {
  visible: boolean;
  templateKind?: RoomTemplateKind;
  onTemplateKindChange?: (kind: RoomTemplateKind) => void;
  onDismiss?: () => void;
  className?: string;
}

const TEMPLATES: { kind: RoomTemplateKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "L", label: "L-shape" },
  { kind: "T", label: "T-shape" },
];

export function SketchCreateCoach({
  visible,
  templateKind = "rect",
  onTemplateKindChange,
  onDismiss,
  className,
}: SketchCreateCoachProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute bottom-4 left-4 right-4 sm:right-auto z-[9] pointer-events-none",
        className,
      )}
      role="status"
      aria-label="Draw first room"
    >
      <div className="pointer-events-auto max-w-lg w-full rounded-xl border border-white/12 bg-[#0E1518]/92 backdrop-blur-md px-4 py-3 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">
              Draw from scratch
            </p>
            <p className="mt-0.5 text-sm font-medium text-white leading-snug">
              Tap the canvas to place a 3.86 × 3.86 m room
            </p>
            <p className="mt-0.5 text-[11px] text-white/45 leading-snug hidden sm:block">
              Drag a diagonal for custom size · edit L×W after selecting the room
            </p>
          </div>

          {onTemplateKindChange && (
            <div
              className="flex gap-1.5 shrink-0"
              role="group"
              aria-label="Room template"
            >
              {TEMPLATES.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={templateKind === kind}
                  onClick={() => onTemplateKindChange(kind)}
                  className={cn(
                    "min-h-9 min-w-[4.5rem] rounded-lg border px-2 text-[11px] font-semibold",
                    templateKind === kind
                      ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-100"
                      : "border-white/12 text-white/65 hover:bg-white/5",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-2 text-[11px] text-white/40 hover:text-white/70"
          >
            Hide this tip
          </button>
        )}
      </div>
    </div>
  );
}
