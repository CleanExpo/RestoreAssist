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
  | "pan"; // Pan/navigate

import { fabricObjectToSelected } from "@/lib/sketch/selected-object";
import { computeUnderlayTransform } from "@/lib/sketch/underlay-transform";
import {
  describeToolObject,
  DEFAULT_PX_PER_METRE,
  type Point,
} from "@/lib/sketch/tool-objects";
import type { SelectedObject } from "./SketchSelectionPanel";

export interface SketchCanvasProps {
  width?: number;
  height?: number;
  toolMode?: ToolMode;
  /** Canvas pixels per real-world metre — drives measure-tool dimensions. */
  pxPerMetre?: number;
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
          const c = fabricRef.current as {
            toDataURL: (o?: object) => string;
          } | null;
          return c?.toDataURL(opts) ?? "";
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
        canvas.on("object:modified", () => {
          if (!isLoadingRef.current) {
            saveState();
            onModified?.();
          }
        });
        canvas.on("object:added", () => {
          if (!isLoadingRef.current) {
            saveState();
            onModified?.();
          }
        });
        canvas.on("object:removed", () => {
          if (!isLoadingRef.current) {
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
          }
          if (obj) (obj as { data?: unknown }).data = d.data;
          return obj;
        };

        const addToolObject = (d: ReturnType<typeof describeToolObject>) => {
          if (!d) return;
          const obj = materialize(d);
          if (!obj) return;
          const c = canvas as unknown as {
            add: (o: unknown) => void;
            setActiveObject: (o: unknown) => void;
          };
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
            polygonPtsRef.current.push(p); // closed on double-click
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
          // drag tools: line / measure / arrow
          drawStartRef.current = p;
        });

        canvas.on("mouse:up", (opt: unknown) => {
          const tool = toolModeRef.current;
          const start = drawStartRef.current;
          if (!start) return;
          drawStartRef.current = null;
          if (tool === "line" || tool === "measure" || tool === "arrow") {
            const end = scenePoint((opt as { e: MouseEvent }).e);
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
          toDataURL: (opts) => canvas.toDataURL(opts),
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
      drawStartRef.current = null;
      polygonPtsRef.current = [];

      canvas.isDrawingMode = toolMode === "freehand";
      canvas.selection = toolMode === "select" && !readonly;

      if (toolMode === "freehand") {
        canvas.freeDrawingBrush.color = "#3b82f680"; // blue with alpha
        canvas.freeDrawingBrush.width = 20;
      }

      canvas.defaultCursor = toolMode === "pan" ? "grab" : "default";
    }, [toolMode, readonly, pxPerMetre]);

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
