/**
 * Room panel edits write `data` in place. Fabric does not emit
 * object:modified for that, so undo history never records the edit and
 * the canvas onModified handler never schedules its own save.
 *
 * The voice asbestos latch fires object:modified, then schedules the
 * debounced save. Label, material, water category and size use the same
 * sequence.
 */

export function commitRoomPanelEdit(
  canvas: unknown,
  target: unknown,
  scheduleSave: () => void,
): void {
  const fire = (
    canvas as {
      fire?: (event: string, payload: { target: unknown }) => void;
    }
  ).fire;
  fire?.("object:modified", { target });
  scheduleSave();
}
