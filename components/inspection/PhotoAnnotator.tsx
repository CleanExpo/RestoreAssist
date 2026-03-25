'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  MousePointer2,
  ArrowRight,
  Circle,
  Square,
  Type,
  Pencil,
  Ruler,
  Undo2,
  Redo2,
  Trash2,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'

// Dynamic import — Konva requires window/document at import time
const Stage = dynamic(() => import('react-konva').then((mod) => mod.Stage), { ssr: false })
const Layer = dynamic(() => import('react-konva').then((mod) => mod.Layer), { ssr: false })
const KonvaImage = dynamic(() => import('react-konva').then((mod) => mod.Image), { ssr: false })
const KonvaCircle = dynamic(() => import('react-konva').then((mod) => mod.Circle), { ssr: false })
const KonvaRect = dynamic(() => import('react-konva').then((mod) => mod.Rect), { ssr: false })
const KonvaArrow = dynamic(() => import('react-konva').then((mod) => mod.Arrow), { ssr: false })
const KonvaText = dynamic(() => import('react-konva').then((mod) => mod.Text), { ssr: false })
const KonvaLine = dynamic(() => import('react-konva').then((mod) => mod.Line), { ssr: false })

type Tool = 'select' | 'arrow' | 'circle' | 'rectangle' | 'text' | 'freehand' | 'measurement'

interface Annotation {
  id: string
  type: Tool
  points?: number[]
  x?: number
  y?: number
  width?: number
  height?: number
  radius?: number
  text?: string
  colour: string
  strokeWidth: number
}

interface PhotoAnnotatorProps {
  imageUrl: string
  annotations?: Annotation[]
  onSave?: (annotations: Annotation[]) => void
  readOnly?: boolean
}

const COLOURS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ffffff']

export function PhotoAnnotator({ imageUrl, annotations: initialAnnotations = [], onSave, readOnly = false }: PhotoAnnotatorProps) {
  const [tool, setTool] = useState<Tool>('select')
  const [colour, setColour] = useState('#ef4444')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations)
  const [undoStack, setUndoStack] = useState<Annotation[][]>([])
  const [redoStack, setRedoStack] = useState<Annotation[][]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)

  // Load image
  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth
        const aspectRatio = img.height / img.width
        const width = Math.min(containerWidth, img.width)
        const height = width * aspectRatio
        setStageSize({ width, height })
      }
    }
    img.src = imageUrl
  }, [imageUrl])

  // Resize handler
  useEffect(() => {
    if (!containerRef.current || !image) return
    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !image) return
      const containerWidth = containerRef.current.offsetWidth
      const aspectRatio = image.height / image.width
      const width = Math.min(containerWidth, image.width)
      setStageSize({ width, height: width * aspectRatio })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [image])

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev, annotations])
    setRedoStack([])
  }, [annotations])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setRedoStack((prev) => [...prev, annotations])
    setAnnotations(previous)
    setUndoStack((prev) => prev.slice(0, -1))
  }, [undoStack, annotations])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack((prev) => [...prev, annotations])
    setAnnotations(next)
    setRedoStack((prev) => prev.slice(0, -1))
  }, [redoStack, annotations])

  const generateId = () => `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const getPointerPosition = () => {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return { x: pos.x / scale, y: pos.y / scale }
  }

  const handleMouseDown = () => {
    if (readOnly || tool === 'select') return
    const pos = getPointerPosition()
    if (!pos) return

    if (tool === 'text') {
      setTextPosition(pos)
      setShowTextInput(true)
      return
    }

    setIsDrawing(true)
    pushUndo()

    const newAnnotation: Annotation = {
      id: generateId(),
      type: tool,
      colour,
      strokeWidth,
    }

    if (tool === 'freehand') {
      newAnnotation.points = [pos.x, pos.y]
    } else if (tool === 'arrow' || tool === 'measurement') {
      newAnnotation.points = [pos.x, pos.y, pos.x, pos.y]
    } else if (tool === 'circle') {
      newAnnotation.x = pos.x
      newAnnotation.y = pos.y
      newAnnotation.radius = 0
    } else if (tool === 'rectangle') {
      newAnnotation.x = pos.x
      newAnnotation.y = pos.y
      newAnnotation.width = 0
      newAnnotation.height = 0
    }

    setCurrentAnnotation(newAnnotation)
  }

  const handleMouseMove = () => {
    if (!isDrawing || !currentAnnotation) return
    const pos = getPointerPosition()
    if (!pos) return

    const updated = { ...currentAnnotation }

    if (currentAnnotation.type === 'freehand') {
      updated.points = [...(currentAnnotation.points || []), pos.x, pos.y]
    } else if (currentAnnotation.type === 'arrow' || currentAnnotation.type === 'measurement') {
      const points = currentAnnotation.points || [0, 0, 0, 0]
      updated.points = [points[0], points[1], pos.x, pos.y]
    } else if (currentAnnotation.type === 'circle') {
      const dx = pos.x - (currentAnnotation.x || 0)
      const dy = pos.y - (currentAnnotation.y || 0)
      updated.radius = Math.sqrt(dx * dx + dy * dy)
    } else if (currentAnnotation.type === 'rectangle') {
      updated.width = pos.x - (currentAnnotation.x || 0)
      updated.height = pos.y - (currentAnnotation.y || 0)
    }

    setCurrentAnnotation(updated)
  }

  const handleMouseUp = () => {
    if (!isDrawing || !currentAnnotation) return
    setIsDrawing(false)
    setAnnotations((prev) => [...prev, currentAnnotation])
    setCurrentAnnotation(null)
  }

  const handleTextSubmit = () => {
    if (!textInput.trim()) {
      setShowTextInput(false)
      setTextInput('')
      return
    }
    pushUndo()
    const newAnnotation: Annotation = {
      id: generateId(),
      type: 'text',
      x: textPosition.x,
      y: textPosition.y,
      text: textInput,
      colour,
      strokeWidth,
    }
    setAnnotations((prev) => [...prev, newAnnotation])
    setShowTextInput(false)
    setTextInput('')
  }

  const handleSave = () => {
    onSave?.(annotations)
  }

  const handleClear = () => {
    pushUndo()
    setAnnotations([])
  }

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3))
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25))
  const handleResetZoom = () => setScale(1)

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={18} />, label: 'Select' },
    { id: 'arrow', icon: <ArrowRight size={18} />, label: 'Arrow' },
    { id: 'circle', icon: <Circle size={18} />, label: 'Circle' },
    { id: 'rectangle', icon: <Square size={18} />, label: 'Rectangle' },
    { id: 'text', icon: <Type size={18} />, label: 'Text' },
    { id: 'freehand', icon: <Pencil size={18} />, label: 'Freehand' },
    { id: 'measurement', icon: <Ruler size={18} />, label: 'Measure' },
  ]

  const renderAnnotation = (ann: Annotation) => {
    switch (ann.type) {
      case 'arrow':
        return (
          <KonvaArrow
            key={ann.id}
            points={ann.points || []}
            stroke={ann.colour}
            strokeWidth={ann.strokeWidth}
            fill={ann.colour}
            pointerLength={10}
            pointerWidth={8}
          />
        )
      case 'circle':
        return (
          <KonvaCircle
            key={ann.id}
            x={ann.x}
            y={ann.y}
            radius={ann.radius}
            stroke={ann.colour}
            strokeWidth={ann.strokeWidth}
          />
        )
      case 'rectangle':
        return (
          <KonvaRect
            key={ann.id}
            x={ann.x}
            y={ann.y}
            width={ann.width}
            height={ann.height}
            stroke={ann.colour}
            strokeWidth={ann.strokeWidth}
          />
        )
      case 'text':
        return (
          <KonvaText
            key={ann.id}
            x={ann.x}
            y={ann.y}
            text={ann.text}
            fontSize={16}
            fill={ann.colour}
            fontFamily="Inter, sans-serif"
          />
        )
      case 'freehand':
        return (
          <KonvaLine
            key={ann.id}
            points={ann.points || []}
            stroke={ann.colour}
            strokeWidth={ann.strokeWidth}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
          />
        )
      case 'measurement':
        return (
          <KonvaArrow
            key={ann.id}
            points={ann.points || []}
            stroke={ann.colour}
            strokeWidth={ann.strokeWidth}
            fill={ann.colour}
            pointerLength={8}
            pointerWidth={6}
            dash={[10, 5]}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl">
          {/* Tool buttons */}
          <div className="flex gap-1">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                className={`p-2 rounded-lg transition-all ${
                  tool === t.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title={t.label}
              >
                {t.icon}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-slate-700" />

          {/* Colour picker */}
          <div className="flex gap-1">
            {COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  colour === c ? 'border-white scale-110' : 'border-slate-600'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-slate-700" />

          {/* Actions */}
          <div className="flex gap-1">
            <button type="button" onClick={handleUndo} disabled={undoStack.length === 0} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 disabled:opacity-30" title="Undo">
              <Undo2 size={18} />
            </button>
            <button type="button" onClick={handleRedo} disabled={redoStack.length === 0} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 disabled:opacity-30" title="Redo">
              <Redo2 size={18} />
            </button>
            <button type="button" onClick={handleClear} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50" title="Clear all">
              <Trash2 size={18} />
            </button>
          </div>

          <div className="w-px h-6 bg-slate-700" />

          {/* Zoom */}
          <div className="flex gap-1 items-center">
            <button type="button" onClick={handleZoomOut} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50" title="Zoom out">
              <ZoomOut size={18} />
            </button>
            <span className="text-xs text-slate-400 min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={handleZoomIn} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50" title="Zoom in">
              <ZoomIn size={18} />
            </button>
            <button type="button" onClick={handleResetZoom} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50" title="Reset zoom">
              <RotateCcw size={18} />
            </button>
          </div>

          <div className="flex-1" />

          {/* Save */}
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-all text-sm font-medium"
            >
              <Save size={16} />
              Save
            </button>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-auto bg-slate-950 border border-slate-700/50 rounded-xl"
        style={{ maxHeight: '70vh' }}
      >
        {image && (
          <Stage
            ref={stageRef}
            width={stageSize.width * scale}
            height={stageSize.height * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
          >
            <Layer>
              {/* Background image */}
              <KonvaImage image={image} width={stageSize.width} height={stageSize.height} />
            </Layer>
            <Layer>
              {/* Saved annotations */}
              {annotations.map(renderAnnotation)}
              {/* Current drawing annotation */}
              {currentAnnotation && renderAnnotation(currentAnnotation)}
            </Layer>
          </Stage>
        )}

        {!image && (
          <div className="flex items-center justify-center h-64 text-slate-400">
            Loading image...
          </div>
        )}

        {/* Text input overlay */}
        {showTextInput && (
          <div
            className="absolute z-10 flex gap-2"
            style={{ left: textPosition.x * scale, top: textPosition.y * scale }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              className="px-3 py-1.5 bg-slate-800 border border-cyan-500/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              placeholder="Type annotation..."
              autoFocus
            />
            <button
              type="button"
              onClick={handleTextSubmit}
              className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm hover:bg-cyan-500/30"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Annotation count */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
        {tool !== 'select' && <span className="text-cyan-400">Drawing mode: {tool}</span>}
      </div>
    </div>
  )
}
