import type { TeacherContext, WaterCategory, WaterClass } from "./types";

/**
 * Raw state the caller has already loaded (from Prisma or IndexedDB).
 *
 * Kept as an exported type so both the server-side Prisma loader (future
 * ticket) and the mobile IndexedDB loader can satisfy the same shape.
 */
export type RawInspectionState = {
  inspectionId: string;
  userId: string;
  propertyCountry: "AU" | "NZ";
  currentRoom?: string | null;
  stage: TeacherContext["stage"];
  classification?: { category: WaterCategory; class: WaterClass } | null;
  photoCount: number;
  /** Ordered oldest → newest. */
  moistureReadings: Array<{ capturedAt: Date; location: string }>;
  sketchHasLidar: boolean;
  makeSafeActions?: Array<{
    action: string;
    completed: boolean;
    applicable: boolean;
  }>;
};

/**
 * Produces a `TeacherContext` snapshot from raw inspection state.
 *
 * Pure function — keeps the router + test suite decoupled from I/O so both
 * Prisma-backed and mobile-IndexedDB callers feed the same structure.
 */
export function buildTeacherContext(state: RawInspectionState): TeacherContext {
  const missingFields: string[] = [];

  // Make-safe gaps — only count applicable actions that remain incomplete.
  for (const action of state.makeSafeActions ?? []) {
    if (action.applicable && !action.completed) {
      missingFields.push(`make_safe.${action.action}`);
    }
  }

  // Moisture gaps — once past arrival, every room the user has entered should
  // have at least one reading before they can progress.
  if (
    state.stage !== "arrival" &&
    state.currentRoom &&
    !state.moistureReadings.some((r) => r.location === state.currentRoom)
  ) {
    missingFields.push(`moisture.${state.currentRoom}`);
  }

  const lastReading =
    state.moistureReadings.length > 0
      ? state.moistureReadings[state.moistureReadings.length - 1]!
      : null;

  return {
    inspectionId: state.inspectionId,
    userId: state.userId,
    jurisdiction: state.propertyCountry,
    currentRoom: state.currentRoom ?? null,
    stage: state.stage,
    waterCategory: state.classification?.category ?? null,
    waterClass: state.classification?.class ?? null,
    missingFields,
    capturedPhotoCount: state.photoCount,
    lastMoistureReadingAt: lastReading ? lastReading.capturedAt : null,
    hasLidarScan: state.sketchHasLidar,
  };
}
