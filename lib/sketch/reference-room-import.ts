/**
 * RA-8236 browser side of "stored floor-plan reference to room suggestions".
 *
 * The browser sends only the binding. The server reads the private stored
 * bytes itself, so no image or URL leaves the page on this path.
 */

import { importSketchUserMessage } from "@/lib/sketch/import-sketch-user-message";

export interface UnderlayReferenceBinding {
  referenceId: string;
  contentSha256: string;
  floorNumber: number;
}

const MANUAL_ROUTE =
  "The plan is still on the canvas, so you can trace the rooms by hand.";

/** The server's code for "an earlier read may have been billed, so none ran". */
export const READ_POSSIBLY_CHARGED = "READ_POSSIBLY_CHARGED";

export function requestReferenceRooms(
  inspectionId: string,
  binding: UnderlayReferenceBinding,
  submit: typeof fetch = fetch,
): Promise<Response> {
  return submit(`/api/inspections/${inspectionId}/sketches/import-from-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(binding),
  });
}

/** A replayed read returns the same ids, so a retry can never add a room twice. */
export function omitRoomsAlreadyOnCanvas<T extends { id?: string }>(
  rooms: T[],
  placedIds: ReadonlySet<string>,
): T[] {
  return rooms.filter((room) => !room.id || !placedIds.has(room.id));
}

export function referenceImportFailureMessage(
  status: number,
  body: unknown,
  retryAfterHeader?: string | null,
): string {
  if (status === 404) {
    return "That floor plan is no longer the active reference for this floor. Upload it again to get room suggestions.";
  }
  if (
    status === 409 &&
    (body as { code?: unknown } | null)?.code === READ_POSSIBLY_CHARGED
  ) {
    return `An earlier read of this floor plan may already have been charged, so it was not run again. ${MANUAL_ROUTE}`;
  }
  if (status === 409) {
    return `This floor plan is already being read. Wait a moment and try again. ${MANUAL_ROUTE}`;
  }
  return `${importSketchUserMessage(status, body, retryAfterHeader)} ${MANUAL_ROUTE}`;
}
