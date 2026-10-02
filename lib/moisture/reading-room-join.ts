/**
 * RA-7610 — join a MoistureReading to a drawn SketchRoom.
 *
 * A reading with sketchRoomId is the source of truth. Free-text `location`
 * remains the fallback (whole room phrase, case-insensitive)
 * when the FK is null — readings taken before the plan existed, or in a
 * space that is not on the plan.
 *
 * AffectedArea has no sketchRoomId in this change, so a linked reading
 * matches an area only when the SketchRoom name exactly matches roomZoneId.
 */

export interface ReadingRoomJoinInput {
  location: string;
  sketchRoomId?: string | null;
  sketchRoom?: { id?: string; name: string } | null;
  isBaseline?: boolean;
}

export interface AreaRoomJoinInput {
  roomZoneId: string;
}

export interface HeatmapRoom {
  id: string;
  name: string;
}

/** Whole room phrase within a free-text location; avoids Bedroom 3/30 overlap. */
function roomPhraseIndex(location: string, roomName: string): number {
  const text = location.trim().toLowerCase();
  const phrase = roomName.trim().toLowerCase();
  if (!phrase) return -1;
  let index = text.indexOf(phrase);
  while (index >= 0) {
    const before = text[index - 1];
    const after = text[index + phrase.length];
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) &&
        (!after || !/[\p{L}\p{N}]/u.test(after))) return index;
    index = text.indexOf(phrase, index + 1);
  }
  return -1;
}

/** A number or named suffix makes the location a more specific room than the
 * matched prefix: "Bedroom 2" is not the generic "Bedroom" area. */
function hasSpecificRoomSuffix(location: string, roomName: string, index: number): boolean {
  const suffix = location.trim().slice(index + roomName.trim().length);
  const namedSuffix = /^\s*—\s*(\S.*)$/u.exec(suffix)?.[1];
  if (namedSuffix) {
    // The meter form uses "Master bedroom — east wall" for a point within the
    // room. A named space such as "Living Room — Rear Lounge" stays distinct.
    return !/^(?:(?:north|south|east|west)(?:ern)?|north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west)\s+wall\b/iu.test(namedSuffix);
  }
  // A room number is a complete integer token. "Kitchen 1.2m" and
  // "Kitchen 1 m" describe a measurement, not another Kitchen.
  const number = /^\s+(\d+)(?=$|\s|—|[.,;:](?=\s|$))/u.exec(suffix);
  if (!number) return false;
  const afterNumber = suffix.slice(number[0].length);
  return !/^\s+(?:mm|cm|km|m|ft|feet|metres?|meters?)\b/iu.test(afterNumber);
}

/** A numeric room label must not stop halfway through a decimal distance. */
function hasMeasurementContinuation(location: string, roomName: string, index: number): boolean {
  if (!/\d$/u.test(roomName.trim())) return false;
  const suffix = location.trim().slice(index + roomName.trim().length);
  return /^[.,]\d/u.test(suffix) ||
    /^\s+(?:mm|cm|km|m|ft|feet|metres?|meters?)\b/iu.test(suffix);
}

/** Free-text fallback for readings without a drawn-room link (RA-7607). */
export function locationMatchesRoomName(
  location: string,
  roomName: string,
): boolean {
  const index = roomPhraseIndex(location, roomName);
  return index >= 0 &&
    !hasSpecificRoomSuffix(location, roomName, index) &&
    !hasMeasurementContinuation(location, roomName, index);
}

export function readingMatchesArea(
  reading: ReadingRoomJoinInput,
  area: AreaRoomJoinInput,
): boolean {
  if (reading.isBaseline) return false;
  if (reading.sketchRoomId) {
    // The room link decides. Free-text location must not also pull a linked
    // reading into a second room's area.
    if (area.roomZoneId === reading.sketchRoomId) return true;
    const roomName = reading.sketchRoom?.name;
    return Boolean(
      roomName && roomName.trim().toLowerCase() === area.roomZoneId.trim().toLowerCase(),
    );
  }
  return locationMatchesRoomName(reading.location, area.roomZoneId);
}

/**
 * A linked reading must resolve to exactly one affected area. Zero matches
 * omits it from scope; multiple legacy rows with the same name count it more
 * than once. Unlinked readings remain inspection-wide, and a draft without
 * affected areas is handled by the existing submission gate.
 */
export function linkedReadingAreaMismatch(
  reading: ReadingRoomJoinInput,
  areas: AreaRoomJoinInput[],
): boolean {
  return Boolean(
    reading.sketchRoomId &&
    !reading.isBaseline &&
    areas.length > 0 &&
    areas.filter((area) => readingMatchesArea(reading, area)).length !== 1,
  );
}

/** Distinct drawn rooms must not collapse into one affected-area label. */
export function linkedReadingsAreaConflict(
  readings: ReadingRoomJoinInput[],
  areas: AreaRoomJoinInput[],
): boolean {
  if (areas.length === 0) return false;
  const roomByArea = new Map<number, string>();
  for (const reading of readings) {
    if (!reading.sketchRoomId || reading.isBaseline) continue;
    if (linkedReadingAreaMismatch(reading, areas)) return true;
    const areaIndex = areas.findIndex((area) => readingMatchesArea(reading, area));
    const previousRoomId = roomByArea.get(areaIndex);
    if (previousRoomId && previousRoomId !== reading.sketchRoomId) return true;
    roomByArea.set(areaIndex, reading.sketchRoomId);
  }
  return false;
}

/** Flag a location that hints at a renamed/numbered area but joins to none. */
export function unlinkedReadingsAreaAmbiguity(
  readings: ReadingRoomJoinInput[],
  areas: AreaRoomJoinInput[],
): boolean {
  return readings.some((reading) => {
    if (reading.sketchRoomId || reading.isBaseline) return false;
    const matches = areas.filter((area) => readingMatchesArea(reading, area));
    if (matches.length > 1) return true;
    if (matches.length === 1) {
      const label = matches[0].roomZoneId.trim();
      const index = roomPhraseIndex(reading.location, label);
      const suffix = index >= 0
        ? reading.location.trim().slice(index + label.length)
        : "";
      const measuredNumber = /^\s+(\d+)\s+(?:mm|cm|km|m|ft|feet|metres?|meters?)\b/iu.exec(suffix)?.[1];
      // "Kitchen 1 m" can mean a distance in Kitchen or a point in Kitchen 1.
      // If both labels exist, ask for a clear location instead of guessing.
      return Boolean(measuredNumber && areas.some((area) =>
        area.roomZoneId.trim().toLowerCase() === `${label} ${measuredNumber}`.toLowerCase(),
      ));
    }
    return areas.some((area) => {
      const label = area.roomZoneId.trim();
      const exactIndex = roomPhraseIndex(reading.location, label);
      if (exactIndex >= 0 && (
        hasSpecificRoomSuffix(reading.location, label, exactIndex) ||
        hasMeasurementContinuation(reading.location, label, exactIndex)
      )) {
        return true;
      }
      const separator = label.indexOf(" — ");
      const numbered = label.match(/^(.+?) (\d+)$/);
      const aliases = separator >= 0
        ? [label.slice(0, separator), label.slice(separator + 3)]
        : numbered ? [numbered[1]] : [];
      return aliases.some((alias) => {
        const index = roomPhraseIndex(reading.location, alias);
        if (index < 0) return false;
        const after = reading.location.trim().slice(index + alias.length).trimStart();
        // "Bedroom 3 North Wall" must not hint at an unrelated Bedroom 4.
        return !/^\d/.test(after);
      });
    });
  });
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
