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
  | "freehand" // Freehand annotation (legacy)
  | "damage" // Affected-area: tap room or brush
  | "equipment" // Restoration equipment symbols
  | "text" // Text label
  | "arrow" // Arrow annotation
  | "measure" // Measurement tool
  | "photo" // Evidence pin placement (photos on plan)
  | "moisture" // Moisture pin overlay
  | "pan" // Pan/navigate
  // RA-6841 [A2]: architectural opening symbols
  | "door" // Door — opening cut + leaf line + swing arc
  | "window" // Window — opening cut + glazing lines
  | "missing"; // Missing wall / pass-through — gap only

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
  snapToNearbyEndpoint,
  alignmentGuidesFor,
  formatDimension,
  segmentLabelPosition,
  footprintDimensions,
  shouldShowEdgeDimension,
} from "@/lib/sketch/geometry-utils";
import {
  snapToNearestWall,
  pointAtParametric,
  openingCutEndpoints,
  openingJambLines,
  resizeOpeningAlongWall,
} from "@/lib/sketch/opening-geometry";
import {
  describeEquipmentSymbol,
  type EquipmentKind,
} from "@/lib/sketch/equipment-symbols";
import { snapEquipmentPlacement } from "@/lib/sketch/equipment-placement";
import {
  wallAbsoluteSegment,
  polygonAbsolutePoints,
  footprintAbsolutePoints,
} from "@/lib/sketch/fabric-absolute";
import {
  DEFAULT_ROOM_SIDE_M,
  ROOM_TAP_THRESHOLD_PX,
  rectRoomPoints,
  rectRoomPointsFromDiagonal,
  roomLengthWidthM,
  roomEdgeHostSegments,
  parseRoomEdgeHostWallId,
  parseMetresInput,
  roomTemplatePoints,
  flipRoomPoints,
  rotateRoomPoints90,
  resizeRectRoomFromDims,
  type RoomTemplateKind,
} from "@/lib/sketch/room-defaults";
import {
  solidBandsForHost,
  shouldRematerializeHostStroke,
} from "@/lib/sketch/wall-band-rematerialize";
import {
  ADJACENCY_SNAP_PX,
  findRoomAdjacencySnap,
  type RoomEdgeRef,
} from "@/lib/sketch/room-adjacency-snap";
import {
  exportSketchPng,
  EXPORT_REPORT_MULTIPLIER,
  type ExportableCanvas,
} from "@/lib/sketch/export-sketch-png";
import {
  DAMAGE_KIND_STYLES,
  damageAnchorPoint,
  describeRoomDamageTint,
  findContainingRoom,
  resolveRoomDamageTap,
  roomDamageTintId,
  roomsFromFabricObjects,
  type RoomClipCandidate,
} from "@/lib/sketch/damage-zone";
import {
  readWallThicknessM,
  wallThicknessPx,
} from "@/lib/sketch/wall-thickness";
import {
  layoutCanvasPlanChrome,
  PLAN_CHROME_TYPE,
} from "@/lib/sketch/canvas-plan-chrome";
import {
  SHORT_DIM_CTA_TYPE,
  shortEdgeMeasureAffordances,
} from "@/lib/sketch/short-dim-affordance";
import { findNearestDimLabel, type DimLabelHitCandidate } from "@/lib/sketch/dim-label-hit";
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
  /** When toolMode is "damage", tap/brush stamps this damage kind. */
  damageKind?: import("@/lib/sketch/damage-zone").DamageKind;
  /** When toolMode is "equipment", place this restoration symbol. */
  equipmentKind?: EquipmentKind;
  /** When toolMode is "room", one-tap template (rect / L / T). */
  roomTemplateKind?: RoomTemplateKind;
  /** 90° counterclockwise quarters applied to the room template before place. */
  roomTemplateRotateQuarters?: number;
  /** Horizontal flip for the next room template placement. */
  roomTemplateFlipH?: boolean;
  /** Vertical flip for the next room template placement. */
  roomTemplateFlipV?: boolean;
  /**
   * Fabric JSON to restore during init (before onReady).
   * Must be applied here — post-mount loadFromJSON races are unreliable on refresh.
   */
  initialData?: Record<string, unknown> | null;
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
  /** Rematerialize wall bands after thickness / opening changes. */
  refreshWallBands: () => void;
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
      damageKind = "water",
      equipmentKind = "dehumidifier",
      roomTemplateKind = "rect",
      roomTemplateRotateQuarters = 0,
      roomTemplateFlipH = false,
      roomTemplateFlipV = false,
      initialData = null,
    },
    ref,
  ) {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<unknown>(null); // fabric.Canvas instance
    const historyRef = useRef<string[]>([]);
    const historyIdxRef = useRef(-1);
    const isLoadingRef = useRef(false);
    // Capture first-mount restore payload only (API-driven remounts pass a new instance).
    const initialDataRef = useRef(initialData);
    // Keep latest viewport size for async Fabric init + resize without remount.
    const sizeRef = useRef({ width, height });
    sizeRef.current = { width, height };
    // ── Drawing state for the click/drag tools (read inside Fabric handlers) ──
    const toolModeRef = useRef<ToolMode>(toolMode);
    const equipmentKindRef = useRef<EquipmentKind>(equipmentKind);
    const roomTemplateKindRef = useRef<RoomTemplateKind>(roomTemplateKind);
    const roomTemplateRotateRef = useRef(roomTemplateRotateQuarters);
    const roomTemplateFlipHRef = useRef(roomTemplateFlipH);
    const roomTemplateFlipVRef = useRef(roomTemplateFlipV);
    const damageKindRef = useRef(damageKind);
    const pxPerMetreRef = useRef<number>(pxPerMetre);
    const snapEnabledRef = useRef<boolean>(snapEnabled);
    const snapGridMetresRef = useRef<number>(snapGridMetres);
    const drawStartRef = useRef<Point | null>(null);
    const polygonPtsRef = useRef<Point[]>([]);
    const refreshWallBandsRef = useRef<() => void>(() => {});
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
        // Fabric v6/v7: loadFromJSON returns a Promise; 2nd arg is a reviver, NOT a done cb.
        loadFromJSON: (d: object) => Promise<unknown>;
        renderAll: () => void;
      } | null;
      if (!canvas || historyIdxRef.current <= 0) return;
      historyIdxRef.current -= 1;
      isLoadingRef.current = true;
      const json = JSON.parse(historyRef.current[historyIdxRef.current]);
      await canvas.loadFromJSON(json);
      canvas.renderAll();
      isLoadingRef.current = false;
      setHistoryState({
        canUndo: historyIdxRef.current > 0,
        canRedo: historyIdxRef.current < historyRef.current.length - 1,
      });
    }, []);

    const redo = useCallback(async () => {
      const canvas = fabricRef.current as {
        loadFromJSON: (d: object) => Promise<unknown>;
        renderAll: () => void;
      } | null;
      if (!canvas || historyIdxRef.current >= historyRef.current.length - 1)
        return;
      historyIdxRef.current += 1;
      isLoadingRef.current = true;
      const json = JSON.parse(historyRef.current[historyIdxRef.current]);
      await canvas.loadFromJSON(json);
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
            loadFromJSON: (d: object) => Promise<unknown>;
            renderAll: () => void;
          } | null;
          if (!c) return;
          // Fabric v7: must await the returned Promise. Passing a "done"
          // callback as arg 2 treats it as a reviver and never restores objects.
          await c.loadFromJSON(data);
          c.renderAll();
        },
        toDataURL: (opts) => {
          const c = fabricRef.current as ExportableCanvas | null;
          // RA-6847 [C1]: strip underlay + crop to content for report fidelity.
          return c
            ? exportSketchPng(c, {
                multiplier: EXPORT_REPORT_MULTIPLIER,
                ...opts,
              })
            : "";
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
        refreshWallBands: () => refreshWallBandsRef.current(),
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

        const initialSize = sizeRef.current;
        fabricCanvas = new Canvas(canvasElRef.current!, {
          width: initialSize.width,
          height: initialSize.height,
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
        // ResizeObserver may have updated viewport while fabric was importing.
        const latest = sizeRef.current;
        if (
          latest.width !== initialSize.width ||
          latest.height !== initialSize.height
        ) {
          (
            fabricCanvas as {
              setDimensions: (d: { width: number; height: number }) => void;
              calcOffset: () => void;
            }
          ).setDimensions({ width: latest.width, height: latest.height });
          (
            fabricCanvas as { calcOffset: () => void }
          ).calcOffset();
        }
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
          loadFromJSON: (d: object) => Promise<unknown>;
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
        // (dim-label, room-label, or transient alignment guide) that must NOT
        // enter the undo stack. Guides are added/removed on every mouse:move
        // while dragging — without this exclusion each add/remove would push a
        // full canvas.toJSON() snapshot onto the undo history.
        const isDecoration = (obj: unknown): boolean => {
          const t = (obj as { data?: { type?: string } } | undefined)?.data?.type;
          return (
            t === "dim-label" ||
            t === "room-label" ||
            t === "guide" ||
            t === "opening-handle" ||
            t === "wall-band" ||
            t === "adjacency-join" ||
            t === SHORT_DIM_CTA_TYPE ||
            t === PLAN_CHROME_TYPE
          );
        };

        // Assigned after Fabric constructors (`F`) / opening-handle helpers exist.
        let bindDamagePathToRoom: (path: Record<string, unknown>) => void =
          () => {};
        let refreshDamageRoomClips: () => void = () => {};
        let applyRoomDamageTap: (x: number, y: number) => boolean = () =>
          false;
        let refreshWallBands: () => void = () => {};
        let clearAdjacencyJoin: () => void = () => {};
        let showAdjacencyJoin: (join: { a: Point; b: Point }) => void = () => {};

        canvas.on("object:modified", (opt: unknown) => {
          const target = (opt as { target?: unknown } | undefined)?.target;
          // Opening-handle drags are committed by the dedicated handler below.
          if (isDecoration(target) &&
            (target as { data?: { type?: string } })?.data?.type ===
              "opening-handle") {
            return;
          }
          syncRoomLabel(target);
          // RA-6980 [A2b]: a moved wall (or room edge host) drags bound openings.
          reanchorOpeningsForWall(target);
          reanchorOpeningsForRoom(target);
          refreshWallBands();
          clearAdjacencyJoin();
          // Dimension lock: prevent scale/stretch from changing locked geometry.
          enforceDimLock(target);
          // Keep damage fills clipped to room walls after geometry edits.
          if (
            (target as { data?: { type?: string } } | undefined)?.data?.type ===
            "room"
          ) {
            refreshDamageRoomClips();
          }
          if (!isLoadingRef.current && !isDecoration(target)) {
            saveState();
            onModified?.();
          }
          refreshOpeningHandles();
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
          if (
            (target as { data?: { type?: string } } | undefined)?.data?.type ===
            "opening"
          ) {
            refreshWallBands();
          }
          if (!isLoadingRef.current && !isDecoration(target)) {
            saveState();
            onModified?.();
          }
        });
        canvas.on("path:created", (opt: unknown) => {
          const path = (opt as { path?: Record<string, unknown> } | undefined)
            ?.path;
          if (!path) return;
          if (toolModeRef.current === "damage") {
            const kind = damageKindRef.current;
            const style = DAMAGE_KIND_STYLES[kind] ?? DAMAGE_KIND_STYLES.water;
            // Tap vs brush: a click/tap produces a tiny path — treat as
            // Encircle one-tap room colorize and drop the stroke.
            const br =
              typeof (path as { getBoundingRect?: (a?: boolean) => {
                width: number;
                height: number;
              } }).getBoundingRect === "function"
                ? (
                    path as {
                      getBoundingRect: (a?: boolean) => {
                        width: number;
                        height: number;
                      };
                    }
                  ).getBoundingRect(true)
                : null;
            const tapPx = ROOM_TAP_THRESHOLD_PX * 2.5;
            const isTap =
              !!br &&
              br.width <= tapPx &&
              br.height <= tapPx;
            if (isTap) {
              const anchor = damageAnchorPoint(
                path as Parameters<typeof damageAnchorPoint>[0],
              );
              (
                canvas as unknown as { remove: (o: unknown) => void }
              ).remove(path);
              applyRoomDamageTap(anchor.x, anchor.y);
              return;
            }
            path.data = {
              type: "damage",
              damageKind: kind,
              provenance: "operator_measured",
              id: `dmg-${Date.now().toString(36)}`,
            };
            // Keep stroke colour authoritative; fill is applied as a room-bound
            // tint (see bindDamagePathToRoom) so open freehand strokes don't
            // self-fill into floating blobs.
            if (typeof path.set === "function") {
              (path.set as (o: object) => void)({ stroke: style.stroke });
            } else {
              path.stroke = style.stroke;
            }
            bindDamagePathToRoom(path);
          } else {
            path.data = {
              ...(typeof path.data === "object" && path.data
                ? (path.data as object)
                : {}),
              type: "freehand",
            };
          }
        });

        // ── Selection → SketchSelectionPanel ──
        // Declared early; body assigned after opening-handle helpers exist below.
        let refreshOpeningHandles: () => void = () => {};
        let clearOpeningHandles: () => void = () => {};

        const emitSelection = () => {
          const active = (
            canvas as unknown as { getActiveObject: () => unknown }
          ).getActiveObject();
          // Enrich room selection with derived L×W for the typed-dim panel.
          const base = fabricObjectToSelected(
            active as Parameters<typeof fabricObjectToSelected>[0],
          );
          if (base?.type === "room") {
            const pts = polygonAbsolutePoints(active);
            const dims = pts ? roomLengthWidthM(pts, pxPerMetreRef.current) : null;
            if (dims) {
              onSelect?.({
                ...base,
                lengthM: dims.lengthM,
                widthM: dims.widthM,
                dimLocked:
                  (active as { data?: { dimLocked?: boolean } })?.data
                    ?.dimLocked === true,
              });
              refreshOpeningHandles();
              return;
            }
          }
          onSelect?.(base);
          refreshOpeningHandles();
        };
        canvas.on("selection:created", emitSelection);
        canvas.on("selection:updated", emitSelection);
        canvas.on("selection:cleared", () => {
          clearOpeningHandles();
          onSelect?.(null);
        });

        // ── Tool object creation (room/line/text/arrow/measure/photo) ──
        // RA-6759: each declared ToolMode now produces a real Fabric object
        // carrying custom `data` (type + provenance) for selection +
        // decomposition. Geometry/units/data logic lives in the pure
        // describeToolObject() factory; this only materialises the descriptor.
        const F = fabric as unknown as Record<
          string,
          new (...args: unknown[]) => unknown
        >;

        /** Clip a damage path to the containing room polygon (scene coords). */
        const applyRoomClip = (
          path: {
            clipPath?: unknown;
            data?: Record<string, unknown>;
            set?: (o: object) => void;
            setCoords?: () => void;
          },
          room: RoomClipCandidate,
        ) => {
          const clip = new F.Polygon(room.points.map((p) => ({ ...p })), {
            absolutePositioned: true,
            inverted: false,
            fill: "#000000",
            strokeWidth: 0,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          path.clipPath = clip;
          path.data = {
            ...(typeof path.data === "object" && path.data ? path.data : {}),
            roomId: room.id,
          };
          path.setCoords?.();
        };

        /**
         * Ensure the host room carries a light damage tint so affected areas
         * read as room-bound fills in the editor and report PNG (not just a
         * freehand stroke). Idempotent per roomId+kind.
         */
        const ensureRoomDamageTint = (
          room: RoomClipCandidate,
          kind: string,
        ) => {
          const damageKind =
            kind in DAMAGE_KIND_STYLES
              ? (kind as keyof typeof DAMAGE_KIND_STYLES)
              : "water";
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const tintId = roomDamageTintId(room.id, damageKind);
          const exists = objs.some(
            (o) =>
              (o as { data?: { id?: string } }).data?.id === tintId,
          );
          if (exists) return;
          const desc = describeRoomDamageTint(room, damageKind);
          const tint = new F.Polygon(desc.points, {
            fill: desc.fill,
            stroke: desc.stroke,
            strokeWidth: desc.strokeWidth,
            selectable: false,
            evented: false,
            objectCaching: false,
            opacity: 1,
          });
          (tint as { data?: Record<string, unknown> }).data = { ...desc.data };
          (
            canvas as unknown as { add: (...o: unknown[]) => void }
          ).add(tint);
          // Keep tint under walls/labels: send to back, then underlay stays bg.
          (
            canvas as unknown as { sendObjectToBack?: (o: unknown) => void }
          ).sendObjectToBack?.(tint);
        };

        /** One-tap Encircle-style room colorize / toggle. */
        applyRoomDamageTap = (x: number, y: number) => {
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (...o: unknown[]) => void;
            requestRenderAll?: () => void;
            renderAll: () => void;
          };
          const objs = c.getObjects();
          const rooms = roomsFromFabricObjects(objs);
          const existing = new Set<string>();
          for (const o of objs) {
            const id = (o as { data?: { id?: string } }).data?.id;
            if (typeof id === "string") existing.add(id);
          }
          const kind = damageKindRef.current;
          const resolved = resolveRoomDamageTap(x, y, rooms, kind, existing);
          if (resolved.action === "none") return false;
          if (resolved.action === "clear") {
            const toRemove = objs.filter(
              (o) =>
                (o as { data?: { id?: string } }).data?.id === resolved.tintId,
            );
            if (toRemove.length) c.remove(...toRemove);
          } else {
            // One category per room — remove other tints for this room first.
            const stale = objs.filter((o) => {
              const d = (o as { data?: Record<string, unknown> }).data;
              return (
                d?.type === "damage" &&
                d.role === "room-tint" &&
                d.roomId === resolved.room.id
              );
            });
            if (stale.length) c.remove(...stale);
            ensureRoomDamageTint(resolved.room, resolved.kind);
          }
          if (typeof c.requestRenderAll === "function") c.requestRenderAll();
          else c.renderAll();
          if (!isLoadingRef.current) {
            saveState();
            onModified?.();
          }
          return true;
        };

        bindDamagePathToRoom = (path) => {
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const rooms = roomsFromFabricObjects(objs);
          const anchor = damageAnchorPoint(
            path as Parameters<typeof damageAnchorPoint>[0],
          );
          const room = findContainingRoom(anchor.x, anchor.y, rooms);
          if (!room) return;
          applyRoomClip(
            path as {
              clipPath?: unknown;
              data?: Record<string, unknown>;
              set?: (o: object) => void;
              setCoords?: () => void;
            },
            room,
          );
          const kind =
            typeof (path.data as { damageKind?: string } | undefined)
              ?.damageKind === "string"
              ? (path.data as { damageKind: string }).damageKind
              : "water";
          ensureRoomDamageTint(room, kind);
          const c = canvas as unknown as {
            requestRenderAll?: () => void;
            renderAll: () => void;
          };
          if (typeof c.requestRenderAll === "function") c.requestRenderAll();
          else c.renderAll();
        };

        // Re-bind damage clips + room tints after room moves or JSON restore so
        // fills stay glued to wall polygons in the editor and in report exports.
        refreshDamageRoomClips = () => {
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (...o: unknown[]) => void;
          };
          const objs = c.getObjects();
          const rooms = roomsFromFabricObjects(objs);
          if (!rooms.length) return;

          // Recreate room tints from current absolute room geometry (Fabric
          // polygon local points go stale after move/scale).
          const tints = objs.filter((o) => {
            const d = (o as { data?: Record<string, unknown> }).data;
            return d?.type === "damage" && d.role === "room-tint";
          });
          for (const tint of tints) {
            const d = (tint as { data?: Record<string, unknown> }).data!;
            const room =
              typeof d.roomId === "string"
                ? rooms.find((r) => r.id === d.roomId)
                : undefined;
            const kind =
              typeof d.damageKind === "string" ? d.damageKind : "water";
            c.remove(tint);
            if (room) ensureRoomDamageTint(room, kind);
          }

          for (const o of c.getObjects()) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (!d || d.type !== "damage" || d.role === "room-tint") continue;
            const byId =
              typeof d.roomId === "string"
                ? rooms.find((r) => r.id === d.roomId)
                : undefined;
            const anchor = damageAnchorPoint(
              o as Parameters<typeof damageAnchorPoint>[0],
            );
            const stillInside =
              byId &&
              findContainingRoom(anchor.x, anchor.y, [byId]) !== null;
            const room = stillInside
              ? byId
              : findContainingRoom(anchor.x, anchor.y, rooms);
            if (room) applyRoomClip(o as Parameters<typeof applyRoomClip>[0], room);
          }
        };

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

        // RA-6969 [A5b]: pixel radius within which a drawn point snaps exactly
        // onto an existing endpoint (shares a corner) instead of grid-snapping.
        const ENDPOINT_SNAP_PX = 12;

        // RA-6969 [A5b]: absolute endpoints of the existing MEASURED geometry —
        // wall/line endpoints (transformed to scene coords) + room polygon
        // vertices. A0 firewall: `underlay_reference` geometry is never a snap
        // target, so snapping only ever shares measured corners and can never
        // promote an underlay anchor into measured geometry. Mirrors the
        // "measured geometry" filter used by refreshFootprintDimensions().
        const collectEndpoints = (): Point[] => {
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const eps: Point[] = [];
          for (const o of objs) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (!d) continue;
            if (d.provenance === "underlay_reference") continue;
            const t = d.type as string | undefined;
            if (
              t === "dim-label" ||
              t === "room-label" ||
              t === "text" ||
              t === "arrow" ||
              t === "photo" ||
              t === "guide"
            )
              continue;
            const seg = wallAbsoluteSegment(o);
            if (seg) {
              eps.push(seg.a, seg.b);
              continue;
            }
            const pts = polygonAbsolutePoints(o);
            if (pts) for (const pt of pts) eps.push(pt);
          }
          return eps;
        };

        // Snap a standalone drawn vertex (room corner). Endpoint-proximity snap
        // takes priority over grid so adjacent rooms share exact corners.
        const snapVertex = (p: Point): Point => {
          if (snapEnabledRef.current) {
            const ep = snapToNearbyEndpoint(p, collectEndpoints(), ENDPOINT_SNAP_PX);
            if (ep.snapped) return ep.point;
          }
          return snapPointToGrid(p, gridPx());
        };
        // Snap a drag endpoint: exact endpoint snap first (sharing a corner beats
        // squaring), else right-angle assist around `start` + grid.
        const snapEnd = (start: Point, end: Point): Point => {
          if (!snapEnabledRef.current) return end;
          const ep = snapToNearbyEndpoint(end, collectEndpoints(), ENDPOINT_SNAP_PX);
          if (ep.snapped) return ep.point;
          return snapSegmentEnd(start, end, gridPx(), 45);
        };

        // RA-6841 [A2] + room-first P0: Collect host segments from standalone
        // walls AND room polygon edges so doors/windows snap in the Xactimate
        // room-first workflow (not only after drawing four Wall tools).
        const collectWalls = (): {
          obj: unknown;
          seg: { a: Point; b: Point };
          wallId?: string;
        }[] => {
          const objs = (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects();
          const walls: {
            obj: unknown;
            seg: { a: Point; b: Point };
            wallId?: string;
          }[] = [];
          for (const o of objs) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (!d) continue;
            if (d.provenance === "underlay_reference") continue;
            if (d.type === "wall") {
              const seg = wallAbsoluteSegment(o);
              if (seg)
                walls.push({
                  obj: o,
                  seg,
                  wallId: d.wallId as string | undefined,
                });
              continue;
            }
            if (d.type === "room" && typeof d.id === "string") {
              const pts = polygonAbsolutePoints(o);
              if (!pts || pts.length < 2) continue;
              for (const edge of roomEdgeHostSegments(d.id, pts)) {
                walls.push({ obj: o, seg: edge.seg, wallId: edge.wallId });
              }
            }
          }
          return walls;
        };

        /** Resolve a host wall segment by stable wallId (wall or room edge). */
        const findHostSegment = (
          hostWallId: string,
        ): { a: Point; b: Point } | null => {
          const walls = collectWalls();
          const hit = walls.find((w) => w.wallId === hostWallId);
          return hit?.seg ?? null;
        };

        /**
         * P1: rematerialize host strokes as solid wall bands with true gaps at
         * openings (replaces continuous stroke + white cut mask).
         */
        refreshWallBands = () => {
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (...o: unknown[]) => void;
            add: (...o: unknown[]) => void;
            renderAll: () => void;
          };
          const objs = c.getObjects();
          const stale = objs.filter(
            (o) =>
              (o as { data?: { type?: string } }).data?.type === "wall-band",
          );
          if (stale.length) c.remove(...stale);

          const openings = objs
            .map((o) => (o as { data?: Record<string, unknown> }).data)
            .filter(
              (d): d is Record<string, unknown> =>
                !!d &&
                d.type === "opening" &&
                typeof d.hostWallId === "string" &&
                typeof d.hostWallT === "number" &&
                typeof d.widthM === "number",
            );

          const byHost = new Map<
            string,
            { hostWallT: number; widthM: number }[]
          >();
          for (const od of openings) {
            const id = od.hostWallId as string;
            const list = byHost.get(id) ?? [];
            list.push({
              hostWallT: od.hostWallT as number,
              widthM: od.widthM as number,
            });
            byHost.set(id, list);
          }

          const hostsWithBands = new Set<string>();
          const hostThickness = (hostWallId: string): number => {
            for (const o of objs) {
              const d = (o as { data?: Record<string, unknown> }).data;
              if (!d) continue;
              if (d.type === "wall" && d.wallId === hostWallId) {
                return wallThicknessPx(
                  readWallThicknessM(d),
                  pxPerMetreRef.current,
                );
              }
              if (d.type === "room" && typeof d.id === "string") {
                const edges = roomEdgeHostSegments(
                  d.id,
                  polygonAbsolutePoints(o) ?? [],
                );
                if (edges.some((e) => e.wallId === hostWallId)) {
                  return wallThicknessPx(
                    readWallThicknessM(d),
                    pxPerMetreRef.current,
                  );
                }
              }
            }
            return wallThicknessPx(undefined, pxPerMetreRef.current);
          };

          for (const [hostWallId, cuts] of byHost) {
            if (!shouldRematerializeHostStroke(cuts.length)) continue;
            const seg = findHostSegment(hostWallId);
            if (!seg) continue;
            const strokeWidth = hostThickness(hostWallId);
            const bands = solidBandsForHost(seg, cuts, pxPerMetreRef.current);
            hostsWithBands.add(hostWallId);
            for (const band of bands) {
              const line = new F.Line(
                [band.a.x, band.a.y, band.b.x, band.b.y],
                {
                  stroke: "#1C2E47",
                  strokeWidth,
                  strokeLineCap: "butt",
                  strokeUniform: true,
                  selectable: false,
                  evented: false,
                  objectCaching: false,
                },
              );
              (line as { data?: Record<string, unknown> }).data = {
                type: "wall-band",
                hostWallId,
              };
              c.add(line);
            }
          }

          // Hide continuous host stroke when bands own the edge visuals.
          for (const o of c.getObjects()) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (!d) continue;
            if (d.type === "wall" && typeof d.wallId === "string") {
              const hide = hostsWithBands.has(d.wallId);
              const sw = wallThicknessPx(
                readWallThicknessM(d),
                pxPerMetreRef.current,
              );
              (o as { set?: (p: object) => void }).set?.({
                strokeWidth: hide ? 0 : sw,
              });
            }
            if (d.type === "room" && typeof d.id === "string") {
              const edges = roomEdgeHostSegments(
                d.id,
                polygonAbsolutePoints(o) ?? [],
              );
              const hide = edges.some((e) => hostsWithBands.has(e.wallId));
              const sw = wallThicknessPx(
                readWallThicknessM(d),
                pxPerMetreRef.current,
              );
              (o as { set?: (p: object) => void }).set?.({
                strokeWidth: hide ? 0 : sw,
              });
            }
          }
          c.renderAll();
        };
        refreshWallBandsRef.current = refreshWallBands;

        let adjacencyJoinLine: unknown = null;
        clearAdjacencyJoin = () => {
          if (!adjacencyJoinLine) return;
          (
            canvas as unknown as { remove: (...o: unknown[]) => void }
          ).remove(adjacencyJoinLine);
          adjacencyJoinLine = null;
        };
        showAdjacencyJoin = (join: { a: Point; b: Point }) => {
          clearAdjacencyJoin();
          const c = canvas as unknown as {
            add: (o: unknown) => void;
            bringObjectToFront?: (o: unknown) => void;
          };
          // Soft underlay + bright join so the cue stays visible over rooms.
          const glow = new F.Line([join.a.x, join.a.y, join.b.x, join.b.y], {
            stroke: "#86efac",
            strokeWidth: 10,
            strokeLineCap: "round",
            opacity: 0.55,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          const line = new F.Line([join.a.x, join.a.y, join.b.x, join.b.y], {
            stroke: "#16a34a",
            strokeWidth: 5,
            strokeLineCap: "round",
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          (glow as { data?: Record<string, unknown> }).data = {
            type: "adjacency-join",
          };
          (line as { data?: Record<string, unknown> }).data = {
            type: "adjacency-join",
          };
          const group = new F.Group([glow, line], {
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          (group as { data?: Record<string, unknown> }).data = {
            type: "adjacency-join",
          };
          adjacencyJoinLine = group;
          c.add(group);
          c.bringObjectToFront?.(group);
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
            // P1: true wall-band rematerialize owns the gap — door symbol is
            // leaf + swing + jambs only (no white cut mask over continuous stroke).
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
            const jambs = openingJambLines(
              p.cutStart,
              p.cutEnd,
              p.wallThicknessPx,
            ).map(
              ([s, e]) =>
                new F.Line([s.x, s.y, e.x, e.y], {
                  stroke: p.stroke,
                  strokeWidth: Math.max(2, p.strokeWidth),
                  strokeLineCap: "butt",
                }),
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
            obj = new F.Group([...jambs, leafLine, arc]);
          } else if (d.kind === "window-opening") {
            // P1: wall bands own the opening gap; window is jambs + glazing only.
            const p = d.props as {
              cutStart: { x: number; y: number };
              cutEnd: { x: number; y: number };
              glazingLines: [[{ x: number; y: number }, { x: number; y: number }]];
              stroke: string;
              strokeWidth: number;
              wallThicknessPx: number;
            };
            const members: unknown[] = [];
            for (const [s, e] of openingJambLines(
              p.cutStart,
              p.cutEnd,
              p.wallThicknessPx,
            )) {
              members.push(
                new F.Line([s.x, s.y, e.x, e.y], {
                  stroke: p.stroke,
                  strokeWidth: Math.max(2, p.strokeWidth),
                  strokeLineCap: "butt",
                }),
              );
            }
            for (const [s, e] of p.glazingLines) {
              members.push(
                new F.Line([s.x, s.y, e.x, e.y], {
                  stroke: p.stroke,
                  strokeWidth: p.strokeWidth,
                }),
              );
            }
            obj = new F.Group(members);
          } else if (d.kind === "missing-opening") {
            // P2: pass-through — jamb ticks only; wall bands own the gap.
            const p = d.props as {
              cutStart: { x: number; y: number };
              cutEnd: { x: number; y: number };
              stroke: string;
              strokeWidth: number;
              wallThicknessPx: number;
            };
            const members = openingJambLines(
              p.cutStart,
              p.cutEnd,
              p.wallThicknessPx,
            ).map(
              ([s, e]) =>
                new F.Line([s.x, s.y, e.x, e.y], {
                  stroke: p.stroke,
                  strokeWidth: Math.max(2, p.strokeWidth),
                  strokeLineCap: "butt",
                }),
            );
            // Subtle dashed centerline so the opening remains selectable.
            members.push(
              new F.Line(
                [p.cutStart.x, p.cutStart.y, p.cutEnd.x, p.cutEnd.y],
                {
                  stroke: p.stroke,
                  strokeWidth: 1,
                  strokeDashArray: [4, 4],
                  opacity: 0.55,
                },
              ),
            );
            obj = new F.Group(members);
          }
          if (obj) (obj as { data?: unknown }).data = d.data;
          return obj;
        };

        const materializeEquipment = (
          desc: ReturnType<typeof describeEquipmentSymbol>,
        ): unknown => {
          const p = desc.props;
          const circle = new F.Circle({
            left: 0,
            top: 0,
            radius: p.radius,
            fill: p.fill,
            stroke: p.stroke,
            strokeWidth: p.strokeWidth,
            originX: "center",
            originY: "center",
          });
          const short = new F.Text(p.short, {
            left: 0,
            top: -Math.round(p.radius * 0.15),
            fontSize: Math.max(10, Math.round(p.radius * 0.65)),
            fill: p.stroke,
            fontFamily: "sans-serif",
            fontWeight: "bold",
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
          });
          const caption = new F.Text(p.label, {
            left: 0,
            top: Math.round(p.radius * 0.85),
            fontSize: 9,
            fill: "#1C2E47",
            fontFamily: "sans-serif",
            originX: "center",
            originY: "top",
            selectable: false,
            evented: false,
          });
          const group = new F.Group([circle, short, caption], {
            left: p.left,
            top: p.top,
            originX: "center",
            originY: "center",
          });
          (group as { data?: unknown }).data = desc.data;
          return group;
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
              wallThicknessPx: wallThicknessPx(
                readWallThicknessM(wd),
                pxPerMetreRef.current,
              ),
              hingeSide: od.hingeSide as "left" | "right" | undefined,
              openingWidthM: od.widthM as number | undefined,
              hostWallId: wd.wallId as string,
            });
            if (!d) continue;
            // Preserve stable opening id + lock across rematerialize.
            d.data = {
              ...d.data,
              id: od.id ?? d.data.id,
              dimLocked: od.dimLocked === true,
            };
            const fresh = materialize(d);
            if (!fresh) continue;
            c.remove(o);
            c.add(fresh);
          }
          c.renderAll();
        };

        // Room-edge hosts: when a room polygon moves/resizes, re-anchor every
        // opening whose hostWallId is `${roomId}:edge:N`.
        const reanchorOpeningsForRoom = (roomObj: unknown): void => {
          const rd = (roomObj as { data?: Record<string, unknown> } | undefined)
            ?.data;
          if (!rd || rd.type !== "room" || typeof rd.id !== "string") return;
          const pts = polygonAbsolutePoints(roomObj);
          if (!pts || pts.length < 2) return;
          const edges = roomEdgeHostSegments(rd.id, pts);
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (o: unknown) => void;
            add: (o: unknown) => void;
            renderAll: () => void;
          };
          for (const o of c.getObjects()) {
            const od = (o as { data?: Record<string, unknown> }).data;
            if (!od || od.type !== "opening" || typeof od.hostWallId !== "string")
              continue;
            const parsed = parseRoomEdgeHostWallId(od.hostWallId);
            if (!parsed || parsed.roomId !== rd.id) continue;
            const edge = edges.find((e) => e.edgeIndex === parsed.edgeIndex);
            if (!edge || typeof od.hostWallT !== "number") continue;
            const anchor = pointAtParametric(od.hostWallT as number, edge.seg);
            const d = describeToolObject({
              tool: od.openingKind as ToolMode,
              points: [anchor],
              pxPerMetre: pxPerMetreRef.current,
              wallSegment: edge.seg,
              wallThicknessPx: wallThicknessPx(
                readWallThicknessM(rd),
                pxPerMetreRef.current,
              ),
              hingeSide: od.hingeSide as "left" | "right" | undefined,
              openingWidthM: od.widthM as number | undefined,
              hostWallId: od.hostWallId as string,
            });
            if (!d) continue;
            d.data = {
              ...d.data,
              id: od.id ?? d.data.id,
              dimLocked: od.dimLocked === true,
            };
            const fresh = materialize(d);
            if (!fresh) continue;
            c.remove(o);
            c.add(fresh);
          }
          c.renderAll();
        };

        /** When dimLocked, revert scale/stretch so typed measurements stick. */
        const enforceDimLock = (target: unknown): void => {
          const t = target as {
            data?: Record<string, unknown>;
            scaleX?: number;
            scaleY?: number;
            set?: (o: object) => void;
            setCoords?: () => void;
            lockScalingX?: boolean;
            lockScalingY?: boolean;
          } | null;
          if (!t?.data?.dimLocked) return;
          t.lockScalingX = true;
          t.lockScalingY = true;
          if (t.scaleX !== 1 || t.scaleY !== 1) {
            t.set?.({ scaleX: 1, scaleY: 1 });
            t.setCoords?.();
          }
        };

        // ── Opening end handles (red diamonds) ────────────────────────────────
        let openingHandles: unknown[] = [];
        clearOpeningHandles = () => {
          if (!openingHandles.length) return;
          const c = canvas as unknown as { remove: (...o: unknown[]) => void };
          c.remove(...openingHandles);
          openingHandles = [];
        };

        const rematerializeOpening = (
          openingObj: unknown,
          next: {
            widthM: number;
            hostWallT: number;
            anchor: Point;
            wall: { a: Point; b: Point };
          },
        ): unknown | null => {
          const od = (openingObj as { data?: Record<string, unknown> }).data;
          if (!od || od.type !== "opening") return null;
          const d = describeToolObject({
            tool: od.openingKind as ToolMode,
            points: [next.anchor],
            pxPerMetre: pxPerMetreRef.current,
            wallSegment: next.wall,
            wallThicknessPx: wallThicknessPx(
              typeof od.wallThicknessM === "number"
                ? (od.wallThicknessM as number)
                : undefined,
              pxPerMetreRef.current,
            ),
            hingeSide: od.hingeSide as "left" | "right" | undefined,
            openingWidthM: next.widthM,
            hostWallId: od.hostWallId as string | undefined,
          });
          if (!d) return null;
          d.data = {
            ...d.data,
            id: od.id ?? d.data.id,
            hostWallT: next.hostWallT,
            dimLocked: od.dimLocked === true,
          };
          return materialize(d);
        };

        refreshOpeningHandles = () => {
          clearOpeningHandles();
          if (readonly || toolModeRef.current !== "select") return;
          const active = (
            canvas as unknown as { getActiveObject: () => unknown }
          ).getActiveObject() as { data?: Record<string, unknown> } | null;
          const od = active?.data;
          if (
            !od ||
            od.type !== "opening" ||
            typeof od.hostWallId !== "string" ||
            typeof od.hostWallT !== "number" ||
            typeof od.widthM !== "number"
          )
            return;
          const wall = findHostSegment(od.hostWallId);
          if (!wall) return;
          const [cutStart, cutEnd] = openingCutEndpoints(
            pointAtParametric(od.hostWallT, wall),
            wall,
            od.widthM,
            pxPerMetreRef.current,
          );
          const makeHandle = (pt: Point, which: "start" | "end") => {
            const diamond = new F.Rect({
              left: pt.x,
              top: pt.y,
              width: 14,
              height: 14,
              fill: "#ef4444",
              stroke: "#ffffff",
              strokeWidth: 1.5,
              originX: "center",
              originY: "center",
              angle: 45,
              selectable: !od.dimLocked,
              evented: !od.dimLocked,
              hasControls: false,
              hasBorders: false,
              hoverCursor: "ew-resize",
            });
            (diamond as { data?: Record<string, unknown> }).data = {
              type: "opening-handle",
              handle: which,
              openingId: od.id,
            };
            // Drag along host wall → resize opening width (commit on modified).
            (diamond as { on?: (ev: string, fn: () => void) => void }).on?.(
              "moving",
              () => {
                const pointer = {
                  x: (diamond as { left?: number }).left ?? pt.x,
                  y: (diamond as { top?: number }).top ?? pt.y,
                };
                const resized = resizeOpeningAlongWall({
                  wall,
                  hostWallT: od.hostWallT as number,
                  widthM: od.widthM as number,
                  pxPerMetre: pxPerMetreRef.current,
                  handle: which,
                  pointer,
                });
                const [s, e] = openingCutEndpoints(
                  resized.anchor,
                  wall,
                  resized.widthM,
                  pxPerMetreRef.current,
                );
                const snap = which === "start" ? s : e;
                (diamond as { set: (o: object) => void; setCoords?: () => void }).set({
                  left: snap.x,
                  top: snap.y,
                });
                (diamond as { setCoords?: () => void }).setCoords?.();
                (diamond as { data?: Record<string, unknown> }).data = {
                  type: "opening-handle",
                  handle: which,
                  openingId: od.id,
                  pendingResize: resized,
                };
              },
            );
            return diamond;
          };
          const hStart = makeHandle(cutStart, "start");
          const hEnd = makeHandle(cutEnd, "end");
          openingHandles = [hStart, hEnd];
          const c = canvas as unknown as {
            add: (...o: unknown[]) => void;
            renderAll: () => void;
            on: (ev: string, fn: (opt: unknown) => void) => void;
          };
          c.add(hStart, hEnd);
          c.renderAll();
        };

        // Commit opening resize when a handle drag finishes.
        canvas.on("object:modified", (opt: unknown) => {
          const target = (opt as { target?: { data?: Record<string, unknown> } })
            ?.target;
          if (target?.data?.type !== "opening-handle") return;
          const openingId = target.data.openingId as string | undefined;
          const pending = target.data.pendingResize as
            | {
                widthM: number;
                hostWallT: number;
                anchor: Point;
              }
            | undefined;
          if (!openingId || !pending) return;
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (o: unknown) => void;
            add: (o: unknown) => void;
            setActiveObject: (o: unknown) => void;
            renderAll: () => void;
          };
          const opening = c.getObjects().find((o) => {
            const d = (o as { data?: Record<string, unknown> }).data;
            return d?.type === "opening" && d.id === openingId;
          }) as { data?: Record<string, unknown> } | undefined;
          if (!opening || typeof opening.data?.hostWallId !== "string") return;
          const wall = findHostSegment(opening.data.hostWallId);
          if (!wall) return;
          const fresh = rematerializeOpening(opening, { ...pending, wall });
          if (!fresh) return;
          clearOpeningHandles();
          c.remove(opening);
          c.add(fresh);
          c.setActiveObject(fresh);
          c.renderAll();
          if (!isLoadingRef.current) {
            saveState();
            onModified?.();
          }
          refreshOpeningHandles();
          emitSelection();
        });

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

        // ── RA-6969 [A5b] — transient alignment-guide overlay ──────────────────
        // Guide lines drawn while dragging/drawing when the cursor lines up with
        // an existing endpoint's axis. Non-selectable/non-evented and tagged
        // `data.type: "guide"` so they are excluded from measured geometry,
        // decomposition, export and the footprint pass. Removed on
        // mouse:up/dblclick (never persisted).
        let liveGuides: unknown[] = [];
        const removeLiveGuides = () => {
          if (liveGuides.length) {
            (canvas as unknown as { remove: (...o: unknown[]) => void }).remove(
              ...liveGuides,
            );
            liveGuides = [];
          }
        };
        const drawAlignmentGuides = (cur: Point) => {
          removeLiveGuides();
          if (!snapEnabledRef.current) return;
          const eps = collectEndpoints();
          const guides = alignmentGuidesFor(cur, eps, ENDPOINT_SNAP_PX);
          if (!guides.length) return;
          const c = canvas as unknown as {
            add: (...o: unknown[]) => void;
            renderAll: () => void;
          };
          // Span each guide from the aligned endpoint(s) to the cursor so the
          // line visibly connects the shared corner — only endpoints on the
          // guide's own axis coordinate, not the bbox of every endpoint on the
          // canvas (which would stretch guides across unrelated geometry).
          // `g.coord` is copied verbatim from a collected endpoint by
          // alignmentGuidesFor(), so exact equality is a safe membership test.
          for (const g of guides) {
            const matching = eps.filter((e) =>
              g.type === "v" ? e.x === g.coord : e.y === g.coord,
            );
            const coords: [number, number, number, number] =
              g.type === "v"
                ? [
                    g.coord,
                    Math.min(cur.y, ...matching.map((e) => e.y)),
                    g.coord,
                    Math.max(cur.y, ...matching.map((e) => e.y)),
                  ]
                : [
                    Math.min(cur.x, ...matching.map((e) => e.x)),
                    g.coord,
                    Math.max(cur.x, ...matching.map((e) => e.x)),
                    g.coord,
                  ];
            // Green snap indicators (magicplan assemble pattern) when aligning
            // to an existing measured endpoint axis.
            const line = new F.Line(coords, {
              stroke: "#22c55e",
              strokeWidth: 1.5,
              strokeDashArray: [4, 4],
              selectable: false,
              evented: false,
            });
            (line as { data?: unknown }).data = { type: "guide" };
            liveGuides.push(line);
            c.add(line);
          }
          c.renderAll();
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
            evented: !readonly,
            hoverCursor: "text",
            padding: 6,
            objectCaching: false,
          });
          (t as { data?: unknown }).data = { type: "dim-label" };
          return t;
        };

        const makeShortDimCta = (
          text: string,
          x: number,
          y: number,
          meta: Record<string, unknown>,
        ): unknown => {
          const t = new F.Text(text, {
            left: x,
            top: y,
            fontSize: 9,
            fill: "#1C2E47",
            backgroundColor: "rgba(212,165,116,0.92)",
            originX: "center",
            originY: "center",
            selectable: false,
            evented: !readonly,
            hoverCursor: "pointer",
            padding: 3,
            objectCaching: false,
          });
          (t as { data?: unknown }).data = {
            type: SHORT_DIM_CTA_TYPE,
            ...meta,
          };
          return t;
        };

        /**
         * Add per-edge dimension strings for a completed room polygon.
         * Each edge gets one Text label placed perpendicular to the midpoint,
         * outside the room. Labels are non-selectable/non-measured decoration.
         * Short edges (&lt; 0.45 m) get a Measure CTA instead.
         */
        const addRoomEdgeDimLabels = (
          points: Point[],
          roomId: string,
        ) => {
          const c = canvas as unknown as {
            add: (...o: unknown[]) => void;
            bringObjectToFront?: (o: unknown) => void;
          };
          const scale = pxPerMetreRef.current;
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            const px = Math.hypot(b.x - a.x, b.y - a.y);
            if (shouldShowEdgeDimension(px, scale)) {
              const text = formatDimension(px, scale);
              const { labelPos } = segmentLabelPosition(a, b, 18);
              const lbl = makeDimText(text, labelPos.x, labelPos.y);
              (lbl as { data?: unknown }).data = {
                type: "dim-label",
                dimFor: roomId,
                edgeIndex: i,
                metres: px / scale,
              };
              c.add(lbl);
              c.bringObjectToFront?.(lbl);
            }
          }
          for (const cta of shortEdgeMeasureAffordances(points, scale)) {
            const lbl = makeShortDimCta(
              cta.label,
              cta.labelPos.x,
              cta.labelPos.y,
              {
                roomId,
                edgeIndex: cta.edgeIndex,
                ax: cta.a.x,
                ay: cta.a.y,
                bx: cta.b.x,
                by: cta.b.y,
                metres: cta.metres,
              },
            );
            c.add(lbl);
            c.bringObjectToFront?.(lbl);
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

          // Collect all measured geometry points (ignore text/label decorations),
          // transform-corrected to absolute scene coords (RA-6990 — pinned by
          // lib/sketch/__tests__/fabric-absolute.test.ts)
          const allPoints = footprintAbsolutePoints(c.getObjects());
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

        /** Discreet on-canvas north arrow + scale bar (editor chrome; PDF has its own). */
        const refreshPlanChrome = () => {
          if (readonly) return;
          const c = canvas as unknown as {
            getObjects: () => unknown[];
            remove: (...o: unknown[]) => void;
            add: (...o: unknown[]) => void;
            getWidth?: () => number;
            getHeight?: () => number;
            renderAll: () => void;
          };
          const stale = c
            .getObjects()
            .filter(
              (o) =>
                (o as { data?: { type?: string } }).data?.type ===
                PLAN_CHROME_TYPE,
            );
          if (stale.length) c.remove(...stale);

          const pts = footprintAbsolutePoints(c.getObjects());
          let sceneLeft = 24;
          let sceneTop = 24;
          let sceneWidth = (c.getWidth?.() ?? width) - 48;
          let sceneHeight = (c.getHeight?.() ?? height) - 48;
          if (pts.length >= 2) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of pts) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            const pad = 56;
            sceneLeft = minX - pad;
            sceneTop = minY - pad;
            sceneWidth = Math.max(120, maxX - minX + pad * 2);
            sceneHeight = Math.max(120, maxY - minY + pad * 2);
          }
          const layout = layoutCanvasPlanChrome({
            sceneLeft,
            sceneTop,
            sceneWidth,
            sceneHeight,
            pxPerMetre: pxPerMetreRef.current,
          });
          const n = layout.north;
          const arrow = new F.Polygon(
            [
              { x: n.tip.x, y: n.tip.y },
              { x: n.baseLeft.x, y: n.baseLeft.y },
              { x: n.baseRight.x, y: n.baseRight.y },
            ],
            {
              fill: "#1C2E47",
              stroke: "#1C2E47",
              strokeWidth: 1,
              selectable: false,
              evented: false,
              opacity: 0.85,
            },
          );
          const stem = new F.Line(
            [n.tip.x, n.tip.y, n.stemEnd.x, n.stemEnd.y],
            {
              stroke: "#1C2E47",
              strokeWidth: 2,
              selectable: false,
              evented: false,
              opacity: 0.85,
            },
          );
          const nLabel = new F.Text("N", {
            left: n.label.x,
            top: n.label.y,
            fontSize: 11,
            fontWeight: "bold",
            fill: "#1C2E47",
            originX: "center",
            originY: "bottom",
            selectable: false,
            evented: false,
            opacity: 0.9,
          });
          for (const part of [arrow, stem, nLabel]) {
            (part as { data?: unknown }).data = { type: PLAN_CHROME_TYPE };
            c.add(part);
          }
          if (layout.scale) {
            const s = layout.scale;
            const bar = new F.Line(
              [s.x, s.y, s.x + s.barLengthPx, s.y],
              {
                stroke: "#1C2E47",
                strokeWidth: 2,
                selectable: false,
                evented: false,
                opacity: 0.85,
              },
            );
            (bar as { data?: unknown }).data = { type: PLAN_CHROME_TYPE };
            c.add(bar);
            for (const t of s.ticks) {
              const tx = s.x + t * s.barLengthPx;
              const tick = new F.Line([tx, s.y - 4, tx, s.y + 4], {
                stroke: "#1C2E47",
                strokeWidth: 1.5,
                selectable: false,
                evented: false,
                opacity: 0.85,
              });
              (tick as { data?: unknown }).data = { type: PLAN_CHROME_TYPE };
              c.add(tick);
            }
            const sLabel = new F.Text(s.label, {
              left: s.x + s.barLengthPx / 2,
              top: s.y + 8,
              fontSize: 10,
              fill: "#1C2E47",
              originX: "center",
              originY: "top",
              selectable: false,
              evented: false,
              opacity: 0.9,
            });
            (sLabel as { data?: unknown }).data = { type: PLAN_CHROME_TYPE };
            c.add(sLabel);
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
            ensureWallId(obj);
            c.add(obj);
            const wallId = (obj as { data?: { wallId?: string } }).data?.wallId;
            const lp = d.props as { x1: number; y1: number; x2: number; y2: number };
            const a = { x: lp.x1, y: lp.y1 };
            const b = { x: lp.x2, y: lp.y2 };
            const px = Math.hypot(b.x - a.x, b.y - a.y);
            if (shouldShowEdgeDimension(px, pxPerMetreRef.current) && wallId) {
              const text = formatDimension(px, pxPerMetreRef.current);
              const { labelPos } = segmentLabelPosition(a, b, 18);
              const dimLbl = makeDimText(text, labelPos.x, labelPos.y);
              (dimLbl as { data?: unknown }).data = {
                type: "dim-label",
                dimFor: wallId,
                metres: px / pxPerMetreRef.current,
              };
              c.add(dimLbl);
            }
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
          if (d.data.type === "opening") {
            refreshWallBands();
          }
        };

        canvas.on("mouse:down", (opt: unknown) => {
          const e = (opt as { e: MouseEvent }).e;
          const tool = toolModeRef.current;
          if (readonly || e.altKey) return;

          // P1/P2: tap an edge dim label → inline numeric edit (manual hit-test
          // so room polygons don't steal the click from non-selectable dims).
          const p0 = scenePoint(e);
          const dimCandidates: DimLabelHitCandidate[] = (
            canvas as unknown as { getObjects: () => unknown[] }
          )
            .getObjects()
            .map((o) => {
              const obj = o as {
                left?: number;
                top?: number;
                text?: string;
                data?: DimLabelHitCandidate["data"];
              };
              return {
                left: obj.left ?? 0,
                top: obj.top ?? 0,
                text: obj.text,
                data: obj.data,
              };
            });
          const hitDim = findNearestDimLabel(p0, dimCandidates, 28);
          const dimTarget = hitDim
            ? {
                data: hitDim.data,
                left: hitDim.left,
                top: hitDim.top,
                text: hitDim.text,
              }
            : (opt as { target?: { data?: Record<string, unknown>; left?: number; top?: number; text?: string } })
                ?.target;

          // Short-dim Measure CTA — place a measurement line along the stub edge.
          const ctaTarget = (opt as { target?: { data?: Record<string, unknown> } })
            ?.target;
          const ctaData =
            ctaTarget?.data?.type === SHORT_DIM_CTA_TYPE
              ? ctaTarget.data
              : (
                  canvas as unknown as { getObjects: () => unknown[] }
                )
                  .getObjects()
                  .map((o) => (o as { left?: number; top?: number; data?: Record<string, unknown> }))
                  .find(
                    (c) =>
                      c.data?.type === SHORT_DIM_CTA_TYPE &&
                      Math.hypot((c.left ?? 0) - p0.x, (c.top ?? 0) - p0.y) <=
                        18,
                  )?.data;
          if (tool === "select" && ctaData && typeof ctaData.ax === "number") {
            addToolObject(
              describeToolObject({
                tool: "measure",
                points: [
                  { x: ctaData.ax as number, y: ctaData.ay as number },
                  { x: ctaData.bx as number, y: ctaData.by as number },
                ],
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
            return;
          }

          if (
            tool === "select" &&
            dimTarget?.data?.type === "dim-label" &&
            typeof dimTarget.data.dimFor === "string"
          ) {
            const dimFor = dimTarget.data.dimFor as string;
            const edgeIndex =
              typeof dimTarget.data.edgeIndex === "number"
                ? (dimTarget.data.edgeIndex as number)
                : null;
            // Honour dimLocked from the selection panel (typed size sticks).
            const lockedHost = (
              canvas as unknown as { getObjects: () => unknown[] }
            )
              .getObjects()
              .find((o) => {
                const d = (o as { data?: Record<string, unknown> }).data;
                return (
                  !!d &&
                  (d.id === dimFor || d.wallId === dimFor) &&
                  d.dimLocked === true
                );
              });
            if (lockedHost) return;
            const seed =
              typeof dimTarget.data.metres === "number"
                ? String(dimTarget.data.metres)
                : String(dimTarget.text ?? "").replace(/\s*m$/, "");
            const editor = new F.IText(seed, {
              left: dimTarget.left ?? 0,
              top: dimTarget.top ?? 0,
              fontSize: 12,
              fill: "#1C2E47",
              backgroundColor: "#ffffff",
              originX: "center",
              originY: "center",
            });
            (editor as { data?: Record<string, unknown> }).data = {
              type: "dim-label",
              editing: true,
            };
            const c = canvas as unknown as {
              add: (o: unknown) => void;
              // Variadic: `c.remove(...stale)` below spreads an array into
              // this, and Fabric's own `remove` accepts varargs. Declaring it
              // unary is what made that spread a TS2556.
              remove: (...o: unknown[]) => void;
              setActiveObject: (o: unknown) => void;
              renderAll: () => void;
              getObjects: () => unknown[];
            };
            c.add(editor);
            c.setActiveObject(editor);
            (editor as { enterEditing?: () => void }).enterEditing?.();
            const commit = () => {
              const raw =
                (editor as { text?: string }).text ?? seed;
              const metres = parseMetresInput(raw);
              c.remove(editor);
              if (metres == null || metres <= 0) {
                c.renderAll();
                return;
              }
              const room = c.getObjects().find((o) => {
                const d = (o as { data?: Record<string, unknown> }).data;
                return d?.type === "room" && d.id === dimFor;
              });
              if (room) {
                const pts = polygonAbsolutePoints(room);
                const dims = pts
                  ? roomLengthWidthM(pts, pxPerMetreRef.current)
                  : null;
                if (pts && dims && edgeIndex != null) {
                  const horizontal = edgeIndex % 2 === 0;
                  const next = resizeRectRoomFromDims(
                    pts,
                    horizontal ? metres : dims.lengthM,
                    horizontal ? dims.widthM : metres,
                    pxPerMetreRef.current,
                  );
                  if (next) {
                    (room as { set?: (p: object) => void; setCoords?: () => void }).set?.(
                      { points: next },
                    );
                    (room as { setCoords?: () => void }).setCoords?.();
                    (room as { data?: Record<string, unknown> }).data = {
                      ...(room as { data?: Record<string, unknown> }).data,
                      lengthM: horizontal ? metres : dims.lengthM,
                      widthM: horizontal ? dims.widthM : metres,
                    };
                    // Refresh room edge dims
                    const stale = c
                      .getObjects()
                      .filter((o) => {
                        const d = (o as { data?: { type?: string; dimFor?: string; roomId?: string } })
                          .data;
                        if (!d) return false;
                        if (d.type === "dim-label" && d.dimFor === dimFor) return true;
                        if (d.type === SHORT_DIM_CTA_TYPE && d.roomId === dimFor)
                          return true;
                        return false;
                      });
                    if (stale.length) c.remove(...stale);
                    addRoomEdgeDimLabels(next, dimFor);
                    syncRoomLabel(room);
                    reanchorOpeningsForRoom(room);
                    refreshWallBands();
                    if (!isLoadingRef.current) {
                      saveState();
                      onModified?.();
                    }
                  }
                }
              } else {
                // Standalone wall dim: scale length from midpoint.
                const wall = c.getObjects().find((o) => {
                  const d = (o as { data?: Record<string, unknown> }).data;
                  return d?.type === "wall" && d.wallId === dimFor;
                });
                if (wall) {
                  const seg = wallAbsoluteSegment(wall);
                  if (seg) {
                    const cur = Math.hypot(
                      seg.b.x - seg.a.x,
                      seg.b.y - seg.a.y,
                    );
                    const targetPx = metres * pxPerMetreRef.current;
                    if (cur > 1e-6) {
                      const scale = targetPx / cur;
                      const mx = (seg.a.x + seg.b.x) / 2;
                      const my = (seg.a.y + seg.b.y) / 2;
                      const a = {
                        x: mx + (seg.a.x - mx) * scale,
                        y: my + (seg.a.y - my) * scale,
                      };
                      const b = {
                        x: mx + (seg.b.x - mx) * scale,
                        y: my + (seg.b.y - my) * scale,
                      };
                      (wall as { set?: (p: object) => void; setCoords?: () => void }).set?.(
                        { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
                      );
                      (wall as { setCoords?: () => void }).setCoords?.();
                      (wall as { data?: Record<string, unknown> }).data = {
                        ...(wall as { data?: Record<string, unknown> }).data,
                        lengthM: metres,
                      };
                      reanchorOpeningsForWall(wall);
                      refreshWallBands();
                      if (!isLoadingRef.current) {
                        saveState();
                        onModified?.();
                      }
                    }
                  }
                }
              }
              c.renderAll();
              emitSelection();
            };
            (editor as { on?: (ev: string, fn: () => void) => void }).on?.(
              "editing:exited",
              commit,
            );
            return;
          }

          // Overlay tools own their clicks (evidence + moisture layers).
          if (
            tool === "select" ||
            tool === "freehand" ||
            tool === "damage" ||
            tool === "pan" ||
            tool === "photo" ||
            tool === "moisture"
          )
            return;
          const p = scenePoint(e);
          if (tool === "equipment") {
            const rooms: { id: string; points: Point[] }[] = [];
            for (const o of (
              canvas as unknown as { getObjects: () => unknown[] }
            ).getObjects()) {
              const d = (o as { data?: Record<string, unknown> }).data;
              if (!d || d.type !== "room" || typeof d.id !== "string") continue;
              const pts = polygonAbsolutePoints(o);
              if (pts && pts.length >= 3) rooms.push({ id: d.id, points: pts });
            }
            const snapped = snapEquipmentPlacement(
              p,
              rooms,
              pxPerMetreRef.current,
            );
            const desc = describeEquipmentSymbol({
              x: snapped.x,
              y: snapped.y,
              equipmentKind: equipmentKindRef.current,
              pxPerMetre: pxPerMetreRef.current,
            });
            const obj = materializeEquipment(desc);
            (
              canvas as unknown as { add: (o: unknown) => void; renderAll: () => void }
            ).add(obj);
            canvas.renderAll();
            if (!isLoadingRef.current) {
              saveState();
              onModified?.();
            }
            return;
          }
          if (tool === "room") {
            // Shift+click = legacy polygon vertices (dblclick to close).
            // Otherwise start tap/drag for room-first rect placement.
            if (e.shiftKey) {
              polygonPtsRef.current.push(snapVertex(p));
              return;
            }
            drawStartRef.current = snapVertex(p);
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
          if (tool === "door" || tool === "window" || tool === "missing") {
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
            const hostWallId = hostWall?.wallId;
            if (!hostWallId) {
              console.warn(
                "SketchCanvas: opening placed without a host wall — draw a room first",
              );
            }
            let hostThicknessPx = wallThicknessPx(
              undefined,
              pxPerMetreRef.current,
            );
            if (hostWallId) {
              for (const o of (
                canvas as unknown as { getObjects: () => unknown[] }
              ).getObjects()) {
                const d = (o as { data?: Record<string, unknown> }).data;
                if (!d) continue;
                if (d.type === "wall" && d.wallId === hostWallId) {
                  hostThicknessPx = wallThicknessPx(
                    readWallThicknessM(d),
                    pxPerMetreRef.current,
                  );
                  break;
                }
                if (d.type === "room" && typeof d.id === "string") {
                  const edges = roomEdgeHostSegments(
                    d.id,
                    polygonAbsolutePoints(o) ?? [],
                  );
                  if (edges.some((edge) => edge.wallId === hostWallId)) {
                    hostThicknessPx = wallThicknessPx(
                      readWallThicknessM(d),
                      pxPerMetreRef.current,
                    );
                    break;
                  }
                }
              }
            }
            addToolObject(
              describeToolObject({
                tool,
                points: [anchor],
                pxPerMetre: pxPerMetreRef.current,
                wallSegment: wallSeg,
                wallThicknessPx: hostThicknessPx,
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
          // RA-6969 [A5b]: clear transient alignment guides on release.
          removeLiveGuides();
          if (!start) return;
          drawStartRef.current = null;
          const end = snapEnd(start, scenePoint((opt as { e: MouseEvent }).e));
          if (tool === "room") {
            const dragPx = Math.hypot(end.x - start.x, end.y - start.y);
            let points =
              dragPx < ROOM_TAP_THRESHOLD_PX
                ? roomTemplatePoints(
                    roomTemplateKindRef.current,
                    start,
                    DEFAULT_ROOM_SIDE_M,
                    DEFAULT_ROOM_SIDE_M,
                    pxPerMetreRef.current,
                  )
                : roomTemplateKindRef.current === "rect"
                  ? rectRoomPointsFromDiagonal(start, end)
                  : roomTemplatePoints(
                      roomTemplateKindRef.current,
                      {
                        x: (start.x + end.x) / 2,
                        y: (start.y + end.y) / 2,
                      },
                      Math.max(
                        0.5,
                        Math.abs(end.x - start.x) / pxPerMetreRef.current,
                      ),
                      Math.max(
                        0.5,
                        Math.abs(end.y - start.y) / pxPerMetreRef.current,
                      ),
                      pxPerMetreRef.current,
                    );
            if (roomTemplateFlipHRef.current) {
              points = flipRoomPoints(points, "h");
            }
            if (roomTemplateFlipVRef.current) {
              points = flipRoomPoints(points, "v");
            }
            if (roomTemplateRotateRef.current) {
              points = rotateRoomPoints90(
                points,
                roomTemplateRotateRef.current,
              );
            }
            addToolObject(
              describeToolObject({
                tool: "room",
                points,
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
            return;
          }
          if (tool === "line" || tool === "measure" || tool === "arrow") {
            addToolObject(
              describeToolObject({
                tool,
                points: [start, end],
                pxPerMetre: pxPerMetreRef.current,
              }),
            );
          }
        });

        // P1: room adjacency snap + green join cue while dragging a room.
        canvas.on("object:moving", (opt: unknown) => {
          const target = (opt as { target?: unknown })?.target;
          const td = (target as { data?: Record<string, unknown> } | undefined)
            ?.data;
          if (!td || td.type !== "room" || typeof td.id !== "string") {
            clearAdjacencyJoin();
            return;
          }
          const movingPts = polygonAbsolutePoints(target);
          if (!movingPts || movingPts.length < 2) return;
          const movingEdges: RoomEdgeRef[] = roomEdgeHostSegments(
            td.id,
            movingPts,
          ).map((e) => ({
            roomId: td.id as string,
            edgeIndex: e.edgeIndex,
            a: e.seg.a,
            b: e.seg.b,
          }));
          const stationaryEdges: RoomEdgeRef[] = [];
          for (const o of (
            canvas as unknown as { getObjects: () => unknown[] }
          ).getObjects()) {
            const d = (o as { data?: Record<string, unknown> }).data;
            if (
              !d ||
              d.type !== "room" ||
              d.id === td.id ||
              typeof d.id !== "string"
            )
              continue;
            const pts = polygonAbsolutePoints(o);
            if (!pts) continue;
            for (const e of roomEdgeHostSegments(d.id, pts)) {
              stationaryEdges.push({
                roomId: d.id,
                edgeIndex: e.edgeIndex,
                a: e.seg.a,
                b: e.seg.b,
              });
            }
          }
          const snap = findRoomAdjacencySnap(
            movingEdges,
            stationaryEdges,
            ADJACENCY_SNAP_PX,
          );
          if (!snap.snapped || !snap.join) {
            clearAdjacencyJoin();
            return;
          }
          const t = target as {
            left?: number;
            top?: number;
            set?: (p: object) => void;
            setCoords?: () => void;
          };
          t.set?.({
            left: (t.left ?? 0) + snap.dx,
            top: (t.top ?? 0) + snap.dy,
          });
          t.setCoords?.();
          showAdjacencyJoin(snap.join);
        });

        canvas.on("mouse:dblclick", () => {
          // RA-6842 [A3]: remove the live dim label when room drawing closes.
          removeLiveDimLabel();
          // RA-6969 [A5b]: clear transient alignment guides when room closes.
          removeLiveGuides();
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

          // Drag tools: line / wall / measure / arrow / room-rect
          const dragStart = drawStartRef.current;
          if (
            dragStart &&
            (tool === "line" ||
              tool === "measure" ||
              tool === "arrow" ||
              tool === "room")
          ) {
            removeLiveDimLabel();
            const end = snapEnd(dragStart, cur);
            // RA-6969 [A5b]: show alignment guides against the raw cursor.
            drawAlignmentGuides(cur);
            const px = Math.hypot(end.x - dragStart.x, end.y - dragStart.y);
            if (px > 2) {
              const text =
                tool === "room"
                  ? `${formatDimension(Math.abs(end.x - dragStart.x), pxPerMetreRef.current)} × ${formatDimension(Math.abs(end.y - dragStart.y), pxPerMetreRef.current)}`
                  : formatDimension(px, pxPerMetreRef.current);
              const { labelPos } = segmentLabelPosition(dragStart, end, 18);
              liveDimLabel = makeDimText(text, labelPos.x, labelPos.y);
              c.add(liveDimLabel);
              c.renderAll();
            }
            return;
          }

          // Shift+polygon room: show dim from the last clicked vertex to cursor
          const pts = polygonPtsRef.current;
          if (tool === "room" && pts.length > 0) {
            removeLiveDimLabel();
            drawAlignmentGuides(cur);
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
          if (
            ttype === "dim-label" ||
            ttype === "room-label" ||
            ttype === "guide" ||
            ttype === PLAN_CHROME_TYPE ||
            ttype === SHORT_DIM_CTA_TYPE ||
            ttype === "adjacency-join" ||
            ttype === "wall-band"
          )
            return;
          isRefreshingFootprint = true;
          refreshFootprintDimensions();
          refreshPlanChrome();
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

        // Restore persisted drawing BEFORE onReady/history so refresh shows work.
        const bootstrap = initialDataRef.current;
        if (bootstrap && typeof bootstrap === "object") {
          try {
            isLoadingRef.current = true;
            await canvas.loadFromJSON(bootstrap);
            refreshDamageRoomClips();
            refreshWallBands();
            refreshPlanChrome();
            canvas.renderAll();
          } catch (e) {
            console.error("SketchCanvas: initialData restore failed", e);
          } finally {
            isLoadingRef.current = false;
          }
        }

        // Seed history from the restored (or empty) canvas
        saveState();

        // Notify parent
        onReady?.({
          toJSON: () =>
            (canvas as unknown as { toJSON: (e?: string[]) => object }).toJSON([
              "data",
            ]),
          loadFromJSON: async (data) => {
            isLoadingRef.current = true;
            try {
              await canvas.loadFromJSON(data);
              refreshDamageRoomClips();
              refreshWallBands();
              canvas.renderAll();
            } finally {
              isLoadingRef.current = false;
            }
          },
          // RA-6847 [C1]: strip underlay + crop to content for report fidelity.
          toDataURL: (opts) =>
            exportSketchPng(canvas as unknown as ExportableCanvas, {
              multiplier: EXPORT_REPORT_MULTIPLIER,
              ...opts,
            }),
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
          // The imperative handle has exposed this since :362; the onReady
          // payload never did, so every consumer reaching the canvas through
          // onReady had no way to refresh wall bands. TS2345 was reporting a
          // real gap, not a typing nuisance.
          refreshWallBands: () => refreshWallBandsRef.current(),
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
      // Init once — viewport changes use setDimensions below (avoids wiping strokes).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Keep Fabric surface in sync with the host viewport ───
    useEffect(() => {
      const canvas = fabricRef.current as {
        getWidth?: () => number;
        getHeight?: () => number;
        setDimensions: (d: { width: number; height: number }) => void;
        calcOffset: () => void;
        requestRenderAll?: () => void;
        renderAll: () => void;
      } | null;
      if (!canvas) return;
      const currentW =
        typeof canvas.getWidth === "function" ? canvas.getWidth() : undefined;
      const currentH =
        typeof canvas.getHeight === "function" ? canvas.getHeight() : undefined;
      if (currentW === width && currentH === height) {
        canvas.calcOffset();
        return;
      }
      canvas.setDimensions({ width, height });
      canvas.calcOffset();
      if (typeof canvas.requestRenderAll === "function") {
        canvas.requestRenderAll();
      } else {
        canvas.renderAll();
      }
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
      damageKindRef.current = damageKind;
      equipmentKindRef.current = equipmentKind;
      roomTemplateKindRef.current = roomTemplateKind;
      roomTemplateRotateRef.current = roomTemplateRotateQuarters;
      roomTemplateFlipHRef.current = roomTemplateFlipH;
      roomTemplateFlipVRef.current = roomTemplateFlipV;
      pxPerMetreRef.current = pxPerMetre;
      snapEnabledRef.current = snapEnabled;
      snapGridMetresRef.current = snapGridMetres;
      drawStartRef.current = null;
      polygonPtsRef.current = [];

      const brushMode = toolMode === "freehand" || toolMode === "damage";
      canvas.isDrawingMode = brushMode;
      canvas.selection = toolMode === "select" && !readonly;
      canvas.defaultCursor =
        toolMode === "pan"
          ? "grab"
          : toolMode === "equipment" ||
              toolMode === "door" ||
              toolMode === "window" ||
              toolMode === "missing"
            ? "crosshair"
            : brushMode
              ? "crosshair"
              : "default";

      if (toolMode === "freehand") {
        canvas.freeDrawingBrush.color = "#3b82f680";
        canvas.freeDrawingBrush.width = 20;
      } else if (toolMode === "damage") {
        const styles: Record<string, { stroke: string }> = {
          water: { stroke: "rgba(37, 99, 235, 0.85)" },
          fire: { stroke: "rgba(220, 38, 38, 0.85)" },
          mould: { stroke: "rgba(22, 163, 74, 0.85)" },
          smoke: { stroke: "rgba(75, 85, 99, 0.85)" },
          biohazard: { stroke: "rgba(202, 138, 4, 0.9)" },
          structural: { stroke: "rgba(124, 58, 237, 0.85)" },
          electrical: { stroke: "rgba(234, 179, 8, 0.9)" },
          contents: { stroke: "rgba(14, 165, 233, 0.85)" },
        };
        canvas.freeDrawingBrush.color =
          styles[damageKind]?.stroke ?? styles.water.stroke;
        canvas.freeDrawingBrush.width = 24;
      }
    }, [
      toolMode,
      readonly,
      pxPerMetre,
      snapEnabled,
      snapGridMetres,
      damageKind,
      equipmentKind,
      roomTemplateKind,
      roomTemplateRotateQuarters,
      roomTemplateFlipH,
      roomTemplateFlipV,
    ]);

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
