/**
 * RA-8576 - the one list of what can hang off a SketchRoom.
 *
 * Every table that links to SketchRoom does so with onDelete: SetNull, so
 * deleting a room that something points at silently blanks that link. Anything
 * that decides whether a room is safe to delete must count every one of those
 * tables, and this is the only place that names them.
 *
 * The list used to be kept by hand in two places and drifted from the schema:
 * RoomObservation was never on it, so a room holding observations was deleted
 * and the observations lost their room. It is now checked against
 * prisma/schema.prisma by lib/sketch/__tests__/room-dependents.test.ts, which
 * fails the build when a table gains a link to SketchRoom and is not added
 * here. The same list drives the two-session race test, so a new dependent
 * also needs a writer case there.
 */

/** The SketchRoom relation names other tables hold a foreign key through. */
export const SKETCH_ROOM_DEPENDENT_RELATIONS = [
  "evidencePins",
  "moistureReadings",
  "jobMoistureReadings",
  "scopeItems",
  "hazards",
  "roomObservations",
  // RA-8501: ContentsPackOutItem.sketchRoomId is SetNull too.
  "contentsPackOutItems",
] as const;

/** `_count.select` argument covering every dependent relation. */
export const SKETCH_ROOM_DEPENDENT_COUNT_SELECT: Record<string, true> =
  Object.fromEntries(
    SKETCH_ROOM_DEPENDENT_RELATIONS.map((name) => [name, true as const]),
  );
