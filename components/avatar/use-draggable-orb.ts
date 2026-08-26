"use client";

/**
 * useDraggableOrb — lets the floating Margot orb be moved out of the way.
 *
 * WHY THIS EXISTS
 * ---------------
 * The orb is `position: fixed` in a screen corner. On a phone that corner is
 * also where signup form controls and the on-screen keyboard land, so Margot
 * covered the very fields she was meant to help with, and the only way to
 * touch her was the way that opened her chat panel.
 *
 * Dragging and tapping share one gesture on touch: a tap IS a pointerdown
 * followed by a pointerup. They are told apart by distance travelled, not by
 * a long-press timer — a timer makes every deliberate tap wait, and a slow
 * drag never registers. Past DRAG_THRESHOLD_PX the gesture becomes a drag and
 * the click that the browser fires afterwards is suppressed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface OrbPosition {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Pointer travel past which a gesture counts as a drag rather than a tap.
 * 8px is the usual slop allowance for a finger that does not hold perfectly
 * still; below it, a tap that wobbles would be swallowed as a drag.
 */
export const DRAG_THRESHOLD_PX = 8;

/** Gap kept between the orb and the viewport edge. */
export const EDGE_MARGIN_PX = 8;

/** Distance one arrow-key press moves the orb (Shift multiplies it). */
export const KEYBOARD_STEP_PX = 16;
export const KEYBOARD_STEP_LARGE_PX = 48;

export const ORB_POSITION_STORAGE_KEY = "ra-margot-orb-position";

/**
 * Keep the orb fully on screen.
 *
 * Clamping matters most on rotation and on mobile browsers that resize the
 * viewport when the keyboard opens: a position saved in portrait can sit
 * entirely off-screen in landscape, leaving Margot unreachable with no way to
 * bring her back.
 */
export function clampToViewport(
  pos: OrbPosition,
  size: number,
  viewport: Viewport,
  margin: number = EDGE_MARGIN_PX,
): OrbPosition {
  // Math.max guards the degenerate case where the orb is wider than the
  // viewport — without it maxX < margin and the orb pins to the wrong edge.
  const maxX = Math.max(margin, viewport.width - size - margin);
  const maxY = Math.max(margin, viewport.height - size - margin);
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  };
}

/** A stored position is only usable if both axes are finite numbers. */
export function parseStoredPosition(raw: string | null): OrbPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { x, y } = parsed as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

/** Gap between the orb and the panel anchored to it. */
export const PANEL_GAP_PX = 12;

/**
 * Place the chat panel next to wherever the orb now sits.
 *
 * Without this the panel stays pinned to the bottom-right corner while the orb
 * is somewhere else entirely, which reads as two unrelated widgets. The panel
 * flips to whichever side has room, then clamps, so it is always fully on
 * screen even when the orb is pushed into a corner.
 */
export function computePanelAnchor(
  orb: OrbPosition,
  orbSize: number,
  viewport: Viewport,
  panel: { width: number; height: number },
  margin: number = EDGE_MARGIN_PX,
): OrbPosition {
  // Above the orb when it sits in the lower half, below it otherwise.
  const orbCentreY = orb.y + orbSize / 2;
  const preferAbove = orbCentreY > viewport.height / 2;
  const top = preferAbove
    ? orb.y - PANEL_GAP_PX - panel.height
    : orb.y + orbSize + PANEL_GAP_PX;

  // Align the panel's near edge with the orb's, on whichever side has room.
  const orbCentreX = orb.x + orbSize / 2;
  const preferRightAligned = orbCentreX > viewport.width / 2;
  const left = preferRightAligned
    ? orb.x + orbSize - panel.width
    : orb.x;

  // Clamp the panel's own box rather than reusing clampToViewport, whose
  // `size` argument describes a square orb, not a rectangular panel.
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
  const maxTop = Math.max(margin, viewport.height - panel.height - margin);
  return {
    x: Math.min(Math.max(left, margin), maxLeft),
    y: Math.min(Math.max(top, margin), maxTop),
  };
}

interface UseDraggableOrbResult {
  /** Null until the user moves the orb — until then the CSS class positions it. */
  position: OrbPosition | null;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * True exactly once after a drag, so the click the browser fires on
   * pointerup can be ignored instead of opening the chat panel.
   */
  consumeDragSuppression: () => boolean;
  /** Clears the saved position and returns the orb to its default corner. */
  resetPosition: () => void;
}

export function useDraggableOrb(
  size: number,
  storageKey: string = ORB_POSITION_STORAGE_KEY,
): UseDraggableOrbResult {
  const [position, setPosition] = useState<OrbPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const draggedRef = useRef(false);
  const gestureRef = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const viewport = (): Viewport => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Restore a saved position after mount only. Reading localStorage during
  // render would diverge from the SSR tree and produce a hydration mismatch.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      // Private mode / blocked site data — fall back to the default corner.
    }
    const parsed = parseStoredPosition(stored);
    if (parsed) setPosition(clampToViewport(parsed, size, viewport()));
  }, [size, storageKey]);

  // Re-clamp on resize and rotation so a stored position can never strand the
  // orb off-screen.
  useEffect(() => {
    if (!position) return;
    const onResize = () =>
      setPosition((prev) =>
        prev ? clampToViewport(prev, size, viewport()) : prev,
      );
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [position, size]);

  const persist = useCallback(
    (next: OrbPosition) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Position still applies for this page view; it just will not persist.
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Ignore secondary mouse buttons so right-click never starts a drag.
      if (event.button !== 0) return;

      const node = event.currentTarget;
      const rect = node.getBoundingClientRect();
      gestureRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        originX: rect.left,
        originY: rect.top,
      };
      // A fresh gesture clears any suppression the previous one left behind —
      // a drag that ends without a click must not swallow the next tap.
      draggedRef.current = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const dx = moveEvent.clientX - gesture.pointerX;
        const dy = moveEvent.clientY - gesture.pointerY;

        if (!draggedRef.current) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          draggedRef.current = true;
          setIsDragging(true);
        }

        setPosition(
          clampToViewport(
            { x: gesture.originX + dx, y: gesture.originY + dy },
            size,
            viewport(),
          ),
        );
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        gestureRef.current = null;
        setIsDragging(false);
        setPosition((prev) => {
          if (prev && draggedRef.current) persist(prev);
          return prev;
        });
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [persist, size],
  );

  /** Arrow keys move the orb too — dragging must not be pointer-only. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEYBOARD_STEP_LARGE_PX : KEYBOARD_STEP_PX;
      const delta: Record<string, OrbPosition> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const move = delta[event.key];
      if (!move) return;
      event.preventDefault();

      const rect = event.currentTarget.getBoundingClientRect();
      const next = clampToViewport(
        { x: rect.left + move.x, y: rect.top + move.y },
        size,
        viewport(),
      );
      setPosition(next);
      persist(next);
    },
    [persist, size],
  );

  const consumeDragSuppression = useCallback(() => {
    const dragged = draggedRef.current;
    draggedRef.current = false;
    return dragged;
  }, []);

  const resetPosition = useCallback(() => {
    setPosition(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to clean up if site data is blocked.
    }
  }, [storageKey]);

  return {
    position,
    isDragging,
    onPointerDown,
    onKeyDown,
    consumeDragSuppression,
    resetPosition,
  };
}
