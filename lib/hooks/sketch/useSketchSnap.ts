"use client";

import { useRef, useCallback, useEffect } from "react";
import { snapToGrid, formatMetres } from "@/lib/sketch/geometry-utils";

export interface ScaleConfig {
  /** Canvas pixels per real-world metre */
  pxPerMetre: number;
}

export interface SnapConfig {
  /** Grid size in real-world metres (default 0.25) */
  gridMetres?: number;
  enabled?: boolean;
}

export interface SnapGuide {
  type: "h" | "v";
  /** Canvas coordinate for the guide line */
  coord: number;
}

export interface UseSketchSnapOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale: ScaleConfig;
  snap?: SnapConfig;
  /** Called when a dimension label update is needed */
  onDimensionLabel?: (label: string | null, x: number, y: number) => void;
  /** Called when snap guides change */
  onGuides?: (guides: SnapGuide[]) => void;
}

/**
 * useSketchSnap — grid snap + alignment guide helpers for the sketch tool.
 *
 * Returns a `snapPoint` function that the editor calls when placing vertices.
 * The hook manages an SVG overlay layer (via refs) to draw live alignment guides.
 */
export function useSketchSnap({
  scale,
  snap = {},
  onDimensionLabel,
  onGuides,
}: UseSketchSnapOptions) {
  const { pxPerMetre } = scale;
  const { gridMetres = 0.25, enabled = true } = snap;
  const gridPx = gridMetres * pxPerMetre;

  const guidesRef = useRef<SnapGuide[]>([]);

  /** Snap a canvas point to the current grid */
  const snapPoint = useCallback(
    (p: { x: number; y: number }): { x: number; y: number } => {
      if (!enabled) return p;
      return {
        x: snapToGrid(p.x, gridPx),
        y: snapToGrid(p.y, gridPx),
      };
    },
    [enabled, gridPx],
  );

  /**
   * Show alignment guides between two points (while dragging / drawing).
   * Clears guides when `null` is passed.
   */
  const showGuides = useCallback(
    (
      from: { x: number; y: number } | null,
      to: { x: number; y: number } | null,
    ) => {
      if (!from || !to) {
        guidesRef.current = [];
        onGuides?.([]);
        onDimensionLabel?.(null, 0, 0);
        return;
      }

      const guides: SnapGuide[] = [];
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);

      // Horizontal guide when Y is aligned
      if (dy < gridPx / 2) guides.push({ type: "h", coord: from.y });
      // Vertical guide when X is aligned
      if (dx < gridPx / 2) guides.push({ type: "v", coord: from.x });

      guidesRef.current = guides;
      onGuides?.(guides);

      // Live dimension label
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const label = formatMetres(dist, pxPerMetre);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        onDimensionLabel?.(label, midX, midY);
      }
    },
    [gridPx, pxPerMetre, onGuides, onDimensionLabel],
  );

  const clearGuides = useCallback(() => {
    guidesRef.current = [];
    onGuides?.([]);
    onDimensionLabel?.(null, 0, 0);
  }, [onGuides, onDimensionLabel]);

  return { snapPoint, showGuides, clearGuides };
}
