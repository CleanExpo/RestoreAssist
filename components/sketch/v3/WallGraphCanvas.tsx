"use client";

/**
 * WallGraphCanvas — Konva canvas for the V3 wall-graph editor.
 *
 * Renders the active floor of a `WallGraph`. Walls are line segments between
 * corners; openings render as breaks in their parent wall; rooms render as
 * filled polygons in a separate layer. Click handlers delegate to the
 * currently-selected tool via the `onCanvasClick` prop.
 *
 * Konva is imported lazily by the parent (WallGraphEditor uses
 * `dynamic(..., { ssr: false })`) — this file is `"use client"` and never
 * runs server-side.
 */

import { useEffect, useRef, useState } from "react";
import { Layer, Line, Stage, Circle, Text, Group, Rect } from "react-konva";
import type Konva from "konva";
import type { Floor, WallGraph } from "@/lib/sketch/v3/wall-graph-types";

export type WallGraphTool =
  | "select"
  | "wall"
  | "opening_door"
  | "opening_window"
  | "label_room"
  | "scale"
  | "pan";

export interface WallGraphCanvasProps {
  graph: WallGraph;
  activeFloor: Floor;
  tool: WallGraphTool;
  width?: number;
  height?: number;
  /** Canvas pixel coordinate → handler. Tools translate this to actions. */
  onCanvasClick?: (point: { x: number; y: number }, target: HitTarget) => void;
  /** Drag of an existing corner; tool reducer decides if it accepts. */
  onCornerDrag?: (cornerId: string, x: number, y: number) => void;
  /** Highlighted ids drawn in the selection overlay layer. */
  selection?: Set<string>;
}

export type HitTarget =
  | { kind: "empty" }
  | { kind: "corner"; cornerId: string }
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "room"; roomId: string };

const CORNER_RADIUS = 6;
const WALL_STROKE = 4;
const SHARED_WALL_STROKE = 3;

export function WallGraphCanvas({
  graph,
  activeFloor,
  tool,
  width = 1200,
  height = 800,
  onCanvasClick,
  onCornerDrag,
  selection,
}: WallGraphCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });

  // Build a corner lookup once per render — typical floor has <200 corners
  // so this is cheap.
  const cornerById = new Map(activeFloor.corners.map((c) => [c.id, c]));

  // Cursor changes by tool. Pan uses grab; wall/opening use crosshair.
  useEffect(() => {
    if (!stageRef.current) return;
    const cursor =
      tool === "pan"
        ? "grab"
        : tool === "wall" || tool === "opening_door" || tool === "opening_window"
          ? "crosshair"
          : "default";
    stageRef.current.container().style.cursor = cursor;
  }, [tool]);

  function handleStageClick(
    e:
      | Konva.KonvaEventObject<MouseEvent>
      | Konva.KonvaEventObject<TouchEvent>,
  ) {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    // Convert from screen to world coords (account for pan + zoom).
    const transform = stage.getAbsoluteTransform().copy().invert();
    const world = transform.point(pos);

    const targetName = e.target.name();
    const targetId = e.target.id();
    let target: HitTarget = { kind: "empty" };
    if (targetName === "corner") target = { kind: "corner", cornerId: targetId };
    else if (targetName === "wall") target = { kind: "wall", wallId: targetId };
    else if (targetName === "opening")
      target = { kind: "opening", openingId: targetId };
    else if (targetName === "room") target = { kind: "room", roomId: targetId };

    onCanvasClick?.({ x: world.x, y: world.y }, target);
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    if (!stageRef.current) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = viewport.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const factor = 1.1;
    const newScale = Math.max(
      0.2,
      Math.min(8, direction > 0 ? oldScale * factor : oldScale / factor),
    );
    setViewport({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  return (
    <Stage
      ref={(node) => {
        stageRef.current = node;
      }}
      width={width}
      height={height}
      x={viewport.x}
      y={viewport.y}
      scaleX={viewport.scale}
      scaleY={viewport.scale}
      draggable={tool === "pan"}
      onClick={handleStageClick}
      onTap={handleStageClick}
      onDragEnd={(e) => {
        // Stage drags update the viewport when in pan mode.
        if (tool === "pan") {
          setViewport((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }
      }}
      onWheel={handleWheel}
    >
      {/* Background grid */}
      <Layer listening={false}>
        <GridLayer width={width} height={height} pxPerMetre={activeFloor.pxPerMetre} />
      </Layer>

      {/* Filled rooms */}
      <Layer listening={true}>
        {activeFloor.rooms.map((room) => {
          const points: number[] = [];
          for (const cid of room.cornerCycle) {
            const c = cornerById.get(cid);
            if (!c) continue;
            points.push(c.x, c.y);
          }
          const isSelected = selection?.has(room.id) ?? false;
          return (
            <Group key={room.id}>
              <Line
                name="room"
                id={room.id}
                points={points}
                closed
                fill={
                  isSelected
                    ? "rgba(212, 165, 116, 0.35)"
                    : "rgba(212, 165, 116, 0.15)"
                }
                stroke="transparent"
              />
              <Text
                x={room.centroid.x - 60}
                y={room.centroid.y - 12}
                width={120}
                align="center"
                text={`${room.label}\n${room.areaM2.toFixed(1)} m²`}
                fontSize={13}
                fill="#1C2E47"
                listening={false}
              />
            </Group>
          );
        })}
      </Layer>

      {/* Walls + openings */}
      <Layer listening={true}>
        {activeFloor.walls.map((wall) => {
          const from = cornerById.get(wall.from);
          const to = cornerById.get(wall.to);
          if (!from || !to) return null;
          const stroke = wall.isExterior ? "#1C2E47" : "#8A6B4E";
          const isSelected = selection?.has(wall.id) ?? false;
          return (
            <Line
              key={wall.id}
              name="wall"
              id={wall.id}
              points={[from.x, from.y, to.x, to.y]}
              stroke={isSelected ? "#D4A574" : stroke}
              strokeWidth={
                wall.isExterior ? WALL_STROKE : SHARED_WALL_STROKE
              }
              hitStrokeWidth={14}
              lineCap="round"
            />
          );
        })}
        {activeFloor.openings.map((opening) => {
          const wall = activeFloor.walls.find((w) => w.id === opening.wallId);
          if (!wall) return null;
          const from = cornerById.get(wall.from);
          const to = cornerById.get(wall.to);
          if (!from || !to) return null;
          const wallLengthPx = Math.sqrt(
            (to.x - from.x) ** 2 + (to.y - from.y) ** 2,
          );
          if (wallLengthPx === 0) return null;
          const ux = (to.x - from.x) / wallLengthPx;
          const uy = (to.y - from.y) / wallLengthPx;
          const startPx = opening.positionM * activeFloor.pxPerMetre;
          const widthPx = opening.widthM * activeFloor.pxPerMetre;
          const x1 = from.x + ux * startPx;
          const y1 = from.y + uy * startPx;
          const x2 = from.x + ux * (startPx + widthPx);
          const y2 = from.y + uy * (startPx + widthPx);
          const fill =
            opening.type === "DOOR"
              ? "#FFFFFF"
              : opening.type === "WINDOW"
                ? "#E2EAF5"
                : "#F4ECDF";
          return (
            <Group key={opening.id}>
              {/* White-out the wall under the opening */}
              <Line
                name="opening"
                id={opening.id}
                points={[x1, y1, x2, y2]}
                stroke={fill}
                strokeWidth={WALL_STROKE + 2}
                hitStrokeWidth={14}
                lineCap="butt"
              />
              {/* Opening boundary marks */}
              <Circle x={x1} y={y1} radius={3} fill="#1C2E47" listening={false} />
              <Circle x={x2} y={y2} radius={3} fill="#1C2E47" listening={false} />
            </Group>
          );
        })}
      </Layer>

      {/* Corners */}
      <Layer listening={true}>
        {activeFloor.corners.map((corner) => {
          const isSelected = selection?.has(corner.id) ?? false;
          return (
            <Circle
              key={corner.id}
              name="corner"
              id={corner.id}
              x={corner.x}
              y={corner.y}
              radius={CORNER_RADIUS}
              fill={isSelected ? "#D4A574" : "#1C2E47"}
              stroke="#FFFFFF"
              strokeWidth={2}
              draggable={tool === "select"}
              onDragMove={(e) => {
                onCornerDrag?.(corner.id, e.target.x(), e.target.y());
              }}
            />
          );
        })}
      </Layer>
    </Stage>
  );
}

function GridLayer({
  width,
  height,
  pxPerMetre,
}: {
  width: number;
  height: number;
  pxPerMetre: number;
}) {
  const lines: JSX.Element[] = [];
  // 1m gridlines, drawn over a generous viewport so pan reveals more grid.
  const extent = 4;
  for (let i = -extent; i < extent * 2; i++) {
    const isMajor = i % 5 === 0;
    const stroke = isMajor ? "#D8D8D8" : "#EEEEEE";
    lines.push(
      <Line
        key={`v${i}`}
        points={[i * pxPerMetre, -height * extent, i * pxPerMetre, height * (extent + 1)]}
        stroke={stroke}
        strokeWidth={isMajor ? 1 : 0.5}
      />,
    );
    lines.push(
      <Line
        key={`h${i}`}
        points={[-width * extent, i * pxPerMetre, width * (extent + 1), i * pxPerMetre]}
        stroke={stroke}
        strokeWidth={isMajor ? 1 : 0.5}
      />,
    );
  }
  // Page boundary marker
  lines.push(
    <Rect
      key="page"
      x={0}
      y={0}
      width={width}
      height={height}
      stroke="transparent"
      fill="transparent"
    />,
  );
  return <>{lines}</>;
}

export default WallGraphCanvas;
