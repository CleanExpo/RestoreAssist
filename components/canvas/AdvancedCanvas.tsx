'use client'

import { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import {
  canvasToDataURL,
  canvasToSVG,
  canvasToJSON,
  loadCanvasFromJSON,
  setDrawingMode,
  clearCanvas,
  deleteSelected,
  saveToHistory,
  undo,
  redo,
  addText,
  addShape,
} from '@/lib/canvas-utils'

export interface AdvancedCanvasProps {
  width?: number
  height?: number
  backgroundColor?: string
  onSave?: (dataUrl: string) => void
  initialJSON?: object
}

export function AdvancedCanvas({
  width = 800,
  height = 600,
  backgroundColor = '#ffffff',
  onSave,
  initialJSON,
}: AdvancedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedShape, setSelectedShape] = useState<'rectangle' | 'circle' | 'triangle' | null>(null)
  const [history, setHistory] = useState<object[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      backgroundColor,
      width,
      height,
      selection: true,
      preserveObjectStacking: true,
    })

    fabricCanvasRef.current = canvas

    // Load initial JSON if provided
    if (initialJSON) {
      loadCanvasFromJSON(canvas, initialJSON).then(() => {
        const { history: newHistory, currentIndex } = saveToHistory(canvas, [], -1)
        setHistory(newHistory)
        setHistoryIndex(currentIndex)
      })
    } else {
      // Save initial empty state
      const { history: newHistory, currentIndex } = saveToHistory(canvas, [], -1)
      setHistory(newHistory)
      setHistoryIndex(currentIndex)
    }

    // Cleanup
    return () => {
      canvas.dispose()
    }
  }, [width, height, backgroundColor])

  // Handle canvas changes for history
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const handleChange = () => {
      const { history: newHistory, currentIndex } = saveToHistory(canvas, history, historyIndex)
      setHistory(newHistory)
      setHistoryIndex(currentIndex)
    }

    canvas.on('object:added', handleChange)
    canvas.on('object:modified', handleChange)
    canvas.on('object:removed', handleChange)

    return () => {
      canvas.off('object:added', handleChange)
      canvas.off('object:modified', handleChange)
      canvas.off('object:removed', handleChange)
    }
  }, [history, historyIndex])

  const handleDrawToggle = () => {
    if (!fabricCanvasRef.current) return
    const newDrawing = !isDrawing
    setDrawingMode(fabricCanvasRef.current, newDrawing, '#000000')
    setIsDrawing(newDrawing)
    setSelectedShape(null)
  }

  const handleAddText = () => {
    if (!fabricCanvasRef.current) return
    setDrawingMode(fabricCanvasRef.current, false)
    setIsDrawing(false)
    setSelectedShape(null)
    addText(fabricCanvasRef.current, 'Click to edit', {
      x: 100,
      y: 100,
      fontSize: 24,
    })
  }

  const handleAddShape = (shapeType: 'rectangle' | 'circle' | 'triangle') => {
    if (!fabricCanvasRef.current) return
    setDrawingMode(fabricCanvasRef.current, false)
    setIsDrawing(false)
    setSelectedShape(shapeType)
    addShape(fabricCanvasRef.current, shapeType, {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fill: '#ff0000',
      stroke: '#000000',
      strokeWidth: 2,
    })
  }

  const handleDelete = () => {
    if (!fabricCanvasRef.current) return
    deleteSelected(fabricCanvasRef.current)
  }

  const handleClear = () => {
    if (!fabricCanvasRef.current) return
    if (confirm('Clear entire canvas? This cannot be undone.')) {
      clearCanvas(fabricCanvasRef.current)
      setHistory([])
      setHistoryIndex(-1)
    }
  }

  const handleUndo = () => {
    if (!fabricCanvasRef.current) return
    undo(fabricCanvasRef.current, history, historyIndex).then(newIndex => {
      setHistoryIndex(newIndex)
    })
  }

  const handleRedo = () => {
    if (!fabricCanvasRef.current) return
    redo(fabricCanvasRef.current, history, historyIndex).then(newIndex => {
      setHistoryIndex(newIndex)
    })
  }

  const handleSave = () => {
    if (!fabricCanvasRef.current) return
    const dataUrl = canvasToDataURL(fabricCanvasRef.current)
    onSave?.(dataUrl)
  }

  const handleExportSVG = () => {
    if (!fabricCanvasRef.current) return
    const svg = canvasToSVG(fabricCanvasRef.current)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'canvas-export.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Canvas */}
      <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair block mx-auto"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-4 rounded-lg">
        {/* Drawing Tools */}
        <button
          onClick={handleDrawToggle}
          className={`px-3 py-2 rounded font-medium text-sm transition ${
            isDrawing
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          ✏️ Draw
        </button>

        {/* Shape Tools */}
        <button
          onClick={() => handleAddShape('rectangle')}
          className={`px-3 py-2 rounded font-medium text-sm transition ${
            selectedShape === 'rectangle'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          ▭ Rectangle
        </button>

        <button
          onClick={() => handleAddShape('circle')}
          className={`px-3 py-2 rounded font-medium text-sm transition ${
            selectedShape === 'circle'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          ● Circle
        </button>

        <button
          onClick={() => handleAddShape('triangle')}
          className={`px-3 py-2 rounded font-medium text-sm transition ${
            selectedShape === 'triangle'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          △ Triangle
        </button>

        {/* Text Tool */}
        <button
          onClick={handleAddText}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition"
        >
          T Text
        </button>

        {/* Separator */}
        <div className="w-px bg-slate-300" />

        {/* Edit Tools */}
        <button
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ↶ Undo
        </button>

        <button
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ↷ Redo
        </button>

        <button
          onClick={handleDelete}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-red-600 border border-red-300 hover:bg-red-50 transition"
        >
          🗑️ Delete
        </button>

        {/* Separator */}
        <div className="w-px bg-slate-300" />

        {/* Export Tools */}
        <button
          onClick={handleExportSVG}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition"
        >
          📥 SVG
        </button>

        <button
          onClick={handleSave}
          className="px-3 py-2 rounded font-medium text-sm bg-green-600 text-white hover:bg-green-700 transition"
        >
          💾 Save PNG
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition ml-auto"
        >
          🔄 Clear All
        </button>
      </div>

      {/* Status Bar */}
      <div className="text-sm text-slate-600 px-2">
        History: {historyIndex + 1} / {history.length} | Drawing: {isDrawing ? 'ON' : 'OFF'}
      </div>
    </div>
  )
}
