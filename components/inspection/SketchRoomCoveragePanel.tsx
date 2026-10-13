"use client";

import Link from "next/link";
import { Droplets, Layers, MapPin } from "lucide-react";

type RoomRow = {
  id: string;
  name: string;
  moistureCount: number;
  hasScope: boolean;
};

type Props = {
  inspectionId: string;
  rooms: Array<{ id: string; name: string }>;
  moistureReadings: Array<{ sketchRoomId?: string | null }>;
  scopeItems: Array<{
    sketchRoomId?: string | null;
    roomZoneId?: string | null;
    isSelected?: boolean;
  }>;
};

/**
 * Surfaces rooms on the floor plan that still need moisture or scope linkage.
 */
export function SketchRoomCoveragePanel({
  inspectionId,
  rooms,
  moistureReadings,
  scopeItems,
}: Props) {
  if (rooms.length === 0) return null;

  const moistureByRoom = new Map<string, number>();
  for (const r of moistureReadings) {
    if (!r.sketchRoomId) continue;
    moistureByRoom.set(
      r.sketchRoomId,
      (moistureByRoom.get(r.sketchRoomId) ?? 0) + 1,
    );
  }
  const scopeRoomIds = new Set(
    scopeItems
      .filter((i) => i.isSelected !== false)
      .map((i) => i.sketchRoomId)
      .filter(Boolean) as string[],
  );
  const scopeZones = new Set(
    scopeItems
      .filter((i) => i.isSelected !== false && i.roomZoneId)
      .map((i) => i.roomZoneId!.toLowerCase()),
  );

  const rows: RoomRow[] = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    moistureCount: moistureByRoom.get(room.id) ?? 0,
    hasScope:
      scopeRoomIds.has(room.id) ||
      scopeZones.has(room.name.toLowerCase()),
  }));

  const gaps = rows.filter((r) => r.moistureCount === 0 || !r.hasScope);

  return (
    <div
      className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50/80 dark:bg-slate-900/40 p-3"
      data-testid="sketch-room-coverage-panel"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-slate-300">
        Room coverage (drying & scope)
      </h4>
      <p className="text-[11px] text-neutral-500 dark:text-slate-400 mt-0.5">
        Each affected room should have plan pins and a matching scope line.
      </p>
      <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
        {rows.map((room) => {
          const needsMoisture = room.moistureCount === 0;
          const needsScope = !room.hasScope;
          return (
            <li
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className="font-medium text-neutral-800 dark:text-slate-200">
                {room.name}
              </span>
              <span className="flex flex-wrap gap-2">
                {needsMoisture ? (
                  <>
                    <Link
                      href={`/dashboard/inspections/${inspectionId}?tab=sketch&sketchRoomId=${encodeURIComponent(room.id)}&mapMoisture=1`}
                      className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline"
                    >
                      <MapPin size={12} />
                      Pin on plan
                    </Link>
                    <Link
                      href={`/dashboard/inspections/${inspectionId}?tab=moisture&sketchRoomId=${encodeURIComponent(room.id)}&roomName=${encodeURIComponent(room.name)}`}
                      className="inline-flex items-center gap-1 text-cyan-600/80 dark:text-cyan-500 hover:underline"
                    >
                      <Droplets size={12} />
                      Reading
                    </Link>
                  </>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {room.moistureCount} reading
                    {room.moistureCount === 1 ? "" : "s"}
                  </span>
                )}
                {needsScope && (
                  <Link
                    href={`/dashboard/inspections/${inspectionId}?tab=scope&roomZone=${encodeURIComponent(room.name)}`}
                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <Layers size={12} />
                    Scope
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {gaps.length === 0 && (
        <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          All rooms have moisture and scope references.
        </p>
      )}
    </div>
  );
}
