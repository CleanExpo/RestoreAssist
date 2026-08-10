/**
 * True wall-band rematerialize — split host walls into solid segments with
 * real gaps at openings (instead of continuous stroke + white cut mask).
 */
import {
  openingCutInterval,
  wallSolidSegments,
  type OpeningCutInterval,
  type WallSegment,
} from "./opening-geometry";

export interface OpeningCutSource {
  hostWallT: number;
  widthM: number;
}

/** Convert placed openings into parametric cut intervals on a host wall. */
export function openingsToCutIntervals(
  wall: WallSegment,
  openings: ReadonlyArray<OpeningCutSource>,
  pxPerMetre: number,
): OpeningCutInterval[] {
  return openings.map((o) =>
    openingCutInterval(o.hostWallT, o.widthM, wall, pxPerMetre),
  );
}

/**
 * Solid centerline segments that remain after openings punch gaps in `wall`.
 * Empty openings → single full-length band (caller may skip rematerialize).
 */
export function solidBandsForHost(
  wall: WallSegment,
  openings: ReadonlyArray<OpeningCutSource>,
  pxPerMetre: number,
): WallSegment[] {
  const cuts = openingsToCutIntervals(wall, openings, pxPerMetre);
  return wallSolidSegments(wall, cuts);
}

/** Host stroke should be hidden when bands are drawn with real opening gaps. */
export function shouldRematerializeHostStroke(openingCount: number): boolean {
  return openingCount > 0;
}
