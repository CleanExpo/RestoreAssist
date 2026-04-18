"use client";

import { useRef, useCallback } from "react";
import type { ToolMode } from "@/components/sketch/SketchCanvas";

// ─── Typed Fabric canvas subset ──────────────────────────────

type FabricCanvas = {
  on: (evt: string, cb: (e: unknown) => void) => void;
  off: (evt: string, cb?: (e: unknown) => void) => void;
  getPointer: (e: MouseEvent) => { x: number; y: number };
  add: (...objs: unknown[]) => void;
  remove: (...objs: unknown[]) => void;
  getObjects: () => unknown[];
  renderAll: () => void;
  isDrawingMode: boolean;
  freeDrawingBrush: { color: string; width: number };
  selection: boolean;
  defaultCursor: string;
  requestRenderAll?: () => void;
};

type FabricStatic = {
  Line: new (pts: number[], opts: object) => unknown;
  Polygon: new (pts: { x: number; y: number }[], opts: object) => unknown;
  Polyline: new (pts: { x: number; y: number }[], opts: object) => unknown;
  Circle: new (opts: object) => unknown;
  IText: new (text: string, opts: object) => unknown;
  Group: new (objs: unknown[], opts: object) => unknown;
};

export interface UseSketchToolsOptions {
  onSaveState: () => void;
  onModified?: () => void;
  snapPoint?: (p: { x: number; y: number }) => { x: number; y: number };
  showGuides?: (
    from: { x: number; y: number } | null,
    to: { x: number; y: number } | null,
  ) => void;
  clearGuides?: () => void;
  roomColor?: { fill: string; stroke: string; label?: string };
  damageColor?: { color: string; stroke: string; id: string };
  textColor?: string;
  arrowColor?: string;
}

/**
 * useSketchTools — manages interactive drawing state machines for each ToolMode.
 *
 * Call `attach(canvas, fabric)` when the Fabric.js instance is ready.
 * Call `detach()` to remove all listeners.
 * Call `setMode(mode)` when the user switches tools.
 */
export function useSketchTools(opts: UseSketchToolsOptions) {
  const {
    onSaveState,
    onModified,
    snapPoint = (p) => p,
    showGuides,
    clearGuides,
    roomColor = { fill: "rgba(59,130,246,0.10)", stroke: "#3b82f6" },
    damageColor = {
      color: "rgba(59,130,246,0.35)",
      stroke: "#3b82f6",
      id: "water",
    },
    textColor = "#1e293b",
    arrowColor = "#ef4444",
  } = opts;

  // ── Drawing state buffers ────────────────────────────────
  const roomPtsRef = useRef<{ x: number; y: number }[]>([]);
  const linePtRef = useRef<{ x: number; y: number } | null>(null);
  const arrowPtRef = useRef<{ x: number; y: number } | null>(null);
  const tempObjsRef = useRef<unknown[]>([]);

  const canvasRef = useRef<FabricCanvas | null>(null);
  const fabricRef = useRef<FabricStatic | null>(null);
  const modeRef = useRef<ToolMode>("select");

  // ── Helper: remove temp preview objects ─────────────────
  const clearTemp = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    for (const obj of tempObjsRef.current) c.remove(obj);
    tempObjsRef.current = [];
  }, []);

  // ── Mouse handlers ───────────────────────────────────────

  const onMouseDown = useCallback(
    (opt: unknown) => {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const e = (opt as { e: MouseEvent }).e;
      if (e.altKey) return; // alt = pan mode override
      const raw = canvas.getPointer(e);
      const pt = snapPoint(raw);

      switch (modeRef.current) {
        case "room": {
          roomPtsRef.current.push(pt);
          // Close polygon on click near first point (≤12px)
          const first = roomPtsRef.current[0];
          if (
            roomPtsRef.current.length >= 3 &&
            Math.hypot(pt.x - first.x, pt.y - first.y) < 12
          ) {
            clearTemp();
            const pts = roomPtsRef.current.slice(0, -1); // exclude duplicate click
            const poly = new fabric.Polygon(pts, {
              fill: roomColor.fill,
              stroke: roomColor.stroke,
              strokeWidth: 2,
              selectable: true,
              evented: true,
              data: { type: "room", roomType: "room", label: "Room" },
            });
            canvas.add(poly);
            (canvas.requestRenderAll ?? canvas.renderAll).call(canvas);
            roomPtsRef.current = [];
            clearGuides?.();
            onSaveState();
            onModified?.();
          } else {
            // Draw preview dot
            const dot = new fabric.Circle({
              left: pt.x - 4,
              top: pt.y - 4,
              radius: 4,
              fill: roomColor.stroke,
              selectable: false,
              evented: false,
            });
            canvas.add(dot);
            tempObjsRef.current.push(dot);
          }
          break;
        }
        case "line": {
          if (!linePtRef.current) {
            linePtRef.current = pt;
          } else {
            clearTemp();
            const line = new fabric.Line(
              [linePtRef.current.x, linePtRef.current.y, pt.x, pt.y],
              {
                stroke: "#64748b",
                strokeWidth: 2,
                selectable: true,
                evented: true,
                data: { type: "wall" },
              },
            );
            canvas.add(line);
            (canvas.requestRenderAll ?? canvas.renderAll).call(canvas);
            linePtRef.current = null;
            clearGuides?.();
            onSaveState();
            onModified?.();
          }
          break;
        }
        case "arrow": {
          if (!arrowPtRef.current) {
            arrowPtRef.current = pt;
          } else {
            clearTemp();
            const from = arrowPtRef.current;
            const dx = pt.x - from.x;
            const dy = pt.y - from.y;
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const line = new fabric.Line([from.x, from.y, pt.x, pt.y], {
              stroke: arrowColor,
              strokeWidth: 2,
              selectable: false,
              evented: false,
            });
            const head = new fabric.Polygon(
              [
                { x: 0, y: -5 },
                { x: 10, y: 0 },
                { x: 0, y: 5 },
              ],
              {
                left: pt.x,
                top: pt.y,
                fill: arrowColor,
                originX: "center",
                originY: "center",
                angle,
                selectable: false,
                evented: false,
              },
            );
            const group = new fabric.Group([line, head], {
              selectable: true,
              evented: true,
              data: { type: "arrow" },
            });
            canvas.add(group);
            (canvas.requestRenderAll ?? canvas.renderAll).call(canvas);
            arrowPtRef.current = null;
            clearGuides?.();
            onSaveState();
            onModified?.();
          }
          break;
        }
        case "text": {
          const itext = new fabric.IText("Label", {
            left: pt.x,
            top: pt.y,
            fontSize: 14,
            fill: textColor,
            fontFamily: "Inter, sans-serif",
            selectable: true,
            evented: true,
            data: { type: "text_label" },
          });
          canvas.add(itext);
          (canvas.requestRenderAll ?? canvas.renderAll).call(canvas);
          onSaveState();
          onModified?.();
          break;
        }
      }
    },
    [
      snapPoint,
      roomColor,
      clearTemp,
      clearGuides,
      onSaveState,
      onModified,
      arrowColor,
      textColor,
    ],
  );

  const onMouseMove = useCallback(
    (opt: unknown) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const e = (opt as { e: MouseEvent }).e;
      const raw = canvas.getPointer(e);
      const pt = snapPoint(raw);

      if (modeRef.current === "room" && roomPtsRef.current.length > 0) {
        showGuides?.(roomPtsRef.current[roomPtsRef.current.length - 1], pt);
      } else if (modeRef.current === "line" && linePtRef.current) {
        showGuides?.(linePtRef.current, pt);
      } else if (modeRef.current === "arrow" && arrowPtRef.current) {
        showGuides?.(arrowPtRef.current, pt);
      }
    },
    [snapPoint, showGuides],
  );

  // ── Attach / detach ──────────────────────────────────────

  const attach = useCallback(
    (canvas: FabricCanvas, fabric: FabricStatic) => {
      canvasRef.current = canvas;
      fabricRef.current = fabric;
      canvas.on("mouse:down", onMouseDown);
      canvas.on("mouse:move", onMouseMove);
    },
    [onMouseDown, onMouseMove],
  );

  const detach = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.off("mouse:down", onMouseDown);
    canvas.off("mouse:move", onMouseMove);
    clearTemp();
    roomPtsRef.current = [];
    linePtRef.current = null;
    arrowPtRef.current = null;
  }, [onMouseDown, onMouseMove, clearTemp]);

  const setMode = useCallback(
    (mode: ToolMode) => {
      modeRef.current = mode;
      clearTemp();
      roomPtsRef.current = [];
      linePtRef.current = null;
      arrowPtRef.current = null;
      clearGuides?.();
    },
    [clearTemp, clearGuides],
  );

  return { attach, detach, setMode };
}
