/**
 * Helpers for restoring ClaimSketch.sketchData onto a Fabric canvas after mount.
 *
 * SketchEditorV2 previously called loadFromJSON immediately after setState —
 * before SketchCanvas had assigned the ref — so drawings never reappeared on
 * reload. Pending JSON must be held on FloorData and applied in onReady.
 */

import type { RoomMoistureCropMeta } from "./room-moisture-crop";
import { isRoomAllowlistFill } from "./room-colors";
import { SKETCH_META_KEY } from "./sketch-field-status";

export type StoredSketchData = Record<string, unknown>;

/** Editor-only keys that must not reach Fabric loadFromJSON. */
const EDITOR_ONLY_KEYS = [
  "scaleConfig",
  "roomMoistureCrop",
  "damageMarkers",
  SKETCH_META_KEY,
] as const;

function objectHasCustomData(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const data = (obj as { data?: unknown }).data;
  return data != null && typeof data === "object";
}

function newLostRoomId(): string {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A data-less Polygon with a room-tool / ROOM_COLORS fill is a room whose
 * custom `data` was dropped by Fabric 7 toJSON() (RA-7655). Damage tints
 * and the north arrow are also polygons but use other fills.
 */
function isDataLessRoomPolygon(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || objectHasCustomData(obj)) return false;
  const o = obj as { type?: unknown; points?: unknown; fill?: unknown };
  const type = typeof o.type === "string" ? o.type.toLowerCase() : "";
  if (type !== "polygon") return false;
  if (!Array.isArray(o.points) || o.points.length < 3) return false;
  return isRoomAllowlistFill(o.fill);
}

function restoreLostRoomData(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...obj,
    data: {
      id: newLostRoomId(),
      type: "room",
      detailsLost: true,
    },
  };
}

/** Strip editor-only keys (e.g. scaleConfig) before Fabric loadFromJSON. */
export function fabricJsonFromStoredSketchData(
  sketchData: unknown,
): StoredSketchData | null {
  if (!sketchData || typeof sketchData !== "object" || Array.isArray(sketchData)) {
    return null;
  }
  const fabricJson = { ...(sketchData as StoredSketchData) };
  for (const key of EDITOR_ONLY_KEYS) {
    delete fabricJson[key];
  }
  if (Array.isArray(fabricJson.objects)) {
    fabricJson.objects = fabricJson.objects.map((obj) =>
      isDataLessRoomPolygon(obj)
        ? restoreLostRoomData(obj as Record<string, unknown>)
        : obj,
    );
  }
  // Empty blob — nothing to restore.
  const objects = fabricJson.objects;
  const hasObjects = Array.isArray(objects) && objects.length > 0;
  const hasBackground = Boolean(
    fabricJson.backgroundImage || fabricJson.background,
  );
  if (!hasObjects && !hasBackground) {
    // Still return the blob so viewport/transform fields can apply if present.
    return Object.keys(fabricJson).length > 0 ? fabricJson : null;
  }
  return fabricJson;
}

export function scaleConfigFromStoredSketchData(
  sketchData: unknown,
): unknown | null {
  if (!sketchData || typeof sketchData !== "object") return null;
  const scaleConfig = (sketchData as StoredSketchData).scaleConfig;
  return scaleConfig ?? null;
}

function isRoomCropRect(v: unknown): v is RoomMoistureCropMeta["crop"] {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.left === "number" &&
    typeof c.top === "number" &&
    typeof c.width === "number" &&
    typeof c.height === "number" &&
    typeof c.roomId === "string" &&
    c.width > 0 &&
    c.height > 0
  );
}

/** Restore room moisture crop meta saved alongside Fabric JSON. */
export function roomMoistureCropFromStoredSketchData(
  sketchData: unknown,
): RoomMoistureCropMeta | null {
  if (!sketchData || typeof sketchData !== "object") return null;
  const raw = (sketchData as StoredSketchData).roomMoistureCrop;
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Record<string, unknown>;
  if (typeof meta.roomId !== "string" || !isRoomCropRect(meta.crop)) {
    return null;
  }
  return {
    roomId: meta.roomId,
    crop: { ...meta.crop, roomId: meta.roomId },
    ...(Array.isArray(meta.roomPoints)
      ? {
          roomPoints: meta.roomPoints.filter(
            (p): p is { x: number; y: number } =>
              !!p &&
              typeof p === "object" &&
              typeof (p as { x?: unknown }).x === "number" &&
              typeof (p as { y?: unknown }).y === "number",
          ),
        }
      : {}),
    ...(typeof meta.canvasWidth === "number" && meta.canvasWidth > 0
      ? { canvasWidth: meta.canvasWidth }
      : {}),
    ...(typeof meta.canvasHeight === "number" && meta.canvasHeight > 0
      ? { canvasHeight: meta.canvasHeight }
      : {}),
  };
}

/** Restore IICRC damage markers saved alongside Fabric JSON (RA-2953). */
export function damageMarkersFromStoredSketchData(
  sketchData: unknown,
): unknown {
  if (!sketchData || typeof sketchData !== "object") return null;
  const raw = (sketchData as StoredSketchData).damageMarkers;
  return Array.isArray(raw) ? raw : null;
}
