/**
 * Room panel edits write `data` in place. Fabric does not emit
 * object:modified for that, so undo history never records the edit and
 * the canvas onModified handler never schedules its own save.
 *
 * The voice asbestos latch fires object:modified, then schedules the
 * debounced save. Label, material, water category and size use the same
 * sequence.
 *
 * Call fire on the canvas so `this` stays bound. Fabric reads
 * this.__eventListeners; a detached call throws and the save never
 * starts. scheduleSave still runs when a listener throws.
 */

export function commitRoomPanelEdit(
  canvas: unknown,
  target: unknown,
  scheduleSave: () => void,
): void {
  try {
    (
      canvas as {
        fire?: (event: string, payload: { target: unknown }) => void;
      } | null
    )?.fire?.("object:modified", { target });
  } finally {
    scheduleSave();
  }
}
