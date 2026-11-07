/**
 * RA-8233 / RA-8241 — rooms that must be measured on site before billing.
 */

export type RoomNeedingMeasurement = {
  id: string;
  label: string;
  floorLabel: string;
  reason: "ai_suggested" | "homeowner" | "underlay_reference";
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function roomLabel(data: Record<string, unknown>): string {
  const label = data.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  return "Room";
}

export function roomsNeedingMeasurementFromSketchData(
  sketchData: unknown,
  floorLabel: string,
): RoomNeedingMeasurement[] {
  const root = asRecord(sketchData);
  const objects = root?.objects;
  if (!Array.isArray(objects)) return [];
  const out: RoomNeedingMeasurement[] = [];

  for (const raw of objects) {
    const data = asRecord(asRecord(raw)?.data);
    if (data?.type !== "room") continue;
    const id = data.id;
    if (typeof id !== "string" || !id) continue;
    const provenance = data.provenance;
    const adapter = data.captureAdapter;

    if (provenance === "operator_measured") continue;

    if (provenance === "ai_suggested") {
      out.push({
        id,
        label: roomLabel(data),
        floorLabel,
        reason: "ai_suggested",
      });
      continue;
    }

    if (
      provenance === "underlay_reference" &&
      adapter === "homeowner"
    ) {
      out.push({
        id,
        label: roomLabel(data),
        floorLabel,
        reason: "homeowner",
      });
    }
  }

  return out;
}

export function collectRoomsNeedingMeasurement(
  floors: Array<{ floorLabel: string; sketchData?: unknown | null }>,
): RoomNeedingMeasurement[] {
  const merged: RoomNeedingMeasurement[] = [];
  for (const floor of floors) {
    merged.push(
      ...roomsNeedingMeasurementFromSketchData(
        floor.sketchData,
        floor.floorLabel,
      ),
    );
  }
  return merged;
}
