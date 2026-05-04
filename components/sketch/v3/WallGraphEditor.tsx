"use client";

/**
 * WallGraphEditor — V3 sketch editor orchestrator.
 *
 * Sibling of the V2 `SketchEditorV2`. Wired to:
 *   - the pure reducer (`lib/sketch/v3/reducer.ts`)
 *   - the React adapter hook (`hooks/sketch/v3/use-wall-graph.ts`)
 *   - the Konva canvas (`./WallGraphCanvas`)
 *   - the V3 toolbar (`./WallGraphToolbar`)
 *
 * Responsibilities here:
 *   - own current tool state
 *   - translate canvas clicks into reducer actions
 *   - debounce-save graph JSON to /api/inspections/[id]/sketches
 *   - prompt for scale calibration
 *   - surface reducer errors as toasts (non-blocking)
 *
 * V2/V3 routing is owned by `SketchEditorV2` — this file is mounted only when
 * `sketchType === "wall_graph_v3"`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useWallGraph } from "@/hooks/sketch/v3/use-wall-graph";
import { fromJSON, toJSON } from "@/lib/sketch/v3/serialize";
import {
  emptyGraph,
  type WallGraph,
} from "@/lib/sketch/v3/wall-graph-types";
import {
  WallGraphCanvas,
  type HitTarget,
  type WallGraphTool,
} from "./WallGraphCanvas";
import { WallGraphToolbar } from "./WallGraphToolbar";
import { WallGraphImportPanel } from "./WallGraphImportPanel";

export interface WallGraphEditorProps {
  inspectionId: string;
  /** Server-provided initial graph (already parsed) or null for a fresh canvas. */
  initialGraph?: WallGraph | null;
  /** Existing ClaimSketch.id, when editing in-place. */
  sketchId?: string;
  floorNumber?: number;
  floorLabel?: string;
  /** Read-only mode for read-only viewers (e.g. report PDFs). */
  readOnly?: boolean;
  /** Address pre-fill for the "Pull from address" panel. */
  propertyAddress?: string;
  propertyPostcode?: string;
  onSaved?: (sketch: { id: string; updatedAt: string }) => void;
}

const SAVE_DEBOUNCE_MS = 1500;

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function WallGraphEditor({
  inspectionId,
  initialGraph,
  sketchId,
  floorNumber = 0,
  floorLabel = "Ground Floor",
  readOnly = false,
  propertyAddress,
  propertyPostcode,
  onSaved,
}: WallGraphEditorProps) {
  const initial = initialGraph ?? emptyGraph(genId("floor"));
  const wg = useWallGraph(initial);
  const [tool, setTool] = useState<WallGraphTool>("select");
  const [pendingWallStart, setPendingWallStart] = useState<string | null>(null);
  const [pendingScale, setPendingScale] = useState<{
    p1: { x: number; y: number };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJson = useRef<string>(JSON.stringify(toJSON(wg.graph)));

  // Surface dispatch errors as toasts.
  useEffect(() => {
    if (wg.lastError) {
      toast.error(wg.lastError.message);
    }
  }, [wg.lastError]);

  /* ─── Save ─────────────────────────────────────────────────────────── */

  const persist = useCallback(async () => {
    if (readOnly) return;
    const wire = toJSON(wg.graph);
    const json = JSON.stringify(wire);
    if (json === lastSavedJson.current) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/sketches`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-client-updated-at": String(Date.now()),
          },
          body: JSON.stringify({
            floorNumber,
            floorLabel,
            sketchType: "wall_graph_v3",
            sketchData: wire,
          }),
        },
      );
      if (res.status === 409) {
        toast("Server has a newer version of this sketch — reload to merge.", {
          icon: "⚠️",
        });
        return;
      }
      if (!res.ok) {
        toast.error(`Save failed (${res.status})`);
        return;
      }
      lastSavedJson.current = json;
      const body = await res.json();
      onSaved?.({ id: body.id, updatedAt: body.updatedAt });
    } finally {
      setSaving(false);
    }
  }, [floorLabel, floorNumber, inspectionId, onSaved, readOnly, wg.graph]);

  // Debounced auto-save on graph change.
  useEffect(() => {
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persist, readOnly, wg.graph]);

  /* ─── Tool handlers ────────────────────────────────────────────────── */

  function handleCanvasClick(
    point: { x: number; y: number },
    target: HitTarget,
  ) {
    if (readOnly) return;

    if (tool === "wall") {
      // Click 1: place start corner (or pick existing). Click 2: place end + wall.
      const cornerId =
        target.kind === "corner" ? target.cornerId : genId("c");
      if (target.kind !== "corner") {
        wg.dispatch({
          type: "ADD_CORNER",
          cornerId,
          x: point.x,
          y: point.y,
        });
      }
      if (pendingWallStart) {
        if (pendingWallStart !== cornerId) {
          wg.dispatch({
            type: "ADD_WALL",
            wallId: genId("w"),
            from: pendingWallStart,
            to: cornerId,
            isExterior: true,
          });
        }
        setPendingWallStart(null);
      } else {
        setPendingWallStart(cornerId);
      }
      return;
    }

    if (tool === "opening_door" || tool === "opening_window") {
      if (target.kind !== "wall") return;
      const wall = wg.activeFloor.walls.find((w) => w.id === target.wallId);
      if (!wall) return;
      const from = wg.activeFloor.corners.find((c) => c.id === wall.from);
      const to = wg.activeFloor.corners.find((c) => c.id === wall.to);
      if (!from || !to) return;
      // Project click onto the wall to get positionM.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const lenPx = Math.sqrt(dx * dx + dy * dy);
      if (lenPx === 0) return;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - from.x) * dx + (point.y - from.y) * dy) /
            (lenPx * lenPx),
        ),
      );
      const lenM = lenPx / wg.activeFloor.pxPerMetre;
      const widthM =
        tool === "opening_door"
          ? Math.min(0.9, lenM * 0.6)
          : Math.min(1.2, lenM * 0.4);
      const positionM = Math.max(
        0,
        Math.min(lenM - widthM, t * lenM - widthM / 2),
      );
      wg.dispatch({
        type: "ADD_OPENING",
        openingId: genId("o"),
        wallId: wall.id,
        openingType: tool === "opening_door" ? "DOOR" : "WINDOW",
        positionM,
        widthM,
        heightM: tool === "opening_door" ? 2.04 : 1.2,
        sillHeightM: tool === "opening_window" ? 0.9 : undefined,
      });
      return;
    }

    if (tool === "label_room" && target.kind === "room") {
      const next = window.prompt(
        "Room label",
        wg.activeFloor.rooms.find((r) => r.id === target.roomId)?.label ??
          "Room",
      );
      if (next != null && next.length > 0) {
        wg.dispatch({
          type: "LABEL_ROOM",
          roomId: target.roomId,
          label: next,
        });
      }
      return;
    }

    if (tool === "scale") {
      if (!pendingScale) {
        setPendingScale({ p1: point });
        toast("Click the second end of the known measurement");
        return;
      }
      const dx = point.x - pendingScale.p1.x;
      const dy = point.y - pendingScale.p1.y;
      const lenPx = Math.sqrt(dx * dx + dy * dy);
      const metresStr = window.prompt(
        `Distance is ${lenPx.toFixed(0)} px. Enter real-world metres:`,
        "1.0",
      );
      const metres = metresStr ? Number(metresStr) : NaN;
      if (Number.isFinite(metres) && metres > 0) {
        wg.dispatch({
          type: "SET_SCALE",
          pxPerMetre: lenPx / metres,
          method: "manual",
        });
        toast.success(
          `Scale set to ${(lenPx / metres).toFixed(1)} px/m`,
        );
      }
      setPendingScale(null);
      setTool("select");
    }
  }

  function handleCornerDrag(cornerId: string, x: number, y: number) {
    wg.dispatch({ type: "MOVE_CORNER", cornerId, x, y });
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

  // Show the import panel when the graph is empty (no walls drawn yet).
  const isEmptyGraph = wg.activeFloor.walls.length === 0 && !readOnly;

  return (
    <div className="flex flex-col gap-3">
      {isEmptyGraph ? (
        <WallGraphImportPanel
          inspectionId={inspectionId}
          defaultAddress={propertyAddress}
          defaultPostcode={propertyPostcode}
          onImported={(graph) => {
            wg.reset(graph);
            toast.success("Footprint loaded — refine interior walls next");
          }}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <WallGraphToolbar
          tool={tool}
          onToolChange={(t) => {
            setPendingWallStart(null);
            setPendingScale(null);
            setTool(t);
          }}
          onUndo={wg.undo}
          onRedo={wg.redo}
          canUndo={wg.canUndo}
          canRedo={wg.canRedo}
          onCalibrate={() => setTool("scale")}
        />
        <div className="text-xs text-muted-foreground">
          {wg.activeFloor.rooms.length} room
          {wg.activeFloor.rooms.length === 1 ? "" : "s"} ·{" "}
          {wg.activeFloor.walls.length} wall
          {wg.activeFloor.walls.length === 1 ? "" : "s"} ·{" "}
          {wg.graph.scale.pxPerMetre.toFixed(0)} px/m
          {saving ? " · saving…" : ""}
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <WallGraphCanvas
          graph={wg.graph}
          activeFloor={wg.activeFloor}
          tool={tool}
          onCanvasClick={handleCanvasClick}
          onCornerDrag={handleCornerDrag}
        />
      </div>
    </div>
  );
}

/* Helper for callers that hold raw JSON from the server. */
export function parseInitialGraph(raw: unknown): WallGraph | null {
  if (!raw) return null;
  try {
    return fromJSON(raw);
  } catch (err) {
    console.warn("WallGraph parse failed; falling back to fresh canvas", err);
    return null;
  }
}

export default WallGraphEditor;
