/**
 * RA-8241 — summarise quarantined homeowner capture for staff UI.
 */

export type PendingHomeownerFloor = {
  floorNumber: number;
  floorLabel: string;
  pendingHomeownerCapture?: unknown;
};

export type PendingHomeownerSummary = {
  pendingFloors: number;
  pendingRoomCount: number;
  floorLabels: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function countRoomsInSketchData(sketchData: unknown): number {
  const root = asRecord(sketchData);
  const objects = root?.objects;
  if (!Array.isArray(objects)) return 0;
  let n = 0;
  for (const raw of objects) {
    const data = asRecord(asRecord(raw)?.data);
    if (data?.type === "room") n++;
  }
  return n;
}

export function summarizePendingHomeownerCapture(
  floors: PendingHomeownerFloor[],
): PendingHomeownerSummary {
  let pendingFloors = 0;
  let pendingRoomCount = 0;
  const floorLabels: string[] = [];

  for (const floor of floors) {
    const pending = asRecord(floor.pendingHomeownerCapture);
    if (!pending) continue;
    const sketch = pending.sketchData;
    const rooms = countRoomsInSketchData(sketch);
    const hasSketch =
      sketch != null &&
      typeof sketch === "object" &&
      !Array.isArray(sketch);
    if (!hasSketch && rooms === 0) continue;
    pendingFloors += 1;
    pendingRoomCount += rooms;
    floorLabels.push(floor.floorLabel || `Floor ${floor.floorNumber}`);
  }

  return { pendingFloors, pendingRoomCount, floorLabels };
}
