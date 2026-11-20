"use client";

import { useEffect, useState } from "react";
import { SketchMeasurementChecklist } from "./SketchMeasurementChecklist";
import type { RoomNeedingMeasurement } from "@/lib/sketch/rooms-needing-measurement";

export function SketchMeasurementChecklistLoader({
  inspectionId,
  refreshToken = 0,
}: {
  inspectionId: string;
  refreshToken?: number;
}) {
  const [rooms, setRooms] = useState<RoomNeedingMeasurement[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/homeowner-capture-status`,
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          data?: { measurementRooms?: RoomNeedingMeasurement[] };
        };
        setRooms(body.data?.measurementRooms ?? []);
      } catch {
        if (!cancelled) setRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId, refreshToken]);

  return <SketchMeasurementChecklist inspectionId={inspectionId} rooms={rooms} />;
}
