"use client"

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react"

export type ToolMode =
  | "select"    // Selection / move tool
  | "room"      // Room polygon drawing
  | "line"      // Single wall/line segments
  | "freehand"  // Freehand damage zone drawing
  | "text"      // Text label
  | "arrow"     // Arrow annotation
  | "measure"   // Measurement tool
  | "photo"     // Photo marker placement
  | "pan"       // Pan/navigate

export interface SketchCanvasProps {
  width?: number
  height?: number
  toolMode?: ToolMode
  backgroundImageUrl?: string | null
  backgroundImageOpacity?: number
  onReady?: (canvas: FabricCanvasRef) => void
  onModified?: () => void
  readonly?: boolean
  className?: string
}

export interface FabricCanvasRef {
  /** Serialise entire canvas state to JSON */
  toJSON: () => object
  /** Load canvas state from JSON (replaces current state) */
  loadFromJSON: (data: object) => Promise<void>
  /** Export canvas as PNG data URL */
  toDataURL: (options?: { format?: string; quality?: number; multiplier?: number }) => string
  /** Clear all objects (not background) */
  clear: () => void
  /** Get underlying Fabric.Canvas instance */
  getFabricCanvas: () => unknown
  /** Push current state to undo stack */
  saveState: () => void
  /** Undo last action */
  undo: () => void
  /** Redo last undone action */
  redo: () => void
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
}

const MAX_HISTORY = 50

/**
 * SketchCanvas — Fabric.js base component for the RestoreAssist V2 sketch tool.
 * Provides touch + mouse input, pinch-to-zoom, pan, tool mode management,
 * undo/redo history stack, and background image support.
 *
 * Uses dynamic import to avoid SSR issues (canvas is client-only).
 */
const SketchCanvas = forwardRef<FabricCanvasRef, SketchCanvasProps>(function SketchCanvas(
  {
    width = 1200,
    height = 800,
    toolMode = "select",
    backgroundImageUrl,
    backgroundImageOpacity = 0.4,
    onReady,
    onModified,
    readonly = false,
    className,
  },
  ref
) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<unknown>(null) // fabric.Canvas instance
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const isLoadingRef = useRef(false)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })

  // ── Undo/Redo helpers ─────────────────────────────────────
  const saveState = useCallback(() => {
    const canvas = fabricRef.current as { toJSON: () => object } | null
    if (!canvas) return
    const json = JSON.stringify(canvas.toJSON())
    const stack = historyRef.current
    const idx = historyIdxRef.current

    // Truncate forward history on new action
    historyRef.current = stack.slice(0, idx + 1)
    historyRef.current.push(json)
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    }
    historyIdxRef.current = historyRef.current.length - 1
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: false,
    })
  }, [])

  const undo = useCallback(async () => {
    const canvas = fabricRef.current as { loadFromJSON: (d: object, cb: () => void) => void; renderAll: () => void } | null
    if (!canvas || historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    isLoadingRef.current = true
    const json = JSON.parse(historyRef.current[historyIdxRef.current])
    await new Promise<void>(resolve => canvas.loadFromJSON(json, resolve))
    canvas.renderAll()
    isLoadingRef.current = false
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    })
  }, [])

  const redo = useCallback(async () => {
    const canvas = fabricRef.current as { loadFromJSON: (d: object, cb: () => void) => void; renderAll: () => void } | null
    if (!canvas || historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current += 1
    isLoadingRef.current = true
    const json = JSON.parse(historyRef.current[historyIdxRef.current])
    await new Promise<void>(resolve => canvas.loadFromJSON(json, resolve))
    canvas.renderAll()
    isLoadingRef.current = false
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    })
  }, [])

  // ── Expose imperative handle ─────────────────────────────
  useImperativeHandle(ref, () => ({
    toJSON: () => {
      const c = fabricRef.current as { toJSON: () => object } | null
      return c?.toJSON() ?? {}
    },
    loadFromJSON: async (data: object) => {
      const c = fabricRef.current as { loadFromJSON: (d: object, cb: () => void) => void; renderAll: () => void } | null
      if (!c) return
      await new Promise<void>(resolve => c.loadFromJSON(data, resolve))
      c.renderAll()
    },
    toDataURL: (opts) => {
      const c = fabricRef.current as { toDataURL: (o?: object) => string } | null
      return c?.toDataURL(opts) ?? ""
    },
    clear: () => {
      const c = fabricRef.current as { clear: () => void; renderAll: () => void } | null
      c?.clear()
      c?.renderAll()
    },
    getFabricCanvas: () => fabricRef.current,
    saveState,
    undo,
    redo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
  }), [saveState, undo, redo, historyState])

  // ── Initialise Fabric.js canvas ─────────────────────────
  useEffect(() => {
    if (!canvasElRef.current) return

    let destroyed = false
    let fabricCanvas: unknown = null

    ;(async () => {
      // Dynamic import — avoids SSR issues
      const fabric = await import("fabric")
      if (destroyed) return

      const Canvas = (fabric as { Canvas: new (el: HTMLCanvasElement, opts: object) => unknown }).Canvas

      fabricCanvas = new Canvas(canvasElRef.current!, {
        width,
        height,
        selection: !readonly,
        isDrawingMode: false,
        stopContextMenu: true,
        fireRightClick: false,
      })

      fabricRef.current = fabricCanvas
      const canvas = fabricCanvas as {
        on: (event: string, cb: (e?: unknown) => void) => void
        off: (event: string) => void
        setZoom: (z: number) => void
        getZoom: () => number
        relativePan: (point: { x: number; y: number }) => void
        getPointer: (e: MouseEvent) => { x: number; y: number }
        setActiveObject: (obj: unknown) => void
        renderAll: () => void
        isDrawingMode: boolean
        freeDrawingBrush: { color: string; width: number }
        loadFromJSON: (d: object, cb: () => void) => void
        toJSON: () => object
        toDataURL: (opts?: object) => string
        dispose: () => void
      }

      // ── Zoom with mouse wheel ──
      canvas.on("mouse:wheel", (opt: unknown) => {
        const e = (opt as { e: WheelEvent }).e
        const delta = e.deltaY
        let zoom = canvas.getZoom()
        zoom *= 0.999 ** delta
        zoom = Math.max(0.3, Math.min(4, zoom))
        canvas.setZoom(zoom)
        e.preventDefault()
        e.stopPropagation()
      })

      // ── Alt/Space + drag to pan ──
      let isPanning = false
      let lastPos = { x: 0, y: 0 }

      canvas.on("mouse:down", (opt: unknown) => {
        const e = (opt as { e: MouseEvent }).e
        if (e.altKey || toolMode === "pan") {
          isPanning = true
          lastPos = { x: e.clientX, y: e.clientY }
        }
      })
      canvas.on("mouse:move", (opt: unknown) => {
        if (!isPanning) return
        const e = (opt as { e: MouseEvent }).e
        canvas.relativePan({ x: e.clientX - lastPos.x, y: e.clientY - lastPos.y })
        lastPos = { x: e.clientX, y: e.clientY }
      })
      canvas.on("mouse:up", () => { isPanning = false })

      // ── Object modified → save state ──
      canvas.on("object:modified", () => {
        if (!isLoadingRef.current) {
          saveState()
          onModified?.()
        }
      })
      canvas.on("object:added", () => {
        if (!isLoadingRef.current) {
          saveState()
          onModified?.()
        }
      })
      canvas.on("object:removed", () => {
        if (!isLoadingRef.current) {
          saveState()
          onModified?.()
        }
      })

      // ── Keyboard shortcuts ──
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target !== document.body && e.target !== document.documentElement) return
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.shiftKey ? redo() : undo()
          e.preventDefault()
        }
      }
      document.addEventListener("keydown", handleKeyDown)

      // ── Background image ──
      if (backgroundImageUrl) {
        const { FabricImage } = fabric as { FabricImage: { fromURL: (url: string) => Promise<unknown> } }
        const img = await FabricImage.fromURL(backgroundImageUrl)
        const imgEl = img as { set: (opts: object) => void; scaleToWidth: (w: number) => void }
        imgEl.set({ selectable: false, evented: false, opacity: backgroundImageOpacity })
        imgEl.scaleToWidth(width)
        ;(canvas as unknown as { setBackgroundImage: (img: unknown, cb: () => void) => void })
          .setBackgroundImage(img, () => canvas.renderAll())
      }

      // Save initial empty state
      saveState()

      // Notify parent
      onReady?.({
        toJSON: () => canvas.toJSON(),
        loadFromJSON: (data) => new Promise(resolve => canvas.loadFromJSON(data, resolve)),
        toDataURL: (opts) => canvas.toDataURL(opts),
        clear: () => { (canvas as unknown as { clear: () => void }).clear(); canvas.renderAll() },
        getFabricCanvas: () => fabricCanvas,
        saveState,
        undo,
        redo,
        canUndo: false,
        canRedo: false,
      })

      // Cleanup
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
      }
    })()

    return () => {
      destroyed = true
      if (fabricRef.current) {
        ;(fabricRef.current as { dispose: () => void }).dispose()
        fabricRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  // ── Update drawing mode when toolMode changes ────────────
  useEffect(() => {
    const canvas = fabricRef.current as { isDrawingMode: boolean; freeDrawingBrush: { color: string; width: number }; selection: boolean; defaultCursor: string } | null
    if (!canvas) return

    canvas.isDrawingMode = toolMode === "freehand"
    canvas.selection = toolMode === "select" && !readonly

    if (toolMode === "freehand") {
      canvas.freeDrawingBrush.color = "#3b82f680" // blue with alpha
      canvas.freeDrawingBrush.width = 20
    }

    canvas.defaultCursor = toolMode === "pan" ? "grab" : "default"
  }, [toolMode, readonly])

  // ── Update background image when URL changes ─────────────
  useEffect(() => {
    const canvas = fabricRef.current as { renderAll: () => void; setBackgroundImage: (img: unknown, cb: () => void) => void } | null
    if (!canvas || !backgroundImageUrl) return

    ;(async () => {
      const fabric = await import("fabric")
      const { FabricImage } = fabric as { FabricImage: { fromURL: (url: string) => Promise<unknown> } }
      const img = await FabricImage.fromURL(backgroundImageUrl)
      const imgEl = img as { set: (opts: object) => void; scaleToWidth: (w: number) => void }
      imgEl.set({ selectable: false, evented: false, opacity: 0.4 })
      imgEl.scaleToWidth(width)
      canvas.setBackgroundImage(img, () => canvas.renderAll())
    })()
  }, [backgroundImageUrl, backgroundImageOpacity, width])

  return (
    <div className={className} style={{ overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasElRef} />
    </div>
  )
})

export default SketchCanvas
