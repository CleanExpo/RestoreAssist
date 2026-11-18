"use client";

import Link from "next/link";
import type { RoomNeedingMeasurement } from "@/lib/sketch/rooms-needing-measurement";

type Props = {
  inspectionId: string;
  rooms: RoomNeedingMeasurement[];
};

const REASON_LABEL: Record<RoomNeedingMeasurement["reason"], string> = {
  ai_suggested: "AI import",
  homeowner: "Homeowner",
  underlay_reference: "Reference",
};

export function SketchMeasurementChecklist({ inspectionId, rooms }: Props) {
  if (rooms.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-amber-300/50 dark:border-amber-600/40 bg-amber-50/90 dark:bg-amber-950/30 p-3 shadow-sm"
      data-testid="sketch-measurement-checklist"
      role="region"
      aria-label="Rooms needing on-site measurement"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
        On-site measurement required ({rooms.length})
      </h4>
      <p className="text-[11px] text-amber-800/80 dark:text-amber-200/70 mt-0.5">
        These rooms are not billable until measured and confirmed on the sketch.
      </p>
      <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
        {rooms.map((room) => (
          <li
            key={`${room.floorLabel}-${room.id}`}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="font-medium text-amber-950 dark:text-amber-50">
              {room.label}
              <span className="font-normal text-amber-800/70 dark:text-amber-200/60">
                {" "}
                · {room.floorLabel}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300/80">
                {REASON_LABEL[room.reason]}
              </span>
              <Link
                href={`/dashboard/inspections/${inspectionId}?tab=sketch&sketchRoomId=${encodeURIComponent(room.id)}`}
                className="text-cyan-700 dark:text-cyan-400 hover:underline font-medium"
              >
                Open room
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
