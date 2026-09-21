/**
 * RA-7610 — join a MoistureReading to a drawn SketchRoom.
 *
 * A reading with sketchRoomId is the source of truth. Free-text `location`
 * remains the fallback used today (exact or substring, case-insensitive)
 * when the FK is null — readings taken before the plan existed, or in a
 * space that is not on the plan.
 *
 * AffectedArea has no sketchRoomId in this change, so a linked reading
 * matches an area when the SketchRoom name matches roomZoneId.
 */

export interface ReadingRoomJoinInput {
  location: string;
  sketchRoomId?: string | null;
  sketchRoom?: { id?: string; name: string } | null;
}

export interface AreaRoomJoinInput {
  roomZoneId: string;
}

export interface HeatmapRoom {
  id: string;
  name: string;
}

/** Today's name match — kept as the null-FK fallback (RA-7607). */
export function locationMatchesRoomName(
  location: string,
  roomName: string,
): boolean {
  return (
    location === roomName ||
    location.toLowerCase().includes(roomName.toLowerCase())
  );
}

export function readingMatchesArea(
  reading: ReadingRoomJoinInput,
  area: AreaRoomJoinInput,
): boolean {
  if (reading.sketchRoomId) {
    const roomName = reading.sketchRoom?.name;
    if (roomName && locationMatchesRoomName(roomName, area.roomZoneId)) {
      return true;
    }
    if (area.roomZoneId === reading.sketchRoomId) return true;
  }
  return locationMatchesRoomName(reading.location, area.roomZoneId);
}

export function heatmapReadingsForRoom<T extends ReadingRoomJoinInput>(
  readings: T[],
  room: HeatmapRoom,
): T[] {
  return readings.filter((reading) => {
    if (reading.sketchRoomId) return reading.sketchRoomId === room.id;
    return locationMatchesRoomName(reading.location, room.name);
  });
}

export function dryingLocationForReading(
  reading: ReadingRoomJoinInput,
): string | null {
  if (reading.sketchRoomId && reading.sketchRoom?.name) {
    return reading.sketchRoom.name;
  }
  return reading.location ?? null;
}
