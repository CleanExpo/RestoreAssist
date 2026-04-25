"use client";

/**
 * SketchDockToolbar — RA2-V2
 *
 * Touch-first floating toolbar for the sketch editor.
 * - Defaults to bottom-centre dock.
 * - Draggable to any edge (top, left, right, bottom).
 * - 56px touch targets for all tools.
 * - Persists dock position in localStorage.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Square,
  Minus,
  Pencil,
  Type,
  ArrowUpRight,
  Ruler,
  Droplets,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Maximize2,
  GripHorizontal,
  Layers,
} from "lucide-react";
import type { ToolMode } from "./SketchCanvas";

export type DockPosition = "bottom" | "top" | "left" | "right";

export interface SketchDockToolbarProps {
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onClear?: () => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
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
  { mode: "line", Icon: Minus, label: "Wall", shortcut: "L" },
  { mode: "freehand", Icon: Pencil, label: "Freehand", shortcut: "P" },
  { mode: "text", Icon: Type, label: "Label", shortcut: "T" },
  { mode: "arrow", Icon: ArrowUpRight, label: "Arrow", shortcut: "A" },
  { mode: "measure", Icon: Ruler, label: "Measure", shortcut: "M" },
  { mode: "photo", Icon: Droplets, label: "Moisture Pin", shortcut: "D" },
  { mode: "pan", Icon: Hand, label: "Pan", shortcut: "H" },
];

const STORAGE_KEY = "sketch-dock-position";

function readDockPos(): DockPosition {
  if (typeof window === "undefined") return "bottom";
  return (localStorage.getItem(STORAGE_KEY) as DockPosition) ?? "bottom";
}

export function SketchDockToolbar({
  toolMode,
  onToolChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onClear,
  showHeatmap = false,
  onToggleHeatmap,
  readonly = false,
  className,
}: SketchDockToolbarProps) {
  const [dock, setDock] = useState<DockPosition>("bottom");
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setDock(readDockPos());
  }, []);

  const saveDock = useCallback((pos: DockPosition) => {
    setDock(pos);
    localStorage.setItem(STORAGE_KEY, pos);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target !== document.body && e.target !== document.documentElement)
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tool = TOOLS.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool && !readonly) {
        onToolChange(tool.mode);
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.shiftKey ? onRedo?.() : onUndo?.();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onToolChange, onUndo, onRedo, readonly]);

  // ── Drag to reposition ────────────────────────────────────
  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const container = barRef.current?.parentElement;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();

      // Determine new dock position from pointer quadrant
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let newDock: DockPosition = dock;

      if (absDx > 30 || absDy > 30) {
        if (absDy > absDx) {
          newDock = dy < 0 ? "top" : "bottom";
        } else {
          newDock = dx < 0 ? "left" : "right";
        }
      }
      if (newDock !== dock) saveDock(newDock);
    },
    [dock, saveDock],
  );

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // ── Dock position styles ──────────────────────────────────
  const isVertical = dock === "left" || dock === "right";

  const containerCls = cn(
    "absolute z-30 flex items-center gap-1 p-1.5",
    "bg-[#1C2E47]/90 backdrop-blur-sm",
    "border border-white/10 shadow-2xl shadow-black/40",
    "select-none",
    isVertical ? "flex-col rounded-2xl" : "flex-row rounded-2xl",
    dock === "bottom" && "bottom-4 left-1/2 -translate-x-1/2",
    dock === "top" && "top-4 left-1/2 -translate-x-1/2",
    dock === "left" && "left-4 top-1/2 -translate-y-1/2",
    dock === "right" && "right-4 top-1/2 -translate-y-1/2",
    isDragging && "opacity-70",
    className,
  );

  const dividerCls = isVertical
    ? "w-full h-px bg-white/10 my-0.5"
    : "h-full w-px bg-white/10 mx-0.5";

  return (
    <div ref={barRef} className={containerCls}>
      {/* Drag handle */}
      <button
        type="button"
        className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing p-1 touch-none"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        aria-label="Drag toolbar"
      >
        <GripHorizontal size={14} className={isVertical ? "rotate-90" : ""} />
      </button>

      <div className={dividerCls} />

      {/* Tool buttons */}
      {!readonly &&
        TOOLS.map(({ mode, Icon, label, shortcut }) => (
          <ToolBtn
            key={mode}
            active={toolMode === mode}
            onClick={() => onToolChange(mode)}
            label={`${label} (${shortcut})`}
            Icon={Icon}
          />
        ))}

      {readonly && (
        <ToolBtn
          active={toolMode === "pan"}
          onClick={() => onToolChange("pan")}
          label="Pan (H)"
          Icon={Hand}
        />
      )}

      {!readonly && (
        <>
          <div className={dividerCls} />
          <ToolBtn
            active={false}
            onClick={onUndo}
            disabled={!canUndo}
            label="Undo (Ctrl+Z)"
            Icon={Undo2}
          />
          <ToolBtn
            active={false}
            onClick={onRedo}
            disabled={!canRedo}
            label="Redo (Ctrl+Shift+Z)"
            Icon={Redo2}
          />
        </>
      )}

      {onToggleHeatmap && (
        <>
          <div className={dividerCls} />
          <ToolBtn
            active={showHeatmap}
            onClick={onToggleHeatmap}
            label="Heatmap"
            Icon={Layers}
          />
        </>
      )}

      <div className={dividerCls} />

      <ToolBtn
        active={false}
        onClick={onZoomIn}
        label="Zoom In"
        Icon={ZoomIn}
      />
      <ToolBtn
        active={false}
        onClick={onZoomOut}
        label="Zoom Out"
        Icon={ZoomOut}
      />
      <ToolBtn
        active={false}
        onClick={onZoomReset}
        label="Fit Canvas"
        Icon={Maximize2}
      />

      {!readonly && (
        <>
          <div className={dividerCls} />
          <ToolBtn
            active={false}
            onClick={onClear}
            label="Clear Canvas"
            Icon={Trash2}
            danger
          />
        </>
      )}
    </div>
  );
}

// ── Reusable tool button ────────────────────────────────────

interface ToolBtnProps {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
  Icon: React.ElementType;
  danger?: boolean;
}

function ToolBtn({
  active,
  onClick,
  disabled,
  label,
  Icon,
  danger,
}: ToolBtnProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // 56px touch targets (WCAG 2.5.5 + mobile UX)
        "w-14 h-14 flex items-center justify-center rounded-xl transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
        active
          ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/30"
          : danger
            ? "text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
            : "text-white/60 hover:bg-white/10 hover:text-white",
        disabled && "opacity-30 cursor-not-allowed",
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
    </button>
  );
}
