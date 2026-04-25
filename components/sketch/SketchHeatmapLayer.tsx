"use client";

/**
 * SketchHeatmapLayer — RA-1606
 *
 * Renders a semi-transparent interpolated heat-map over the floor polygon,
 * colouring each pixel by Inverse Distance Weighting (IDW) of moisture pin
 * values and the IICRC threshold colours for the dominant material.
 *
 * Stack order (bottom → top):
 *   SketchCanvas → SketchHeatmapLayer (this) → SketchMoistureLayer (pins)
 */

import { useRef, useEffect, useMemo } from "react";
import type { MoisturePin } from "./SketchMoistureLayer";
import { getDryStandard } from "@/lib/iicrc-dry-standards";

export interface Point {
  x: number;
  y: number;
}

export interface SketchHeatmapLayerProps {
  pins: MoisturePin[];
  /** Polygon bounding the room interior (canvas pixel coordinates). */
  polygon: Point[];
  /** Material used for dry/wet threshold lookup. Falls back to "other". */
  material?: string;
  visible: boolean;
  width: number;
  height: number;
}

/** Resolution of the IDW grid (cells per side). 64 is fast and smooth enough. */
const GRID = 64;

/** Heat-map opacity baked into per-pixel alpha. */
const OPACITY = 0.45;

// ── Colour helpers ──────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const GREEN = hexToRgb("#22c55e");
const AMBER = hexToRgb("#f59e0b");
const RED   = hexToRgb("#ef4444");

/**
 * Three-stop gradient: green (≤ dry) → amber (mid) → red (≥ wet).
 * Returns [r, g, b] with values 0–255.
 */
function moistureColor(
  value: number,
  dryThreshold: number,
  wetThreshold: number,
): [number, number, number] {
  if (value <= dryThreshold) return GREEN;
  if (value >= wetThreshold) return RED;
  const mid = (dryThreshold + wetThreshold) / 2;
  if (value <= mid) {
    const t = (value - dryThreshold) / (mid - dryThreshold);
    return [
      Math.round(GREEN[0] + (AMBER[0] - GREEN[0]) * t),
      Math.round(GREEN[1] + (AMBER[1] - GREEN[1]) * t),
      Math.round(GREEN[2] + (AMBER[2] - GREEN[2]) * t),
    ];
  }
  const t = (value - mid) / (wetThreshold - mid);
  return [
    Math.round(AMBER[0] + (RED[0] - AMBER[0]) * t),
    Math.round(AMBER[1] + (RED[1] - AMBER[1]) * t),
    Math.round(AMBER[2] + (RED[2] - AMBER[2]) * t),
  ];
}

// ── Polygon hit-test ────────────────────────────────────────

/** Ray-cast point-in-polygon test. */
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── IDW interpolation ───────────────────────────────────────

/**
 * Compute IDW value at (qx, qy) from pins. Power = 2.
 * Returns the pin's own value when the query point coincides with it.
 */
function idw(qx: number, qy: number, pins: MoisturePin[]): number {
  let num = 0;
  let den = 0;
  for (const pin of pins) {
    const d2 = (qx - pin.x) ** 2 + (qy - pin.y) ** 2;
    if (d2 < 1e-6) return pin.wme;
    const w = 1 / d2;
    num += w * pin.wme;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

// ── Bilinear upscale ────────────────────────────────────────

/** Sample the GRID×GRID float array with bilinear interpolation at (u,v) ∈ [0,1]. */
function sampleBilinear(
  grid: Float32Array,
  cols: number,
  rows: number,
  u: number,
  v: number,
): number {
  const gx = u * (cols - 1);
  const gy = v * (rows - 1);
  const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, cols - 1);
  const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, rows - 1);
  const fx = gx - x0, fy = gy - y0;
  const v00 = grid[y0 * cols + x0];
  const v10 = grid[y0 * cols + x1];
  const v01 = grid[y1 * cols + x0];
  const v11 = grid[y1 * cols + x1];
  return (
    v00 * (1 - fx) * (1 - fy) +
    v10 *      fx  * (1 - fy) +
    v01 * (1 - fx) *      fy  +
    v11 *      fx  *      fy
  );
}

// ── Component ───────────────────────────────────────────────

export function SketchHeatmapLayer({
  pins,
  polygon,
  material = "other",
  visible,
  width,
  height,
}: SketchHeatmapLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute the GRID×GRID IDW values — only recalculate when pins change.
  const gridValues = useMemo<Float32Array | null>(() => {
    if (pins.length === 0 || polygon.length < 3) return null;

    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs);
    const by0 = Math.min(...ys), by1 = Math.max(...ys);

    const values = new Float32Array(GRID * GRID);
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const cx = bx0 + (col / (GRID - 1)) * (bx1 - bx0);
        const cy = by0 + (row / (GRID - 1)) * (by1 - by0);
        values[row * GRID + col] = idw(cx, cy, pins);
      }
    }
    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, polygon]);

  // Render to the canvas whenever grid or visibility changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!visible || !gridValues || polygon.length < 3 || pins.length === 0)
      return;

    const std = getDryStandard(material);
    const { dryThreshold, wetThreshold } = std;

    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs);
    const by0 = Math.min(...ys), by1 = Math.max(...ys);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let py = Math.floor(by0); py <= Math.ceil(by1); py++) {
      if (py < 0 || py >= height) continue;
      for (let px = Math.floor(bx0); px <= Math.ceil(bx1); px++) {
        if (px < 0 || px >= width) continue;
        if (!pointInPolygon(px, py, polygon)) continue;

        const u = bx1 > bx0 ? (px - bx0) / (bx1 - bx0) : 0.5;
        const v = by1 > by0 ? (py - by0) / (by1 - by0) : 0.5;

        const value = sampleBilinear(gridValues, GRID, GRID, u, v);
        const [r, g, b] = moistureColor(value, dryThreshold, wetThreshold);

        const idx = (py * width + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(OPACITY * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [visible, gridValues, polygon, material, pins, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
