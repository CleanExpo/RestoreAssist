/**
 * Room-scoped moisture map helpers (Hydro-style workflow outcome, not UI clone).
 * Crop guides + pin filtering for report-usable room moisture maps.
 */

import { pointInPolygon } from "./geometry-utils";
import { pinPixelPosition } from "./pin-coords";

export const ROOM_MOISTURE_CROP_PADDING_PX = 24;

export interface RoomCropPoint {
  x: number;
  y: number;
}

export interface RoomCropCandidate {
  id: string;
  points: ReadonlyArray<RoomCropPoint>;
  label?: string;
}

export interface RoomCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
  roomId: string;
  label?: string;
}

export interface RoomMoistureCropMeta {
  roomId: string;
  crop: RoomCropRect;
  /** Absolute room polygon — used to filter pins for report PDF pages. */
  roomPoints?: RoomCropPoint[];
  /** Canvas size when crop was taken (for normalized pin filtering). */
  canvasWidth?: number;
  canvasHeight?: number;
}

/** Axis-aligned crop around a room polygon with padding. */
export function roomPolygonToCropRect(
  room: RoomCropCandidate,
  paddingPx = ROOM_MOISTURE_CROP_PADDING_PX,
): RoomCropRect | null {
  if (room.points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  const pad = Math.max(0, paddingPx);
  return {
    left: minX - pad,
    top: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    roomId: room.id,
    label: room.label,
  };
}

export function isPointInRoomCrop(
  x: number,
  y: number,
  roomPoints: ReadonlyArray<RoomCropPoint>,
): boolean {
  if (roomPoints.length < 3) return false;
  return pointInPolygon(x, y, roomPoints);
}

function pinSceneXY<T extends { x: number; y: number; nx?: number; ny?: number }>(
  pin: T,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const { left, top } = pinPixelPosition(pin, canvasWidth, canvasHeight);
  return { x: left, y: top };
}

/** Keep only pins whose scene position lies inside the room polygon. */
export function filterPinsInRoom<
  T extends { x: number; y: number; nx?: number; ny?: number },
>(
  pins: readonly T[],
  roomPoints: ReadonlyArray<RoomCropPoint>,
  canvasWidth: number,
  canvasHeight: number,
): T[] {
  if (roomPoints.length < 3) return [];
  return pins.filter((pin) => {
    const { x, y } = pinSceneXY(pin, canvasWidth, canvasHeight);
    return isPointInRoomCrop(x, y, roomPoints);
  });
}

export function roomCropMeta(
  roomId: string,
  crop: RoomCropRect,
): RoomMoistureCropMeta {
  return { roomId, crop: { ...crop, roomId } };
}

/**
 * Filter normalized (0..1) moisture map pins that fall inside a room polygon.
 * Requires roomPoints in scene pixels plus the canvas size used when nx/ny
 * were computed.
 */
export function filterNormalizedPinsInRoom<
  T extends { nx: number; ny: number },
>(
  pins: readonly T[],
  roomPoints: ReadonlyArray<RoomCropPoint>,
  canvasWidth: number,
  canvasHeight: number,
): T[] {
  if (
    roomPoints.length < 3 ||
    !(canvasWidth > 0) ||
    !(canvasHeight > 0)
  ) {
    return [];
  }
  return pins.filter((pin) => {
    const x = pin.nx * canvasWidth;
    const y = pin.ny * canvasHeight;
    return isPointInRoomCrop(x, y, roomPoints);
  });
}

/**
 * Content-bounds style rect for export firewall — clamps negative origin
 * callers may still pad further via EXPORT_CONTENT_PADDING_PX.
 */
export function contentBoundsForRoomCrop(crop: RoomCropRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: crop.left,
    top: crop.top,
    width: Math.max(1, crop.width),
    height: Math.max(1, crop.height),
  };
}
