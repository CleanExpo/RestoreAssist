"use client"

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type ChangeEvent,
} from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { SketchToolbar } from "./SketchToolbar"
import { FloorPlanUnderlayLoader } from "./FloorPlanUnderlayLoader"
import type { ToolMode, FabricCanvasRef } from "./SketchCanvas"
import {
  Plus,
  Trash2,
  ChevronDown,
  Layers,
  Loader2,
  Save,
  Check,
  FileDown,
} from "lucide-react"

// Dynamic import to avoid SSR issues
const SketchCanvas = dynamic(() => import("./SketchCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center flex-1 text-neutral-400 dark:text-slate-500">
      <Loader2 size={20} className="animate-spin mr-2" />
      Loading canvas…
    </div>
  ),
})

// ─── Room colours ────────────────────────────────────────
const ROOM_COLORS = [
  { fill: "rgba(59,130,246,0.10)",  stroke: "#3b82f6",  label: "Living / Common" },
  { fill: "rgba(16,185,129,0.10)",  stroke: "#10b981",  label: "Bedroom" },
  { fill: "rgba(245,158,11,0.10)",  stroke: "#f59e0b",  label: "Kitchen" },
  { fill: "rgba(236,72,153,0.10)",  stroke: "#ec4899",  label: "Bathroom / WC" },
  { fill: "rgba(139,92,246,0.10)", stroke: "#8b5cf6",  label: "Garage / Utility" },
  { fill: "rgba(239,68,68,0.10)",   stroke: "#ef4444",  label: "Damage Zone" },
]

// ─── Types ────────────────────────────────────────────────
interface Floor {
  id: string
  floorNumber: number
  floorLabel: string
  canvasRef: React.MutableRefObject<FabricCanvasRef | null>
}

interface SketchEditorProps {
  inspectionId?: string
  /** Pre-fill the floor plan search with the property address */
  propertyAddress?: string
  propertyPostcode?: string
  readonly?: boolean
  className?: string
  width?: number
  height?: number
}

// ─── Tool state helpers ────────────────────────────────────
interface RoomDrawState {
  points: { x: number; y: number }[]
  tempObjIds: string[]
}

// ─── Component ────────────────────────────────────────────
export function SketchEditor({
  inspectionId,
  propertyAddress,
  propertyPostcode,
  readonly = false,
  className,
  width = 1200,
  height = 800,
}: SketchEditorProps) {
  const uid = useId()

  // ── Floor state ──
  const [floors, setFloors] = useState<Floor[]>([
    { id: `${uid}-f0`, floorNumber: 0, floorLabel: "Ground Floor", canvasRef: { current: null } },
  ])
  const [activeFloorIdx, setActiveFloorIdx] = useState(0)

  // ── Floor plan underlay per floor ──
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({})
  const [backgroundOpacities, setBackgroundOpacities] = useState<Record<string, number>>({})

  // ── Tool state ──
  const [toolMode, setToolMode] = useState<ToolMode>("select")
  const [selectedRoomColor, setSelectedRoomColor] = useState(ROOM_COLORS[0])
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })

  // ── Save / PDF export state ──
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Room drawing buffer (per-canvas, keyed by floor id) ──
  const roomDrawRef = useRef<Map<string, RoomDrawState>>(new Map())

  const activeFloor = floors[activeFloorIdx]
  const canvasRef = activeFloor?.canvasRef

  // ── Floor plan underlay handlers ─────────────────────────
  const handleApplyBackground = useCallback((imageUrl: string, opacity: number) => {
    if (!activeFloor) return
    setBackgroundUrls(prev => ({ ...prev, [activeFloor.id]: imageUrl }))
    setBackgroundOpacities(prev => ({ ...prev, [activeFloor.id]: opacity }))
  }, [activeFloor])

  const handleClearBackground = useCallback(() => {
    if (!activeFloor) return
    setBackgroundUrls(prev => { const n = { ...prev }; delete n[activeFloor.id]; return n })
    setBackgroundOpacities(prev => { const n = { ...prev }; delete n[activeFloor.id]; return n })
  }, [activeFloor])

  // ── Get Fabric canvas ────────────────────────────────────
  const getFabric = useCallback(() => {
    const ref = canvasRef?.current
    if (!ref) return null
    return ref.getFabricCanvas() as {
      on: (evt: string, cb: (e: unknown) => void) => void
      off: (evt: string, cb?: (e: unknown) => void) => void
      getPointer: (e: MouseEvent) => { x: number; y: number }
      setZoom: (z: number) => void
      getZoom: () => number
      renderAll: () => void
      isDrawingMode: boolean
      freeDrawingBrush: { color: string; width: number }
      selection: boolean
      defaultCursor: string
      add: (...objs: unknown[]) => void
      remove: (...objs: unknown[]) => void
      getObjects: () => unknown[]
      toDataURL: (opts?: object) => string
    } | null
  }, [canvasRef])

  // ── Auto-save debounce ────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!inspectionId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!canvasRef?.current) return
      try {
        setSaving(true)
        const json = canvasRef.current.toJSON()
        await fetch(`/api/inspections/${inspectionId}/sketches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            floorNumber: activeFloor.floorNumber,
            floorLabel: activeFloor.floorLabel,
            sketchType: "structural",
            sketchData: json,
          }),
        })
        setSavedAt(new Date())
      } catch (err) {
        console.error("Auto-save failed:", err)
      } finally {
        setSaving(false)
      }
    }, 2000)
  }, [inspectionId, canvasRef, activeFloor])

  // ── Load sketch from API on floor change ─────────────────
  useEffect(() => {
    if (!inspectionId || !canvasRef?.current) return
    ;(async () => {
      const res = await fetch(`/api/inspections/${inspectionId}/sketches`)
      if (!res.ok) return
      const { sketches } = await res.json()
      const floorSketch = sketches.find(
        (s: { floorNumber: number; sketchData: object }) => s.floorNumber === activeFloor.floorNumber
      )
      if (floorSketch?.sketchData && canvasRef.current) {
        await canvasRef.current.loadFromJSON(floorSketch.sketchData)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFloor.id, inspectionId])

  // ── Register canvas tool event listeners ─────────────────
  useEffect(() => {
    const canvas = getFabric()
    if (!canvas) return

    // Update drawing mode
    canvas.isDrawingMode = toolMode === "freehand"
    canvas.selection = (toolMode === "select") && !readonly
    canvas.defaultCursor = toolMode === "pan" ? "grab" : "crosshair"

    if (toolMode === "freehand") {
      canvas.freeDrawingBrush.color = "rgba(59,130,246,0.25)"
      canvas.freeDrawingBrush.width = 24
    }

    // ── Per-tool click handler ──
    const floorId = activeFloor.id
    if (!roomDrawRef.current.has(floorId)) {
      roomDrawRef.current.set(floorId, { points: [], tempObjIds: [] })
    }

    const handleClick = async (opt: unknown) => {
      const e = (opt as { e: MouseEvent }).e
      const { x, y } = canvas.getPointer(e)

      if (toolMode === "room") {
        const fabric = await import("fabric")
        const state = roomDrawRef.current.get(floorId)!
        const { Circle, Line, Polygon } = fabric as unknown as {
          Circle: new (opts: object) => unknown
          Line: new (points: number[], opts: object) => unknown
          Polygon: new (pts: object[], opts: object) => unknown
        }

        // Check close to first point
        if (state.points.length >= 3) {
          const [fx, fy] = [state.points[0].x, state.points[0].y]
          if (Math.hypot(x - fx, y - fy) < 22) {
            // Close room
            const poly = new Polygon(state.points, {
              fill: selectedRoomColor.fill,
              stroke: selectedRoomColor.stroke,
              strokeWidth: 2,
              selectable: !readonly,
              objectCaching: false,
            })
            canvas.add(poly)
            // Remove temp objects
            const objs = canvas.getObjects()
            state.tempObjIds.forEach(oid => {
              const obj = objs.find((o: unknown) => (o as { id?: string }).id === oid)
              if (obj) canvas.remove(obj)
            })
            state.points = []
            state.tempObjIds = []
            canvas.renderAll()
            canvasRef?.current?.saveState()
            scheduleSave()
            return
          }
        }

        // Add corner dot
        const dot = new Circle({
          id: `dot-${Date.now()}`,
          left: x - 5,
          top: y - 5,
          radius: 5,
          fill: selectedRoomColor.stroke,
          selectable: false,
          evented: false,
        })
        canvas.add(dot)
        state.tempObjIds.push(`dot-${Date.now()}`)

        // Draw preview line
        if (state.points.length > 0) {
          const prev = state.points[state.points.length - 1]
          const id = `line-${Date.now()}`
          const line = new Line([prev.x, prev.y, x, y], {
            id,
            stroke: selectedRoomColor.stroke,
            strokeWidth: 2,
            selectable: false,
            evented: false,
            strokeDashArray: [4, 3],
          })
          canvas.add(line)
          state.tempObjIds.push(id)
        }

        state.points.push({ x, y })
        canvas.renderAll()

      } else if (toolMode === "text") {
        const fabric = await import("fabric")
        const { IText } = fabric as unknown as { IText: new (text: string, opts: object) => unknown }
        const txt = new IText("Label", {
          left: x,
          top: y,
          fontSize: 14,
          fill: "#1f2937",
          fontFamily: "Inter, sans-serif",
          selectable: !readonly,
        })
        canvas.add(txt)
        canvas.renderAll()
        canvasRef?.current?.saveState()
        scheduleSave()

      } else if (toolMode === "measure") {
        // First click sets start, second click sets end and shows measurement
        const state = roomDrawRef.current.get(floorId)!
        if (state.points.length === 0) {
          state.points.push({ x, y })
        } else {
          const start = state.points[0]
          const dist = Math.hypot(x - start.x, y - start.y)
          // Assume 1 canvas unit ≈ 0.01m (100px = 1m scale)
          const metres = (dist / 100).toFixed(2)

          const fabric = await import("fabric")
          const { Line: FLine, Group, Rect, IText } = fabric as unknown as {
            Line: new (pts: number[], opts: object) => unknown
            Group: new (objs: unknown[], opts: object) => unknown
            Rect: new (opts: object) => unknown
            IText: new (text: string, opts: object) => unknown
          }

          const midX = (start.x + x) / 2
          const midY = (start.y + y) / 2

          const line = new FLine([start.x, start.y, x, y], {
            stroke: "#6366f1",
            strokeWidth: 2,
            selectable: false,
          })
          const bg = new Rect({
            left: midX - 22,
            top: midY - 9,
            width: 44,
            height: 18,
            fill: "#6366f1",
            rx: 4,
            selectable: false,
          })
          const label = new IText(`${metres}m`, {
            left: midX - 18,
            top: midY - 8,
            fontSize: 11,
            fill: "white",
            fontFamily: "Inter, sans-serif",
            selectable: false,
          })

          canvas.add(line)
          canvas.add(bg)
          canvas.add(label)
          canvas.renderAll()

          state.points = []
          canvasRef?.current?.saveState()
          scheduleSave()
        }

      } else if (toolMode === "photo") {
        const fabric = await import("fabric")
        const { Circle: FCircle, IText: FIText } = fabric as unknown as {
          Circle: new (opts: object) => unknown
          IText: new (text: string, opts: object) => unknown
        }
        const marker = new FCircle({
          left: x - 10,
          top: y - 10,
          radius: 10,
          fill: "#f59e0b",
          stroke: "white",
          strokeWidth: 2,
          selectable: !readonly,
        })
        const label = new FIText("📷", {
          left: x - 7,
          top: y - 9,
          fontSize: 12,
          selectable: false,
        })
        canvas.add(marker)
        canvas.add(label)
        canvas.renderAll()
        canvasRef?.current?.saveState()
        scheduleSave()
      }
    }

    canvas.on("mouse:down", handleClick)

    return () => {
      canvas.off("mouse:down", handleClick)
      // Reset room drawing buffer only when changing away from room tool
      if (toolMode !== "room") {
        const state = roomDrawRef.current.get(floorId)
        if (state) {
          // Remove orphaned temp objects
          const objs = canvas.getObjects()
          state.tempObjIds.forEach(oid => {
            const obj = objs.find((o: unknown) => (o as { id?: string }).id === oid)
            if (obj) canvas.remove(obj)
          })
          state.points = []
          state.tempObjIds = []
          canvas.renderAll()
        }
      }
    }
  }, [toolMode, activeFloor.id, selectedRoomColor, canvasRef, readonly, getFabric, scheduleSave])

  // ── Keyboard shortcuts for tools ─────────────────────────
  useEffect(() => {
    if (readonly) return
    const handler = (e: KeyboardEvent) => {
      if (e.target !== document.body) return
      const map: Record<string, ToolMode> = {
        v: "select", r: "room", l: "line", p: "freehand",
        t: "text", a: "arrow", m: "measure", c: "photo", h: "pan",
      }
      if (map[e.key.toLowerCase()]) setToolMode(map[e.key.toLowerCase()])
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [readonly])

  // ── Zoom handlers ─────────────────────────────────────────
  const handleZoomIn = () => {
    const c = getFabric()
    if (c) c.setZoom(Math.min(c.getZoom() * 1.25, 4))
  }
  const handleZoomOut = () => {
    const c = getFabric()
    if (c) c.setZoom(Math.max(c.getZoom() / 1.25, 0.3))
  }

  // ── Export ────────────────────────────────────────────────
  const handleExport = () => {
    const c = getFabric()
    if (!c) return
    const url = c.toDataURL({ format: "png", multiplier: 2 })
    const a = document.createElement("a")
    a.href = url
    a.download = `sketch-${activeFloor.floorLabel.toLowerCase().replace(/\s+/g, "-")}.png`
    a.click()
  }

  // ── Export PDF (RA-121) ───────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!inspectionId || exportingPdf) return
    setExportingPdf(true)
    try {
      const floorData = floors.map(floor => {
        const c = floor.canvasRef.current
        if (!c) return null
        const fabricCanvas = c.getFabricCanvas() as { toDataURL: (opts: object) => string; toJSON: () => object } | null
        if (!fabricCanvas) return null
        return {
          label: floor.floorLabel,
          pngDataUrl: fabricCanvas.toDataURL({ format: "png", multiplier: 2 }),
          fabricJson: fabricCanvas.toJSON(),
        }
      }).filter(Boolean)

      if (floorData.length === 0) return

      const res = await fetch(`/api/inspections/${inspectionId}/sketches/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floors: floorData }),
      })

      if (!res.ok) { console.error("PDF export failed:", await res.text()); return }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `floor-plan-${inspectionId.slice(-8)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (err) {
      console.error("PDF export error:", err)
    } finally {
      setExportingPdf(false)
    }
  }, [floors, inspectionId, exportingPdf])

  // ── Add / remove floors ───────────────────────────────────
  const addFloor = () => {
    const num = floors.length
    setFloors(prev => [
      ...prev,
      {
        id: `${uid}-f${num}`,
        floorNumber: num,
        floorLabel: num === 1 ? "First Floor" : num === 2 ? "Second Floor" : `Floor ${num}`,
        canvasRef: { current: null } as React.MutableRefObject<FabricCanvasRef | null>,
      },
    ])
    setActiveFloorIdx(num)
  }

  const removeFloor = (idx: number) => {
    if (floors.length <= 1) return
    const newFloors = floors.filter((_, i) => i !== idx)
    setFloors(newFloors)
    setActiveFloorIdx(Math.min(activeFloorIdx, newFloors.length - 1))
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Floor tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <Layers size={15} className="flex-shrink-0 text-neutral-400 dark:text-slate-500 mr-1" />
        {floors.map((floor, idx) => (
          <div key={floor.id} className="flex items-center gap-0 flex-shrink-0">
            <button
              onClick={() => setActiveFloorIdx(idx)}
              className={cn(
                "px-3 py-1.5 rounded-l-lg text-sm font-medium border transition-all",
                idx === activeFloorIdx
                  ? "bg-cyan-500 text-white border-cyan-500"
                  : "bg-white dark:bg-slate-800 text-neutral-600 dark:text-slate-300 border-neutral-200 dark:border-slate-700 hover:border-cyan-300"
              )}
            >
              {floor.floorLabel}
            </button>
            {floors.length > 1 && (
              <button
                onClick={() => removeFloor(idx)}
                className={cn(
                  "px-1.5 py-1.5 rounded-r-lg text-xs border-y border-r transition-all",
                  idx === activeFloorIdx
                    ? "bg-cyan-600 text-white border-cyan-600 hover:bg-cyan-700"
                    : "bg-white dark:bg-slate-800 text-neutral-400 border-neutral-200 dark:border-slate-700 hover:text-rose-500"
                )}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <button
            onClick={addFloor}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-neutral-500 dark:text-slate-400 border border-dashed border-neutral-300 dark:border-slate-600 hover:border-cyan-400 hover:text-cyan-500 transition-all flex-shrink-0"
          >
            <Plus size={13} />
            Add Floor
          </button>
        )}

        {/* Save indicator + PDF export */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {inspectionId && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
              {saving ? (
                <><Loader2 size={12} className="animate-spin" /> Saving…</>
              ) : savedAt ? (
                <><Check size={12} className="text-emerald-500" /> Saved</>
              ) : null}
            </span>
          )}
          {inspectionId && (
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              title="Export floor plan PDF"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-slate-600 text-neutral-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {exportingPdf ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
              PDF
            </button>
          )}
        </div>
      </div>

      {/* Floor plan underlay loader */}
      {!readonly && (
        <FloorPlanUnderlayLoader
          defaultAddress={propertyAddress}
          defaultPostcode={propertyPostcode}
          inspectionId={inspectionId}
          onApply={handleApplyBackground}
          onClear={handleClearBackground}
          hasBackground={!!backgroundUrls[activeFloor?.id ?? ""]}
        />
      )}

      {/* Canvas area */}
      <div className="flex gap-2">
        {/* Vertical toolbar */}
        {!readonly && (
          <SketchToolbar
            toolMode={toolMode}
            onToolChange={setToolMode}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onUndo={() => canvasRef?.current?.undo()}
            onRedo={() => canvasRef?.current?.redo()}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onClear={() => { canvasRef?.current?.clear(); scheduleSave() }}
            onExport={handleExport}
          />
        )}

        {/* Canvas + room color picker */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Room color picker (only in room mode) */}
          {toolMode === "room" && !readonly && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-neutral-500 dark:text-slate-400">Room type:</span>
              {ROOM_COLORS.map(rc => (
                <button
                  key={rc.label}
                  title={rc.label}
                  onClick={() => setSelectedRoomColor(rc)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all",
                    selectedRoomColor.stroke === rc.stroke
                      ? "border-2 shadow-sm"
                      : "border opacity-60 hover:opacity-100"
                  )}
                  style={{
                    borderColor: rc.stroke,
                    backgroundColor: rc.fill,
                    color: rc.stroke,
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rc.stroke }} />
                  {rc.label}
                </button>
              ))}
            </div>
          )}

          {/* Canvas */}
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden bg-neutral-50 dark:bg-slate-900/50" style={{ minHeight: 400 }}>
            {floors.map((floor, idx) => (
              <div
                key={floor.id}
                className={cn("w-full", idx !== activeFloorIdx && "hidden")}
              >
                <SketchCanvas
                  ref={floor.canvasRef}
                  width={width}
                  height={height}
                  toolMode={toolMode}
                  readonly={readonly}
                  backgroundImageUrl={backgroundUrls[floor.id] ?? null}
                  backgroundImageOpacity={backgroundOpacities[floor.id] ?? 0.35}
                  className="w-full h-auto"
                  onReady={(ref) => {
                    floor.canvasRef.current = ref
                    // Update history state on first ready
                    setHistoryState({ canUndo: ref.canUndo, canRedo: ref.canRedo })
                  }}
                  onModified={() => {
                    const ref = floor.canvasRef.current
                    if (ref) setHistoryState({ canUndo: ref.canUndo, canRedo: ref.canRedo })
                    scheduleSave()
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
