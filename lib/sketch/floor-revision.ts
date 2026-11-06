/**
 * RA-8056 — floor-plan revision precondition (shared by editor, queue, route).
 *
 * The editor records the revision of each floor it loaded and sends it with
 * every save in `x-sketch-revision`. A floor it has never seen saved is sent
 * as `none`. The sketches route refuses a save whose revision is not the
 * stored floor's, so a tab opened before another tab added a room cannot
 * replace the floor with its older room snapshot (room sync would delete or
 * detach the newer room, and with it the evidence links).
 *
 * The revision is a digest of the stored drawing (see floor-revision-server),
 * not `updatedAt`: underlay and AI-import writes touch the row without
 * changing any room, and must not make the editor refuse its own next save.
 *
 * The offline queue stores the revision with the save and replays it
 * unchanged, so a delayed replay is checked against the floor it was based on.
 */

export const FLOOR_REVISION_HEADER = "x-sketch-revision";
/** The editor has never seen this floor saved; the save may only create it. */
export const NEW_FLOOR_REVISION = "none";

export type FloorRevisionPrecondition =
  | { kind: "absent" }
  | { kind: "new" }
  | { kind: "at"; revision: string }
  | { kind: "invalid" };

const REVISION_PATTERN = /^[0-9a-f]{64}$/;

export function parseFloorRevision(
  raw: string | null | undefined,
): FloorRevisionPrecondition {
  if (raw == null) return { kind: "absent" };
  const value = raw.trim();
  if (value === "") return { kind: "absent" };
  if (value === NEW_FLOOR_REVISION) return { kind: "new" };
  return REVISION_PATTERN.test(value)
    ? { kind: "at", revision: value }
    : { kind: "invalid" };
}

/**
 * Whether a precondition holds against the stored floor's revision
 * (`null` = no floor stored).
 */
export function floorRevisionMatches(
  precondition: FloorRevisionPrecondition,
  storedRevision: string | null,
): boolean {
  switch (precondition.kind) {
    case "absent":
      return true;
    case "invalid":
      return false;
    case "new":
      return storedRevision == null;
    case "at":
      return storedRevision === precondition.revision;
  }
}

/** A 409 body naming a revision conflict (as opposed to a stale replay). */
export function isFloorRevisionConflict(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { conflict?: unknown }).conflict === "revision"
  );
}

/** The revision a sketches response carries, when it is a valid one. */
export function readFloorRevision(body: unknown): string | null {
  const value =
    body && typeof body === "object"
      ? (body as { revision?: unknown }).revision
      : undefined;
  return typeof value === "string" && REVISION_PATTERN.test(value)
    ? value
    : null;
}
