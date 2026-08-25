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
        "absolute inset-0 z-9 flex items-center justify-center pointer-events-none",
        className,
      )}
      role="status"
      aria-label="Draw first room"
    >
      <div className="pointer-events-auto mx-4 max-w-sm w-full rounded-2xl border border-white/12 bg-[#0E1518]/88 backdrop-blur-md px-4 py-3.5 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C5E063]">
          Draw from scratch
        </p>
        <p className="mt-1 text-sm font-medium text-white">
          Tap the canvas to place a 3.86 × 3.86 m room
        </p>
        <p className="mt-0.5 text-[12px] text-white/50">
          Drag a diagonal for a custom size. Type exact length and width after
          the room is selected.
        </p>

        {onTemplateKindChange && (
          <div
            className="mt-3 flex gap-1.5"
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
                  "flex-1 min-h-10 rounded-lg border text-[12px] font-semibold",
                  templateKind === kind
                    ? "border-[#C5E063] bg-[#C5E063]/15 text-[#C5E063]"
                    : "border-white/12 text-white/65 hover:bg-white/5",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-2 w-full min-h-9 text-[12px] text-white/40 hover:text-white/70"
          >
            Hide this tip
          </button>
        )}
      </div>
    </div>
  );
}
