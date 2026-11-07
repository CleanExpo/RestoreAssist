/**
 * RA-8241 / RA-8233 — client-submitted sketch blobs (homeowner capture) must not
 * land in authoritative `sketchData` with billable provenance or server-only meta.
 * Technicians still confirm and measure through the normal sketch POST route.
 */

import {
  AI_SUGGESTED_PROVENANCE,
  OPERATOR_MEASURED_PROVENANCE,
  UNDERLAY_REFERENCE_PROVENANCE,
} from "./measured-provenance";
import {
  withRoomMeasurementEvidence,
  withAiSuggestedRoomIds,
  readAiSuggestedRoomIds,
} from "./sketch-field-status";
import {
  areaM2FromGeometryOnly,
  resolvePxPerMetre,
  type RoomGeometryObject,
} from "./room-area-from-geometry";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isRoomObject(obj: Record<string, unknown>): boolean {
  const data = asRecord(obj.data);
  return data?.type === "room";
}

function fabricRoomId(data: Record<string, unknown>): string | null {
  const id = data.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Sanitise a sketch blob copied from `pendingHomeownerCapture` (or any
 * client-origin sidecar) before it becomes authoritative sketchData.
 */
export function sanitizeClientPromotedSketchData(
  sketchData: unknown,
): Record<string, unknown> | null {
  if (!sketchData || typeof sketchData !== "object" || Array.isArray(sketchData)) {
    return null;
  }
  const root: Record<string, unknown> = { ...(sketchData as Record<string, unknown>) };
  const objects = root.objects;
  const rememberedAiIds: string[] = [];
  const pxPerMetre = resolvePxPerMetre(
    root as { scaleConfig?: { pxPerMetre?: number } },
  );

  if (Array.isArray(objects)) {
    root.objects = objects.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const obj = { ...(raw as Record<string, unknown>) };
      if (!isRoomObject(obj)) return obj;

      const data = asRecord(obj.data);
      if (!data) return obj;

      const nextData: Record<string, unknown> = { ...data };
      const roomId = fabricRoomId(nextData);

      if (nextData.provenance === AI_SUGGESTED_PROVENANCE) {
        if (roomId) rememberedAiIds.push(roomId);
      } else if (nextData.provenance === OPERATOR_MEASURED_PROVENANCE) {
        nextData.provenance = UNDERLAY_REFERENCE_PROVENANCE;
      } else if (
        nextData.provenance == null ||
        nextData.provenance === "" ||
        nextData.provenance === UNDERLAY_REFERENCE_PROVENANCE
      ) {
        nextData.provenance = UNDERLAY_REFERENCE_PROVENANCE;
      }

      if (nextData.captureAdapter !== "cloud_ai") {
        nextData.captureAdapter = "homeowner";
      }

      delete nextData.confirmedAt;
      delete nextData.confirmedBy;

      if (nextData.captureAdapter === "homeowner") {
        const geometryArea = areaM2FromGeometryOnly(
          { ...obj, data: nextData } as RoomGeometryObject,
          pxPerMetre,
        );
        if (geometryArea !== null) {
          nextData.areaM2 = Math.round(geometryArea * 100) / 100;
        }
        delete nextData.lengthM;
        delete nextData.widthM;
        delete nextData.perimeterM;
      }

      return { ...obj, data: nextData };
    });
  }

  let sanitized = withRoomMeasurementEvidence(root, []) as Record<string, unknown>;
  const extraAi = rememberedAiIds.filter(
    (id) => !readAiSuggestedRoomIds(sanitized).includes(id),
  );
  if (extraAi.length > 0) {
    sanitized = withAiSuggestedRoomIds(sanitized, extraAi);
  }
  return sanitized;
}

/** Room polygons promoted from homeowner capture that need on-site measurement. */
export function countHomeownerRoomsInSketch(sketchData: unknown): number {
  const root = asRecord(sketchData);
  const objects = root?.objects;
  if (!Array.isArray(objects)) return 0;
  let count = 0;
  for (const raw of objects) {
    const obj = asRecord(raw);
    const data = obj ? asRecord(obj.data) : null;
    if (
      data?.type === "room" &&
      data.captureAdapter === "homeowner"
    ) {
      count++;
    }
  }
  return count;
}
