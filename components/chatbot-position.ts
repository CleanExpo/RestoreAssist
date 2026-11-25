/**
 * Where the floating Margot button sits, and how it moves.
 *
 * The button is fixed to the screen. Its default position is lifted clear of
 * the bottom bars (the mobile tab bar is 64px tall plus the device safe area,
 * and the guided-interview action bar is about the same), and the user can drag
 * it anywhere else. The dragged position is kept in this browser only.
 *
 * Offsets are distances from the right and bottom edges of the viewport, in
 * CSS pixels, so a rotation or a resize keeps the button on the same side.
 */

export interface FabPosition {
  right: number;
  bottom: number;
}

/** Diameter of the button (w-16). */
export const FAB_SIZE = 64;
/** Smallest gap kept between the button and any screen edge. */
export const FAB_EDGE_GAP = 8;
/** A pointer must travel this far before a press counts as a drag, not a tap. */
export const FAB_DRAG_THRESHOLD = 6;
/** Gap between the button and the chat window above it. */
export const FAB_PANEL_GAP = 8;

export const FAB_STORAGE_KEY = "margot-button-position";

/** Keep the whole button on screen. */
export function clampFabPosition(
  pos: FabPosition,
  viewport: { width: number; height: number },
): FabPosition {
  const maxRight = Math.max(FAB_EDGE_GAP, viewport.width - FAB_SIZE - FAB_EDGE_GAP);
  const maxBottom = Math.max(FAB_EDGE_GAP, viewport.height - FAB_SIZE - FAB_EDGE_GAP);
  return {
    right: Math.min(Math.max(pos.right, FAB_EDGE_GAP), maxRight),
    bottom: Math.min(Math.max(pos.bottom, FAB_EDGE_GAP), maxBottom),
  };
}

/** Read a saved position; anything that is not two finite numbers is ignored. */
export function parseFabPosition(raw: string | null): FabPosition | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FabPosition> | null;
    if (
      v &&
      typeof v.right === "number" &&
      typeof v.bottom === "number" &&
      Number.isFinite(v.right) &&
      Number.isFinite(v.bottom)
    ) {
      return { right: v.right, bottom: v.bottom };
    }
  } catch {
    // fall through: a corrupt value means "no saved position"
  }
  return null;
}
