'use client'

import { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import { setDrawingMode, clearCanvas, deleteSelected, undo, redo, saveToHistory, canvasToDataURL, canvasToSVG } from '@/lib/canvas-utils'

export interface FabricSignatureCanvasProps {
  width?: number
  height?: number
  backgroundColor?: string
  onSign?: (dataUrl: string) => void
  onSignatureSVG?: (svg: string) => void
  initialJSON?: object
}

export function FabricSignatureCanvas({
  width = 500,
  height = 200,
  backgroundColor = '#ffffff',
  onSign,
  onSignatureSVG,
  initialJSON,
}: FabricSignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [history, setHistory] = useState<object[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isEmpty, setIsEmpty] = useState(true)

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      backgroundColor,
      width,
      height,
      selection: false,
      preserveObjectStacking: true,
    })

    // Configure drawing brush
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = '#000000'
      canvas.freeDrawingBrush.width = 2
    }

    fabricCanvasRef.current = canvas

    // Load initial JSON if provided
    if (initialJSON) {
      canvas.loadFromJSON(initialJSON, () => {
        canvas.renderAll()
        const { history: newHistory, currentIndex } = saveToHistory(canvas, [], -1)
        setHistory(newHistory)
        setHistoryIndex(currentIndex)
        setIsEmpty(false)
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
      const hasContent = canvas.getObjects().length > 0
      setIsEmpty(!hasContent)

      const { history: newHistory, currentIndex } = saveToHistory(canvas, history, historyIndex)
      setHistory(newHistory)
      setHistoryIndex(currentIndex)
    }

    canvas.on('object:added', handleChange)
    canvas.on('object:modified', handleChange)
    canvas.on('object:removed', handleChange)
    canvas.on('path:created', handleChange)

    return () => {
      canvas.off('object:added', handleChange)
      canvas.off('object:modified', handleChange)
      canvas.off('object:removed', handleChange)
      canvas.off('path:created', handleChange)
    }
  }, [history, historyIndex])

  const handleUndo = () => {
    if (!fabricCanvasRef.current) return
    undo(fabricCanvasRef.current, history, historyIndex).then(newIndex => {
      setHistoryIndex(newIndex)
      const hasContent = fabricCanvasRef.current!.getObjects().length > 0
      setIsEmpty(!hasContent)
    })
  }

  const handleRedo = () => {
    if (!fabricCanvasRef.current) return
    redo(fabricCanvasRef.current, history, historyIndex).then(newIndex => {
      setHistoryIndex(newIndex)
      const hasContent = fabricCanvasRef.current!.getObjects().length > 0
      setIsEmpty(!hasContent)
    })
  }

  const handleClear = () => {
    if (!fabricCanvasRef.current) return
    clearCanvas(fabricCanvasRef.current)
    setHistory([])
    setHistoryIndex(-1)
    setIsEmpty(true)
  }

  const handleSign = () => {
    if (!fabricCanvasRef.current) return
    const dataUrl = canvasToDataURL(fabricCanvasRef.current)
    onSign?.(dataUrl)
  }

  const handleExportSVG = () => {
    if (!fabricCanvasRef.current) return
    const svg = canvasToSVG(fabricCanvasRef.current)
    onSignatureSVG?.(svg)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Signature Canvas */}
      <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
        <canvas
          ref={canvasRef}
          className="block mx-auto cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Undo"
        >
          ↶ Undo
        </button>

        <button
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Redo"
        >
          ↷ Redo
        </button>

        <button
          onClick={handleClear}
          disabled={isEmpty}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-red-600 border border-red-300 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear signature"
        >
          🗑️ Clear
        </button>

        <div className="flex-1" />

        <button
          onClick={handleExportSVG}
          disabled={isEmpty}
          className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as SVG (vector)"
        >
          📥 SVG
        </button>

        <button
          onClick={handleSign}
          disabled={isEmpty}
          className="px-3 py-2 rounded font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Confirm signature"
        >
          ✓ Sign
        </button>
      </div>

      {/* Status */}
      <div className="text-xs text-slate-500 px-2">
        {isEmpty ? 'Draw your signature above' : `Signature captured (${history.length} states)`}
      </div>
    </div>
  )
}
