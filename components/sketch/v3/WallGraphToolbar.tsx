"use client";

/**
 * WallGraphToolbar — minimal floating tool dock for the V3 sketch editor.
 *
 * Mirrors the V2 SketchDockToolbar role but with V3 tools:
 *   select · wall · door · window · label · scale · pan · undo · redo
 *
 * Kept deliberately simple in Phase 1 — V3 ships behind a feature flag for
 * staff use first, and the toolbar UX iterates after we've seen real field
 * sessions on iPad.
 */

import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  DoorClosed,
  Hand,
  MousePointer2,
  Move,
  Ruler,
  RectangleHorizontal,
  Tag,
  Type,
} from "lucide-react";
import type { WallGraphTool } from "./WallGraphCanvas";

export interface WallGraphToolbarProps {
  tool: WallGraphTool;
  onToolChange: (tool: WallGraphTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCalibrate: () => void;
}

const TOOLS: Array<{ id: WallGraphTool; label: string; Icon: typeof Hand }> = [
  { id: "select", label: "Select", Icon: MousePointer2 },
  { id: "wall", label: "Wall", Icon: Move },
  { id: "opening_door", label: "Door", Icon: DoorClosed },
  { id: "opening_window", label: "Window", Icon: RectangleHorizontal },
  { id: "label_room", label: "Label", Icon: Tag },
  { id: "pan", label: "Pan", Icon: Hand },
];

export function WallGraphToolbar({
  tool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCalibrate,
}: WallGraphToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 shadow-sm">
      {TOOLS.map(({ id, label, Icon }) => (
        <Button
          key={id}
          size="sm"
          variant={tool === id ? "default" : "outline"}
          onClick={() => onToolChange(id)}
          aria-label={label}
          aria-pressed={tool === id}
        >
          <Icon className="mr-1 h-4 w-4" />
          {label}
        </Button>
      ))}
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant="outline"
        onClick={onCalibrate}
        aria-label="Calibrate scale"
      >
        <Ruler className="mr-1 h-4 w-4" />
        Scale
      </Button>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant="outline"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default WallGraphToolbar;
