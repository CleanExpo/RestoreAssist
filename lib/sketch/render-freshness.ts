/**
 * Tracks whether the sketch canvas has edits that have NOT yet been captured
 * into a fresh rendered PNG.
 *
 * The editor's debounced auto-save persists the vector `sketchData` but skips
 * the expensive rasterise-and-upload, so the stored `renderedPngUrl` (which the
 * canonical report embeds — the server can't render Fabric) can lag behind the
 * latest edits. This tracker lets the editor know it should flush one render
 * before the user leaves, so a report generated afterwards isn't stale.
 */
export interface RenderFreshnessTracker {
  /** Call whenever the canvas changes (a debounced save was scheduled). */
  markEdited(): void;
  /** Call whenever a fresh render has been captured + uploaded (a flush save). */
  markRendered(): void;
  /** True when edits exist that a leave-time flush should capture. */
  shouldFlushOnLeave(): boolean;
}

export function createRenderFreshnessTracker(): RenderFreshnessTracker {
  let unrenderedEdits = false;
  return {
    markEdited() {
      unrenderedEdits = true;
    },
    markRendered() {
      unrenderedEdits = false;
    },
    shouldFlushOnLeave() {
      return unrenderedEdits;
    },
  };
}
