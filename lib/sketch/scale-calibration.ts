/**
 * RA-8237 — per-floor scale calibration with its source history.
 *
 * A floor's `scaleConfig` is the only input that turns drawn pixels into
 * metres. Recalibrating replaces the active scale; the calibration it
 * replaced is kept on `scaleConfig.history` (oldest first) so the floor's
 * measurement evidence can be explained after the fact. Rooms tagged with a
 * geometry source re-derive their quantities from the new scale (see
 * resolveRoomQuantities), and the server invalidates measurement evidence
 * bound to the old one (room-measurement-evidence.ts).
 */

/** Keep the last N calibrations; older ones are dropped oldest-first. */
export const MAX_CALIBRATION_HISTORY = 20;

export interface CalibrationEntry {
  pxPerMetre: number;
  description?: string;
  realMetres?: number;
  pointA?: { x: number; y: number };
  pointB?: { x: number; y: number };
  calibratedAt?: string;
}

/**
 * The scale config to store after a recalibration: `next`, stamped with
 * `at`, carrying the previous calibration (without its own history) appended
 * to the previous history.
 */
export function withCalibrationHistory<T extends CalibrationEntry>(
  prev: (CalibrationEntry & { history?: unknown }) | null | undefined,
  next: T,
  at: string,
): T & { calibratedAt: string; history: CalibrationEntry[] } {
  const history: CalibrationEntry[] = Array.isArray(prev?.history)
    ? [...(prev.history as CalibrationEntry[])]
    : [];
  if (prev && typeof prev.pxPerMetre === "number") {
    const { history: _previousHistory, ...entry } = prev;
    history.push(entry);
  }
  const { history: _ignored, ...cleanNext } = next as T & { history?: unknown };
  return {
    ...(cleanNext as T),
    calibratedAt: at,
    history: history.slice(-MAX_CALIBRATION_HISTORY),
  };
}
