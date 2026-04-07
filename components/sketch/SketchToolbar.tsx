"use client";

import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Square,
  Minus,
  Pencil,
  Type,
  ArrowUpRight,
  Ruler,
  Camera,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Download,
} from "lucide-react";
import type { ToolMode } from "./SketchCanvas";

interface SketchToolbarProps {
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onClear?: () => void;
  onExport?: () => void;
  readonly?: boolean;
  className?: string;
}

const TOOLS: {
  mode: ToolMode;
  Icon: React.ElementType;
  label: string;
  shortcut: string;
}[] = [
  { mode: "select", Icon: MousePointer2, label: "Select", shortcut: "V" },
  { mode: "room", Icon: Square, label: "Room", shortcut: "R" },
  { mode: "line", Icon: Minus, label: "Wall/Line", shortcut: "L" },
  { mode: "freehand", Icon: Pencil, label: "Freehand", shortcut: "P" },
  { mode: "text", Icon: Type, label: "Text Label", shortcut: "T" },
  { mode: "arrow", Icon: ArrowUpRight, label: "Arrow", shortcut: "A" },
  { mode: "measure", Icon: Ruler, label: "Measurement", shortcut: "M" },
  { mode: "photo", Icon: Camera, label: "Photo Marker", shortcut: "C" },
  { mode: "pan", Icon: Hand, label: "Pan", shortcut: "H" },
];

export function SketchToolbar({
  toolMode,
  onToolChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onClear,
  onExport,
  readonly = false,
  className,
}: SketchToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-1.5 bg-white dark:bg-slate-800 rounded-xl border border-neutral-200 dark:border-slate-700 shadow-sm w-11",
        className,
      )}
    >
      {/* Drawing tools */}
      {TOOLS.map(({ mode, Icon, label, shortcut }) => (
        <button
          key={mode}
          title={`${label} (${shortcut})`}
          disabled={readonly && mode !== "select" && mode !== "pan"}
          onClick={() => onToolChange(mode)}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-all",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            toolMode === mode
              ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/30"
              : "text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white",
          )}
        >
          <Icon size={16} />
        </button>
      ))}

      {/* Divider */}
      <div className="h-px bg-neutral-200 dark:bg-slate-700 my-0.5" />

      {/* History */}
      <button
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <Undo2 size={15} />
      </button>
      <button
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <Redo2 size={15} />
      </button>

      {/* Divider */}
      <div className="h-px bg-neutral-200 dark:bg-slate-700 my-0.5" />

      {/* Zoom */}
      <button
        title="Zoom in"
        onClick={onZoomIn}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white transition-all"
      >
        <ZoomIn size={15} />
      </button>
      <button
        title="Zoom out"
        onClick={onZoomOut}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white transition-all"
      >
        <ZoomOut size={15} />
      </button>

      {/* Divider */}
      <div className="h-px bg-neutral-200 dark:bg-slate-700 my-0.5" />

      {/* Destructive / export */}
      <button
        title="Export PNG"
        onClick={onExport}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700 hover:text-neutral-800 dark:hover:text-white transition-all"
      >
        <Download size={15} />
      </button>
      {!readonly && (
        <button
          title="Clear canvas"
          onClick={onClear}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 transition-all"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
