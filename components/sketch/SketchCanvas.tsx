"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

export type ToolMode =
  | "select" // Selection / move tool
  | "room" // Room polygon drawing
  | "line" // Single wall/line segments
  | "freehand" // Freehand damage zone drawing
  | "text" // Text label
  | "arrow" // Arrow annotation
  | "measure" // Measurement tool
  | "photo" // Photo marker placement
  | "pan" // Pan/navigate
  // RA-6841 [A2]: architectural opening symbols
  | "door" // Door — opening cut + leaf line + swing arc
  | "window"; // Window — opening cut + glazing lines

import { fabricObjectToSelected } from "@/lib/sketch/selected-object";
import { computeUnderlayTransform } from "@/lib/sketch/underlay-transform";
import {
  describeToolObject,
  DEFAULT_PX_PER_METRE,
  type Point,
} from "@/lib/sketch/tool-objects";
import {
  snapPointToGrid,
  snapSegmentEnd,
  formatDimension,
  segmentLabelPosition,
  footprintDimensions,
} from "@/lib/sketch/geometry-utils";
import {
  snapToNearestWall,
  pointAtParametric,
} from "@/lib/sketch/opening-geometry";
import {
  exportSketchPng,
  type ExportableCanvas,
} from "@/lib/sketch/export-sketch-png";
import type { SelectedObject } from "./SketchSelectionPanel";

export interface SketchCanvasProps {
  width?: number;
  height?: number;
  toolMode?: ToolMode;
  /** Canvas pixels per real-world metre — drives measure-tool dimensions. */
  pxPerMetre?: number;
  /** RA-6844 [A5]: grid + right-angle snap for the draw tools (default on). */
  snapEnabled?: boolean;
  /** RA-6844 [A5]: snap grid size in real-world metres (default 0.25 m). */
  snapGridMetres?: number;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number;
  /** PR4b underlay transform. Null/undefined = legacy fit-to-width baseline. */
  backgroundImageScale?: number | null;
  backgroundImageOffsetX?: number | null;
  backgroundImageOffsetY?: number | null;
  backgroundImageLockAspect?: boolean;
  onReady?: (canvas: FabricCanvasRef) => void;
  onModified?: () => void;
  onSelect?: (obj: SelectedObject | null) => void;
  readonly?: boolean;
  className?: string;
}

export interface FabricCanvasRef {
  /** Serialise entire canvas state to JSON (includes custom `data` property) */
  toJSON: () => object;
  /** Load canvas state from JSON (replaces current state) */
  loadFromJSON: (data: object) => Promise<void>;
  /** Export canvas as PNG data URL */
  toDataURL: (options?: {
    format?: string;
    quality?: number;
    multiplier?: number;
  }) => string;
  /** Clear all objects (not background) */
  clear: () => void;
  /** Get underlying Fabric.Canvas instance */
  getFabricCanvas: () => unknown;
  /** Push current state to undo stack */
  saveState: () => void;
  /** Undo last action */
  undo: () => void;
  /** Redo last undone action */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
}

const MAX_HISTORY = 50;

/**
 * SketchCanvas — Fabric.js base component for the RestoreAssist V2 sketch tool.
 * Provides touch + mouse input, pinch-to-zoom, pan, tool mode management,
 * undo/redo history stack, and background image support.
 *
 * Uses dynamic import to avoid SSR issues (canvas is client-only).
 */
const SketchCanvas = forwardRef<FabricCanvasRef, SketchCanvasProps>(
  function SketchCanvas(
    {
      width = 1200,
      height = 800,
      toolMode = "select",
      pxPerMetre = DEFAULT_PX_PER_METRE,
      snapEnabled = true,
      snapGridMetres = 0.25,
      onSelect,
      backgroundImageUrl,
      backgroundImageOpacity = 0.4,
      backgroundImageScale,
      backgroundImageOffsetX,
      backgroundImageOffsetY,
      backgroundImageLockAspect = true,
      onReady,
      onModified,
      readonly = false,
      className,
    },
    ref,
  ) {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<unknown>(null); // fabric.Canvas instance
    const historyRef = useRef<string[]>([]);
    const historyIdxRef = useRef(-1);
    const isLoadingRef = useRef(false);
    // ── Drawing state for the click/drag tools (read inside Fabric handlers) ──
    const toolModeRef = useRef<ToolMode>(toolMode);
    const pxPerMetreRef = useRef<number>(pxPerMetre);
    const snapEnabledRef = useRef<boolean>(snapEnabled);
    const snapGridMetresRef = useRef<number>(snapGridMetres);
    const drawStartRef = useRef<Point | null>(null);
    const polygonPtsRef = useRef<Point[]>([]);
    const [historyState, setHistoryState] = useState({
      canUndo: false,
      canRedo: false,
    });

    // ── Undo/Redo helpers ─────────────────────────────────────
    const saveState = useCallback(() => {
      const canvas = fabricRef.current as {
        toJSON: (extras?: string[]) => object;
      } | null;
      if (!canvas) return;
      const json = JSON.stringify(canvas.toJSON(["data"]));
      const stack = historyRef.current;
      const idx = historyIdxRef.current;

      // Truncate forward history on new action
      historyRef.current = stack.slice(0, idx + 1);
      historyRef.current.push(json);
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift();
      }
      historyIdxRef.current = historyRef.current.length - 1;
      setHistoryState({
        canUndo: historyIdxRef.current > 0,
        canRedo: false,
      });
    }, []);

    const undo = useCallback(async () => {
      const canvas = fabricRef.current as {
        loadFromJSON: (d: object, cb: () => void) => void;
        renderAll: () => void;
      } | null;
      if (!canvas || historyIdxRef.current <= 0) return;
      historyIdxRef.current -= 1;
      isLoadingRef.current = true;
      const json = JSON.parse(historyRef.current[historyIdxRef.current]);
      await new Promise<void>((resolve) => canvas.loadFromJSON(json, resolve));
      canvas.renderAll();
      isLoadingRef.current = false;
      setHistoryState({
        canUndo: historyIdxRef.current > 0,
        canRedo: historyIdxRef.current < historyRef.current.length - 1,
      });
    }, []);

    const redo = useCallback(async () => {
      const canvas = fabricRef.current as {
        loadFromJSON: (d: object, cb: () => void) => void;
        renderAll: () => void;
      } | null;
      if (!canvas || historyIdxRef.current >= historyRef.current.length - 1)
        return;
      historyIdxRef.current += 1;
      isLoadingRef.current = true;
      const json = JSON.parse(historyRef.current[historyIdxRef.current]);
      await new Promise<void>((resolve) => canvas.loadFromJSON(json, resolve));
      canvas.renderAll();
      isLoadingRef.current = false;
      setHistoryState({
        canUndo: historyIdxRef.current > 0,
        canRedo: historyIdxRef.current < historyRef.current.length - 1,
      });
    }, []);

    // ── Expose imperative handle ─────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        toJSON: () => {
          const c = fabricRef.current as {
            toJSON: (extras?: string[]) => object;
          } | null;
          return c?.toJSON(["data"]) ?? {};
        },
        loadFromJSON: async (data: object) => {
          const c = fabricRef.current as {
            loadFromJSON: (d: object, cb: () => void) => void;
            renderAll: () => void;
          } | null;
          if (!c) return;
          await new Promise<void>((resolve) => c.loadFromJSON(data, resolve));
          c.renderAll();
        },
        toDataURL: (opts) => {
          const c = fabricRef.current as ExportableCanvas | null;
          // RA-6847 [C1]: strip the underlay so the export never leaks it.
          return c ? exportSketchPng(c, opts) : "";
        },
        clear: () => {
          const c = fabricRef.current as {
            clear: () => void;
            renderAll: () => void;
          } | null;
          c?.clear();
          c?.renderAll();
        },
        getFabricCanvas: () => fabricRef.current,
        saveState,
        undo,
        redo,
        canUndo: historyState.canUndo,
        canRedo: historyState.canRedo,
      }),
      [saveState, undo, redo, historyState],
    );

    // ── Initialise Fabric.js canvas ─────────────────────────
    useEffect(() => {
      if (!canvasElRef.current) return;

      let destroyed = false;
      let fabricCanvas: unknown = null;

      (async () => {
        // Dynamic import — avoids SSR issues
        const fabric = await import("fabric");
        if (destroyed) return;

        const Canvas = (
          fabric as {
            Canvas: new (el: HTMLCanvasElement, opts: object) => unknown;
          }
        ).Canvas;

        fabricCanvas = new Canvas(canvasElRef.current!, {
          width,
          height,
          selection: !readonly,
          isDrawingMode: false,
          stopContextMenu: true,
          fireRightClick: false,
        });

        // ── PencilBrush must be explicitly instantiated in Fabric v6 ──
        // Without this, freehand drawing silently fails (no brush object).
        const PencilBrush = (
          fabric as {
            PencilBrush: new (c: unknown) => { color: string; width: number };
          }
        ).PencilBrush;
        (
          fabricCanvas as unknown as {
            freeDrawingBrush: { color: string; width: number };
          }
        ).freeDrawingBrush = new PencilBrush(fabricCanvas);

        fabricRef.current = fabricCanvas;
        const canvas = fabricCanvas as {
          on: (event: string, cb: (e?: unknown) => void) => void;
          off: (event: string) => void;
          setZoom: (z: number) => void;
          getZoom: () => number;
          relativePan: (point: { x: number; y: number }) => void;
          getPointer: (e: MouseEvent) => { x: number; y: number };
          setActiveObject: (obj: unknown) => void;
          renderAll: () => void;
          isDrawingMode: boolean;
          freeDrawingBrush: { color: string; width: number };
          loadFromJSON: (d: object, cb: () => void) => void;
          toJSON: () => object;
          toDataURL: (opts?: object) => string;
          dispose: () => void;
        };

        // ── Zoom with mouse wheel ──
        canvas.on("mouse:wheel", (opt: unknown) => {
          const e = (opt as { e: WheelEvent }).e;
          const delta = e.deltaY;
          let zoom = canvas.getZoom();
          zoom *= 0.999 ** delta;
          zoom = Math.max(0.3, Math.min(4, zoom));
          canvas.setZoom(zoom);
          e.preventDefault();
          e.stopPropagation();
        });

        // ── Alt/Space + drag to pan ──
        let isPanning = false;
        let lastPos = { x: 0, y: 0 };

        canvas.on("mouse:down", (opt: unknown) => {
          const e = (opt as { e: MouseEvent }).e;
          if (e.altKey || toolMode === "pan") {
            isPanning = true;
            lastPos = { x: e.clientX, y: e.clientY };
          }
        });
        canvas.on("mouse:move", (opt: unknown) => {
          if (!isPanning) return;
          const e = (opt as { e: MouseEvent }).e;
          canvas.relativePan({
            x: e.clientX - lastPos.x,
            y: e.clientY - lastPos.y,
          });
          lastPos = { x: e.clientX, y: e.clientY };
        });
        canvas.on("mouse:up", () => {
          isPanning = false;
        });

        // ── Object modified → save state ──
        // RA-6843 [A4]: keep a room's caption glued to its polygon. On move the
        // linked "room-label" Text re-centers; the area text is left as the
        // authoritative shoelace value (Fabric scale is ignored by
        // decompose-elements, so the caption never disagrees with the PDF).
        const syncRoomLabel = (target: unknown) => {
          const t = target as {
            data?: { type?: string; id?: string };
            getCenterPoint?: () => { x: number; y: number };
          } | null;
          if (!t?.data || t.data.type !== "room" || !t.data.id) return;
          if (!t.getCenterPoint) return;
          const c = t.getCenterPoint();
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const label = objs.find(
            (o) =>
              (o as { data?: { type?: string; roomFor?: string } }).data
                ?.type === "room-label" &&
              (o as { data?: { roomFor?: string } }).data?.roomFor ===
                t.data!.id,
          ) as
            | { set: (o: object) => void; setCoords: () => void }
            | undefined;
          label?.set({ left: c.x, top: c.y });
          label?.setCoords();
        };
        // Returns true if the Fabric object is a display-only decoration
        // (dim-label or room-label) that must NOT enter the undo stack.
        const isDecoration = (obj: unknown): boolean => {
          const t = (obj as { data?: { type?: string } } | undefined)?.data?.type;
          return t === "dim-label" || t === "room-label";
        };

        canvas.on("object:modified", (opt: unknown) => {
          const target = (opt as { target?: unknown } | undefined)?.target;
          syncRoomLabel(target);
          // RA-6980 [A2b]: a moved wall drags its bound openings with it.
          reanchorOpeningsForWall(target);
          if (!isLoadingRef.current && !isDecoration(target)) {
            saveState();
            onModified?.();
          }
        });
        canvas.on("object:added", (opt: unknown) => {
          const target = (opt as { target?: unknown } | undefined)?.target;
          // RA-6980 [A2b]: stamp a stable id on new walls (and lazily on walls
          // loaded from pre-feature sketches) so openings can bind to them.
          ensureWallId(target);
          if (!isLoadingRef.current && !isDecoration(target)) {
            saveState();
            onModified?.();
          }
        });
        canvas.on("object:removed", (opt: unknown) => {
          const target = (opt as { target?: unknown } | undefined)?.target;
          if (!isLoadingRef.current && !isDecoration(target)) {
            saveState();
            onModified?.();
          }
        });

        // ── Selection → SketchSelectionPanel ──
        const emitSelection = () => {
          const active = (
            canvas as unknown as { getActiveObject: () => unknown }
          ).getActiveObject();
          onSelect?.(
            fabricObjectToSelected(
              active as Parameters<typeof fabricObjectToSelected>[0],
            ),
          );
        };
        canvas.on("selection:created", emitSelection);
        canvas.on("selection:updated", emitSelection);
        canvas.on("selection:cleared", () => onSelect?.(null));

        // ── Tool object creation (room/line/text/arrow/measure/photo) ──
        // RA-6759: each declared ToolMode now produces a real Fabric object
        // carrying custom `data` (type + provenance) for selection +
        // decomposition. Geometry/units/data logic lives in the pure
        // describeToolObject() factory; this only materialises the descriptor.
        const F = fabric as unknown as Record<
          string,
          new (...args: unknown[]) => unknown
        >;
        const scenePoint = (e: MouseEvent): Point => {
          const c = canvas as unknown as {
            getScenePoint?: (e: MouseEvent) => { x: number; y: number };
            getPointer: (e: MouseEvent) => { x: number; y: number };
          };
          const p = c.getScenePoint ? c.getScenePoint(e) : c.getPointer(e);
          return { x: p.x, y: p.y };
        };

        // RA-6844 [A5]: grid size in canvas px for the current scale.
        const gridPx = () =>
          snapEnabledRef.current
            ? snapGridMetresRef.current * pxPerMetreRef.current
            : 0;
        // Snap a standalone drawn vertex (room corner) to the grid.
        const snapVertex = (p: Point): Point => snapPointToGrid(p, gridPx());
        // Snap a drag endpoint: right-angle assist around `start`, then grid.
        const snapEnd = (start: Point, end: Point): Point =>
          snapEnabledRef.current ? snapSegmentEnd(start, end, gridPx(), 45) : end;

        // RA-6841 [A2]: Collect all wall-type line segments from the canvas so
        // door/window tools can snap the placement anchor to the nearest wall.
        // RA-6980 [A2b]: collect wall objects with their absolute segments so a
        // placed opening can bind to the specific wall (by id) it snapped to.
        const collectWalls = (): { obj: unknown; seg: { a: Point; b: Point } }[] => {
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const walls: { obj: unknown; seg: { a: Point; b: Point } }[] = [];
          for (const o of objs) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (d?.type !== "wall") continue;
            const seg = wallAbsoluteSegment(o);
            if (seg) walls.push({ obj: o, seg });
          }
          return walls;
        };

        const materialize = (
          d: NonNullable<ReturnType<typeof describeToolObject>>,
        ): unknown => {
          let obj: unknown = null;
          if (d.kind === "polygon") {
            const { points, ...rest } = d.props as { points: Point[] };
            obj = new F.Polygon(points, rest);
          } else if (d.kind === "line") {
            const { x1, y1, x2, y2, ...rest } = d.props as Record<
              string,
              number
            >;
            obj = new F.Line([x1, y1, x2, y2], rest);
          } else if (d.kind === "measure") {
            const { x1, y1, x2, y2, ...rest } = d.props as Record<
              string,
              number
            >;
            const line = new F.Line([x1, y1, x2, y2], rest);
            const label = new F.Text(d.label!.text, {
              left: d.label!.left,
              top: d.label!.top,
              fontSize: 14,
              fill: "#8A6B4E",
              originX: "center",
              originY: "center",
              selectable: false,
            });
            obj = new F.Group([line, label]);
          } else if (d.kind === "arrow") {
            const { x1, y1, x2, y2, ...rest } = d.props as Record<
              string,
              number
            >;
            const line = new F.Line([x1, y1, x2, y2], rest);
            const head = new F.Triangle({
              left: x2,
              top: y2,
              width: 14,
              height: 14,
              fill: (rest as { stroke?: string }).stroke ?? "#1C2E47",
              angle: (d.data.angle as number) + 90,
              originX: "center",
              originY: "center",
            });
            obj = new F.Group([line, head]);
          } else if (d.kind === "itext") {
            const { text, ...rest } = d.props as { text: string };
            obj = new F.IText(text, rest);
          } else if (d.kind === "photo-marker") {
            obj = new F.Circle({
              ...d.props,
              originX: "center",
              originY: "center",
            });
          } else if (d.kind === "door-opening") {
            // RA-6841 [A2]: Door symbol — opening cut line (white gap), leaf
            // line, and a quarter-circle swing arc rendered as a Fabric Path.
            const p = d.props as {
              cutStart: { x: number; y: number };
              cutEnd: { x: number; y: number };
              hingePoint: { x: number; y: number };
              freeCorner: { x: number; y: number };
              arcPath: string;
              arcRadiusPx: number;
              stroke: string;
              strokeWidth: number;
              wallThicknessPx: number;
            };
            const cutLine = new F.Line(
              [p.cutStart.x, p.cutStart.y, p.cutEnd.x, p.cutEnd.y],
              {
                stroke: "#ffffff",
                strokeWidth: p.wallThicknessPx,
                strokeLineCap: "butt",
                selectable: false,
                evented: false,
              },
            );
            const leafLine = new F.Line(
              [p.hingePoint.x, p.hingePoint.y, p.freeCorner.x, p.freeCorner.y],
              { stroke: p.stroke, strokeWidth: p.strokeWidth },
            );
            const arc = new F.Path(p.arcPath, {
              stroke: p.stroke,
              strokeWidth: p.strokeWidth,
              fill: "transparent",
            });
            obj = new F.Group([cutLine, leafLine, arc]);
          } else if (d.kind === "window-opening") {
            // RA-6841 [A2]: Window symbol — opening cut line (white gap) and
            // three glazing lines perpendicular to the wall band.
            const p = d.props as {
              cutStart: { x: number; y: number };
              cutEnd: { x: number; y: number };
              glazingLines: [[{ x: number; y: number }, { x: number; y: number }]];
              stroke: string;
              strokeWidth: number;
              wallThicknessPx: number;
            };
            const members: unknown[] = [];
            const cutLine = new F.Line(
              [p.cutStart.x, p.cutStart.y, p.cutEnd.x, p.cutEnd.y],
              {
                stroke: "#ffffff",
                strokeWidth: p.wallThicknessPx,
                strokeLineCap: "butt",
                selectable: false,
                evented: false,
              },
            );
            members.push(cutLine);
            for (const [s, e] of p.glazingLines) {
              members.push(
                new F.Line([s.x, s.y, e.x, e.y], {
                  stroke: p.stroke,
                  strokeWidth: p.strokeWidth,
                }),
              );
            }
            obj = new F.Group(members);
          }
          if (obj) (obj as { data?: unknown }).data = d.data;
          return obj;
        };

        // ── RA-6980 [A2b]: parent–child binding (openings ↔ host wall) ────────
        // Every wall carries a stable `data.wallId`. Openings placed on it store
        // that id + their parametric position; when the wall moves we re-anchor.
        const newWallId = (): string =>
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `wall-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        // Assign a wallId to any wall lacking one. Fires from object:added, so it
        // covers freshly drawn walls AND lazily migrates walls loaded from a
        // sketch saved before this feature existed.
        const ensureWallId = (target: unknown): void => {
          const t = target as { data?: Record<string, unknown> } | undefined;
          if (t?.data?.type === "wall" && !t.data.wallId) {
            t.data.wallId = newWallId();
          }
        };

        // Absolute endpoints of a (possibly moved/scaled/rotated) wall line.
        // Fabric keeps x1..y2 in the object's local frame; transform them by the
        // object's matrix to recover scene coordinates after a drag/resize.
        const wallAbsoluteSegment = (
          wallObj: unknown,
        ): { a: Point; b: Point } | null => {
          type Mat = [number, number, number, number, number, number];
          const lo = wallObj as {
            calcLinePoints?: () => { x1: number; y1: number; x2: number; y2: number };
            calcTransformMatrix?: () => Mat;
            x1?: number;
            y1?: number;
            x2?: number;
            y2?: number;
          };
          if (lo.calcLinePoints && lo.calcTransformMatrix) {
            const p = lo.calcLinePoints();
            const m = lo.calcTransformMatrix();
            const tp = (
              fabric as unknown as {
                util: { transformPoint: (pt: Point, mat: Mat) => Point };
              }
            ).util.transformPoint;
            return {
              a: tp({ x: p.x1, y: p.y1 }, m),
              b: tp({ x: p.x2, y: p.y2 }, m),
            };
          }
          if (lo.x1 !== undefined) {
            return {
              a: { x: lo.x1, y: lo.y1 ?? 0 },
              b: { x: lo.x2 ?? 0, y: lo.y2 ?? 0 },
            };
          }
          return null;
        };

        // Re-anchor every opening bound to `wallObj` onto the wall's new segment.
        // Rebuilds each opening symbol from its stored width/hinge/parametric-t so
        // doors/windows ride with their wall. Openings without a hostWallId (e.g.
        // placed before this feature) are left untouched — graceful degradation.
        const reanchorOpeningsForWall = (wallObj: unknown): void => {
          const wd = (wallObj as { data?: Record<string, unknown> } | undefined)
            ?.data;
          if (!wd || wd.type !== "wall" || !wd.wallId) return;
          const newWall = wallAbsoluteSegment(wallObj);
          if (!newWall) return;
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (o: unknown) => void;
            add: (o: unknown) => void;
            renderAll: () => void;
          };
          for (const o of c.getObjects()) {
            const od = (o as { data?: Record<string, unknown> }).data;
            if (
              !od ||
              od.type !== "opening" ||
              od.hostWallId !== wd.wallId ||
              typeof od.hostWallT !== "number"
            )
              continue;
            const anchor = pointAtParametric(od.hostWallT as number, newWall);
            const d = describeToolObject({
              tool: od.openingKind as ToolMode,
              points: [anchor],
              pxPerMetre: pxPerMetreRef.current,
              wallSegment: newWall,
              wallThicknessPx: pxPerMetreRef.current * 0.11,
              hingeSide: od.hingeSide as "left" | "right" | undefined,
              openingWidthM: od.widthM as number | undefined,
              hostWallId: wd.wallId as string,
            });
            if (!d) continue;
            const fresh = materialize(d);
            if (!fresh) continue;
            c.remove(o);
            c.add(fresh);
          }
          c.renderAll();
        };

        // ── RA-6842 [A3] — Dimension string helpers ────────────────────────────
        // `liveDimLabel` is a transient Text that shows the current drag length;
        // it is replaced on every mouse:move and removed on mouse:up/dblclick.
        // It is NOT added to the undo stack (not part of the measured geometry).
        let liveDimLabel: unknown = null;

        const removeLiveDimLabel = () => {
          if (liveDimLabel) {
            (canvas as unknown as { remove: (...o: unknown[]) => void }).remove(
              liveDimLabel,
            );
            liveDimLabel = null;
          }
        };

        const makeDimText = (text: string, x: number, y: number): unknown => {
          const t = new F.Text(text, {
            left: x,
            top: y,
            fontSize: 11,
            fill: "#ffffff",
            backgroundColor: "#1C2E47",
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
            padding: 2,
          });
          (t as { data?: unknown }).data = { type: "dim-label" };
          return t;
        };

        /**
         * Add per-edge dimension strings for a completed room polygon.
         * Each edge gets one Text label placed perpendicular to the midpoint,
         * outside the room. Labels are non-selectable/non-measured decoration.
         */
        const addRoomEdgeDimLabels = (
          points: Point[],
          roomId: string,
        ) => {
          const c = canvas as unknown as { add: (...o: unknown[]) => void };
          const scale = pxPerMetreRef.current;
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            const px = Math.hypot(b.x - a.x, b.y - a.y);
            const text = formatDimension(px, scale);
            const { labelPos } = segmentLabelPosition(a, b, 18);
            const lbl = makeDimText(text, labelPos.x, labelPos.y);
            (lbl as { data?: unknown }).data = {
              type: "dim-label",
              dimFor: roomId,
            };
            c.add(lbl);
          }
        };

        /**
         * Remove all "dim-label" objects from the canvas (called before
         * re-drawing overall footprint so stale labels never accumulate).
         */
        const removeFootprintLabels = () => {
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (...o: unknown[]) => void;
          };
          const toRemove = c
            .getObjects()
            .filter(
              (o) =>
                (o as { data?: { type?: string } }).data?.type === "dim-label" &&
                !(o as { data?: { dimFor?: string } }).data?.dimFor,
            );
          if (toRemove.length) c.remove(...toRemove);
        };

        /**
         * Recompute + redraw the overall footprint dimension strings (width × height)
         * using all non-decoration canvas points. Draws two dimension lines with
         * tick marks and labels, outside the plan bounding box.
         */
        const refreshFootprintDimensions = () => {
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            add: (...o: unknown[]) => void;
            renderAll: () => void;
          };
          removeFootprintLabels();

          // Collect all measured geometry points (ignore text/label decorations)
          const allPoints: Point[] = [];
          for (const o of c.getObjects()) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (
              !d ||
              d.type === "dim-label" ||
              d.type === "room-label" ||
              d.type === "text" ||
              d.type === "arrow" ||
              d.type === "photo"
            )
              continue;
            // Polygon rooms: extract points
            const pts = (o as { points?: Point[] }).points;
            if (pts) {
              for (const p of pts) allPoints.push(p);
              continue;
            }
            // Lines: x1/y1/x2/y2
            const lo = o as { x1?: number; y1?: number; x2?: number; y2?: number };
            if (lo.x1 !== undefined) {
              allPoints.push({ x: lo.x1, y: lo.y1 ?? 0 });
              allPoints.push({ x: lo.x2 ?? 0, y: lo.y2 ?? 0 });
            }
          }
          if (allPoints.length < 2) return;

          const scale = pxPerMetreRef.current;
          const fp = footprintDimensions(allPoints, 32);
          if (fp.widthPx < 1 && fp.heightPx < 1) return;

          // Width dimension line (top)
          if (fp.widthPx > 0) {
            const lineW = new F.Line(
              [fp.topTick[0].x, fp.topTick[0].y, fp.topTick[1].x, fp.topTick[1].y],
              {
                stroke: "#64748b",
                strokeWidth: 1,
                strokeDashArray: [4, 3],
                selectable: false,
                evented: false,
              },
            );
            (lineW as { data?: unknown }).data = { type: "dim-label" };
            c.add(lineW);
            const lblW = makeDimText(
              formatDimension(fp.widthPx, scale),
              fp.widthLabelPos.x,
              fp.widthLabelPos.y,
            );
            c.add(lblW);
          }

          // Height dimension line (left)
          if (fp.heightPx > 0) {
            const lineH = new F.Line(
              [fp.leftTick[0].x, fp.leftTick[0].y, fp.leftTick[1].x, fp.leftTick[1].y],
              {
                stroke: "#64748b",
                strokeWidth: 1,
                strokeDashArray: [4, 3],
                selectable: false,
                evented: false,
              },
            );
            (lineH as { data?: unknown }).data = { type: "dim-label" };
            c.add(lineH);
            const lblH = makeDimText(
              formatDimension(fp.heightPx, scale),
              fp.heightLabelPos.x,
              fp.heightLabelPos.y,
            );
            c.add(lblH);
          }

          c.renderAll();
        };

        const addToolObject = (d: ReturnType<typeof describeToolObject>) => {
          if (!d) return;
          const obj = materialize(d);
          if (!obj) return;
          const c = canvas as unknown as {
            add: (...o: unknown[]) => void;
            setActiveObject: (o: unknown) => void;
          };
          // RA-6843 [A4]: a room polygon carries a centered "Name · area" caption
          // as a SEPARATE non-measured Text object (kept out of the polygon so
          // decomposition still shoelaces the top-level `points`). The two are
          // linked by a shared id so the resize sync below can keep them together.
          if (d.kind === "polygon" && d.data.type === "room" && d.label) {
            const roomId = `room-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
            (obj as { data?: Record<string, unknown> }).data = {
              ...d.data,
              id: roomId,
            };
            const labelObj = new F.Text(d.label.text, {
              left: d.label.left,
              top: d.label.top,
              fontSize: 14,
              fill: "#1C2E47",
              originX: "center",
              originY: "center",
              selectable: false,
              evented: false,
            });
            (labelObj as { data?: unknown }).data = {
              type: "room-label",
              roomFor: roomId,
            };
            // RA-6842 [A3]: per-edge dimension labels for completed rooms.
            c.add(obj, labelObj);
            addRoomEdgeDimLabels(
              d.props.points as Point[],
              roomId,
            );
            c.setActiveObject(obj);
            canvas.renderAll();
            return;
          }
          // RA-6842 [A3]: per-wall dimension label for standalone line/wall tool.
          if (d.kind === "line" && d.data.type === "wall") {
            c.add(obj);
            const lp = d.props as { x1: number; y1: number; x2: number; y2: number };
            const a = { x: lp.x1, y: lp.y1 };
            const b = { x: lp.x2, y: lp.y2 };
            const px = Math.hypot(b.x - a.x, b.y - a.y);
            const text = formatDimension(px, pxPerMetreRef.current);
            const { labelPos } = segmentLabelPosition(a, b, 18);
            const dimLbl = makeDimText(text, labelPos.x, labelPos.y);
            (dimLbl as { data?: unknown }).data = { type: "dim-label", dimFor: `wall-${Date.now()}` };
            c.add(dimLbl);
            c.setActiveObject(obj);
            canvas.renderAll();
            return;
          }
          c.add(obj);
          c.setActiveObject(obj);
          if (d.kind === "itext") {
            (obj as { enterEditing?: () => void }).enterEditing?.();
          }
          canvas.renderAll();
        };

        canvas.on("mouse:down", (opt: unknown) => {
          const e = (opt as { e: MouseEvent }).e;
          const tool = toolModeRef.current;
          if (readonly || e.altKey) return;
          // "photo" is the moisture-pin tool (SketchMoistureLayer overlay) in
          // SketchEditorV2 — it owns those clicks, so the canvas ignores it.
          if (
            tool === "select" ||
            tool === "freehand" ||
            tool === "pan" ||
            tool === "photo"
          )
            return;
          const p = scenePoint(e);
          if (tool === "room") {
            polygonPtsRef.current.push(snapVertex(p)); // closed on double-click
            return;
          }
          if (tool === "text") {
            addToolObject(
              describeToolObject({
                tool,
                points: [p],
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
            return;
          }
          // RA-6841 [A2]: Door + window are single-click placement tools.
          // The click is snapped to the nearest wall segment; the wall is
          // passed as `wallSegment` so the pure factory can compute the cut.
          if (tool === "door" || tool === "window") {
            const walls = collectWalls();
            const snapped = snapToNearestWall(
              p,
              walls.map((w) => w.seg),
            );
            const hostWall = snapped ? walls[snapped.wallIndex] : null;
            const wallSeg = hostWall
              ? hostWall.seg
              : { a: { x: p.x - 41, y: p.y }, b: { x: p.x + 41, y: p.y } };
            const anchor = snapped ? snapped.anchor : p;
            // RA-6980 [A2b]: bind the opening to the wall it snapped to so it
            // re-anchors when that wall later moves.
            const hostWallId = (
              hostWall?.obj as { data?: Record<string, unknown> } | undefined
            )?.data?.wallId as string | undefined;
            addToolObject(
              describeToolObject({
                tool,
                points: [anchor],
                pxPerMetre: pxPerMetreRef.current,
                wallSegment: wallSeg,
                wallThicknessPx: pxPerMetreRef.current * 0.11,
                hostWallId,
              }),
            );
            return;
          }
          // drag tools: line / measure / arrow — snap the start to the grid so
          // the right-angle assist squares up from a clean origin.
          drawStartRef.current = snapVertex(p);
        });

        canvas.on("mouse:up", (opt: unknown) => {
          const tool = toolModeRef.current;
          const start = drawStartRef.current;
          // RA-6842 [A3]: remove the live dim label on mouse:up regardless of tool.
          removeLiveDimLabel();
          if (!start) return;
          drawStartRef.current = null;
          if (tool === "line" || tool === "measure" || tool === "arrow") {
            const end = snapEnd(start, scenePoint((opt as { e: MouseEvent }).e));
            addToolObject(
              describeToolObject({
                tool,
                points: [start, end],
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
          }
        });

        canvas.on("mouse:dblclick", () => {
          // RA-6842 [A3]: remove the live dim label when room drawing closes.
          removeLiveDimLabel();
          if (
            toolModeRef.current === "room" &&
            polygonPtsRef.current.length >= 3
          ) {
            addToolObject(
              describeToolObject({
                tool: "room",
                points: polygonPtsRef.current,
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
          }
          polygonPtsRef.current = [];
        });

        // ── RA-6842 [A3]: live dimension label on mouse:move ────────────────
        // Shows a transient dim label during drag (line/wall/measure/arrow)
        // and during room polygon construction (last vertex to current cursor).
        canvas.on("mouse:move", (opt: unknown) => {
          const tool = toolModeRef.current;
          const c = canvas as unknown as {
            add: (...o: unknown[]) => void;
            remove: (...o: unknown[]) => void;
            renderAll: () => void;
          };
          const e = (opt as { e: MouseEvent }).e;
          const cur = scenePoint(e);

          // Drag tools: line / wall / measure / arrow
          const dragStart = drawStartRef.current;
          if (
            dragStart &&
            (tool === "line" || tool === "measure" || tool === "arrow")
          ) {
            removeLiveDimLabel();
            const end = snapEnd(dragStart, cur);
            const px = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);
            if (px > 2) {
              const text = formatDimension(px, pxPerMetreRef.current);
              const { labelPos } = segmentLabelPosition(dragStart, end, 18);
              liveDimLabel = makeDimText(text, labelPos.x, labelPos.y);
              c.add(liveDimLabel);
              c.renderAll();
            }
            return;
          }

          // Room drawing: show dim from the last clicked vertex to cursor
          const pts = polygonPtsRef.current;
          if (tool === "room" && pts.length > 0) {
            removeLiveDimLabel();
            const last = pts[pts.length - 1];
            const snapped = snapVertex(cur);
            const px = Math.hypot(snapped.x - last.x, snapped.y - last.y);
            if (px > 2) {
              const text = formatDimension(px, pxPerMetreRef.current);
              const { labelPos } = segmentLabelPosition(last, snapped, 18);
              liveDimLabel = makeDimText(text, labelPos.x, labelPos.y);
              c.add(liveDimLabel);
              c.renderAll();
            }
          }
        });

        // ── RA-6842 [A3]: refresh overall footprint on geometry changes ──────
        // `isRefreshingFootprint` prevents the footprint re-draw (which calls
        // canvas.add/remove) from re-triggering itself indefinitely.
        let isRefreshingFootprint = false;
        const refreshFootprintOnChange = (opt: unknown) => {
          if (isLoadingRef.current || isRefreshingFootprint) return;
          // Skip if the changed object is a decoration (dim-label / room-label)
          const target = (opt as { target?: { data?: { type?: string } } } | undefined)?.target;
          const ttype = target?.data?.type;
          if (ttype === "dim-label" || ttype === "room-label") return;
          isRefreshingFootprint = true;
          refreshFootprintDimensions();
          isRefreshingFootprint = false;
        };
        canvas.on("object:added", refreshFootprintOnChange);
        canvas.on("object:modified", refreshFootprintOnChange);
        canvas.on("object:removed", refreshFootprintOnChange);

        // ── Keyboard shortcuts ──
        const handleKeyDown = (e: KeyboardEvent) => {
          if (
            e.target !== document.body &&
            e.target !== document.documentElement
          )
            return;
          if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.shiftKey ? redo() : undo();
            e.preventDefault();
          }
        };
        document.addEventListener("keydown", handleKeyDown);

        // ── Background image (Fabric.js v6: backgroundImage property) ──
        if (backgroundImageUrl) {
          try {
            const { FabricImage } = fabric as {
              FabricImage: {
                fromURL: (url: string, opts?: object) => Promise<unknown>;
              };
            };
            const isDataUrl = backgroundImageUrl.startsWith("data:");
            const opts = isDataUrl ? {} : { crossOrigin: "anonymous" };
            const img = await FabricImage.fromURL(backgroundImageUrl, opts);
            const imgEl = img as {
              set: (opts: object) => void;
              scaleToWidth: (w: number) => void;
              width?: number;
              height?: number;
            };
            const t = computeUnderlayTransform({
              imageWidth: imgEl.width ?? width,
              imageHeight: imgEl.height ?? height,
              canvasWidth: width,
              canvasHeight: height,
              scale: backgroundImageScale ?? 1,
              offsetX: backgroundImageOffsetX ?? 0,
              offsetY: backgroundImageOffsetY ?? 0,
              lockAspect: backgroundImageLockAspect,
            });
            imgEl.set({
              selectable: false,
              evented: false,
              opacity: backgroundImageOpacity,
              scaleX: t.scaleX,
              scaleY: t.scaleY,
              left: t.left,
              top: t.top,
            });
            (
              canvas as unknown as { backgroundImage: unknown }
            ).backgroundImage = img;
            if ("requestRenderAll" in (canvas as object)) {
              (
                canvas as unknown as { requestRenderAll: () => void }
              ).requestRenderAll();
            } else {
              canvas.renderAll();
            }
          } catch (e) {
            console.error("SketchCanvas: mount background load failed", e);
          }
        }

        // Save initial empty state
        saveState();

        // Notify parent
        onReady?.({
          toJSON: () =>
            (canvas as unknown as { toJSON: (e?: string[]) => object }).toJSON([
              "data",
            ]),
          loadFromJSON: (data) =>
            new Promise((resolve) => canvas.loadFromJSON(data, resolve)),
          // RA-6847 [C1]: strip the underlay so the export never leaks it.
          toDataURL: (opts) =>
            exportSketchPng(canvas as unknown as ExportableCanvas, opts),
          clear: () => {
            (canvas as unknown as { clear: () => void }).clear();
            canvas.renderAll();
          },
          getFabricCanvas: () => fabricCanvas,
          saveState,
          undo,
          redo,
          canUndo: false,
          canRedo: false,
        });

        // Cleanup
        return () => {
          document.removeEventListener("keydown", handleKeyDown);
        };
      })();

      return () => {
        destroyed = true;
        if (fabricRef.current) {
          (fabricRef.current as { dispose: () => void }).dispose();
          fabricRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width, height]);

    // ── Update drawing mode when toolMode changes ────────────
    useEffect(() => {
      const canvas = fabricRef.current as {
        isDrawingMode: boolean;
        freeDrawingBrush: { color: string; width: number };
        selection: boolean;
        defaultCursor: string;
      } | null;
      if (!canvas) return;

      // Keep the handler-visible refs current and reset any in-progress draw
      // (e.g. a half-finished room polygon) when the tool changes.
      toolModeRef.current = toolMode;
      pxPerMetreRef.current = pxPerMetre;
      snapEnabledRef.current = snapEnabled;
      snapGridMetresRef.current = snapGridMetres;
      drawStartRef.current = null;
      polygonPtsRef.current = [];

      canvas.isDrawingMode = toolMode === "freehand";
      canvas.selection = toolMode === "select" && !readonly;

      if (toolMode === "freehand") {
        canvas.freeDrawingBrush.color = "#3b82f680"; // blue with alpha
        canvas.freeDrawingBrush.width = 20;
      }

      canvas.defaultCursor = toolMode === "pan" ? "grab" : "default";
    }, [toolMode, readonly, pxPerMetre, snapEnabled, snapGridMetres]);

    // ── Update background image when URL/opacity changes (Fabric.js v6) ──
    useEffect(() => {
      const canvas = fabricRef.current as {
        renderAll: () => void;
        backgroundImage: unknown;
      } | null;
      if (!canvas) return;
      if (!backgroundImageUrl) {
        // Clear background
        canvas.backgroundImage = null;
        canvas.renderAll();
        return;
      }
      (async () => {
        try {
          const fabric = await import("fabric");
          const { FabricImage } = fabric as {
            FabricImage: {
              fromURL: (url: string, opts?: object) => Promise<unknown>;
            };
          };
          // Avoid crossOrigin on data URLs — it causes silent failures
          const isDataUrl = backgroundImageUrl.startsWith("data:");
          const opts = isDataUrl ? {} : { crossOrigin: "anonymous" };
          const img = await FabricImage.fromURL(backgroundImageUrl, opts);
          const imgEl = img as {
            set: (opts: object) => void;
            scaleToWidth: (w: number) => void;
            width?: number;
            height?: number;
          };
          const t = computeUnderlayTransform({
            imageWidth: imgEl.width ?? width,
            imageHeight: imgEl.height ?? height,
            canvasWidth: width,
            canvasHeight: height,
            scale: backgroundImageScale ?? 1,
            offsetX: backgroundImageOffsetX ?? 0,
            offsetY: backgroundImageOffsetY ?? 0,
            lockAspect: backgroundImageLockAspect,
          });
          imgEl.set({
            selectable: false,
            evented: false,
            opacity: backgroundImageOpacity,
            scaleX: t.scaleX,
            scaleY: t.scaleY,
            left: t.left,
            top: t.top,
          });
          canvas.backgroundImage = img;
          // v6: requestRenderAll is preferred; fall back to renderAll
          if ("requestRenderAll" in (canvas as object)) {
            (
              canvas as unknown as { requestRenderAll: () => void }
            ).requestRenderAll();
          } else {
            canvas.renderAll();
          }
        } catch (e) {
          console.error("SketchCanvas: failed to load background image", e);
        }
      })();
    }, [
      backgroundImageUrl,
      backgroundImageOpacity,
      backgroundImageScale,
      backgroundImageOffsetX,
      backgroundImageOffsetY,
      backgroundImageLockAspect,
      width,
      height,
    ]);

    return (
      <div
        className={className}
        style={{ overflow: "hidden", touchAction: "none" }}
      >
        <canvas ref={canvasElRef} />
      </div>
    );
  },
);

export default SketchCanvas;
