'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Eraser, Undo2, Check } from 'lucide-react'

interface SignatureCanvasProps {
  onSave: (base64: string) => void
  onClear?: () => void
  width?: number
  height?: number
  lineWidth?: number
  lineColor?: string
  disabled?: boolean
  showColorPicker?: boolean
  showLineWidthPicker?: boolean
}

export function SignatureCanvas({
  onSave,
  onClear,
  width = 600,
  height = 250,
  lineWidth: initialLineWidth = 2,
  lineColor: initialLineColor = '#000000',
  disabled = false,
  showColorPicker = true,
  showLineWidthPicker = true,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([])
  const [canvasSize, setCanvasSize] = useState({ width, height })
  const [lineColor, setLineColor] = useState(initialLineColor)
  const [lineWidth, setLineWidth] = useState(initialLineWidth)

  // Responsive sizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        const newWidth = Math.min(width, containerWidth - 2) // -2 for border
        const newHeight = Math.round(newWidth * (height / width))
        setCanvasSize({ width: newWidth, height: newHeight })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [width, height])

  // Init canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
  }, [canvasSize, lineWidth, lineColor])

  const getPointerPos = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    },
    []
  )

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setStrokeHistory(prev => [...prev.slice(-20), snapshot]) // keep last 20
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      saveSnapshot()
      setIsDrawing(true)
      canvas.setPointerCapture(e.pointerId)

      const pos = getPointerPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      // Draw a dot for single clicks
      ctx.lineTo(pos.x + 0.1, pos.y + 0.1)
      ctx.stroke()
    },
    [disabled, getPointerPos, saveSnapshot]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || disabled) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const pos = getPointerPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      setHasSignature(true)
    },
    [isDrawing, disabled, getPointerPos]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return
      e.preventDefault()
      setIsDrawing(false)
      setHasSignature(true)

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.beginPath() // reset path
    },
    [isDrawing]
  )

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    setHasSignature(false)
    setStrokeHistory([])
    onClear?.()
  }, [lineColor, lineWidth, onClear])

  const handleUndo = useCallback(() => {
    if (strokeHistory.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prev = strokeHistory[strokeHistory.length - 1]
    ctx.putImageData(prev, 0, 0)
    setStrokeHistory(prev2 => prev2.slice(0, -1))

    // Check if canvas is blank after undo
    if (strokeHistory.length <= 1) {
      setHasSignature(false)
    }
  }, [strokeHistory])

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return
    const base64 = canvas.toDataURL('image/png')
    onSave(base64)
  }, [hasSignature, onSave])

  return (
    <div ref={containerRef} className="w-full">
      <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* Signing line hint */}
      <p className="text-xs text-muted-foreground text-center mt-1">
        {hasSignature ? 'Signature captured' : 'Draw your signature above'}
      </p>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || !hasSignature}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={disabled || strokeHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>

          {/* Color picker */}
          {showColorPicker && (
            <div className="flex items-center gap-1 border border-gray-300 dark:border-slate-600 rounded-md p-1">
              <button
                type="button"
                onClick={() => setLineColor('#000000')}
                disabled={disabled}
                className={`w-7 h-7 rounded border-2 ${
                  lineColor === '#000000'
                    ? 'border-cyan-500 ring-2 ring-cyan-200 dark:ring-cyan-800'
                    : 'border-gray-300 dark:border-slate-600'
                } bg-black transition-all`}
                title="Black ink"
              />
              <button
                type="button"
                onClick={() => setLineColor('#0000FF')}
                disabled={disabled}
                className={`w-7 h-7 rounded border-2 ${
                  lineColor === '#0000FF'
                    ? 'border-cyan-500 ring-2 ring-cyan-200 dark:ring-cyan-800'
                    : 'border-gray-300 dark:border-slate-600'
                } bg-blue-600 transition-all`}
                title="Blue ink"
              />
            </div>
          )}

          {/* Line width picker */}
          {showLineWidthPicker && (
            <div className="flex items-center gap-1 border border-gray-300 dark:border-slate-600 rounded-md p-1">
              <button
                type="button"
                onClick={() => setLineWidth(1.5)}
                disabled={disabled}
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  lineWidth === 1.5
                    ? 'bg-cyan-100 dark:bg-cyan-950/30 border-cyan-500'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                } border transition-all`}
                title="Thin line"
              >
                <div className="w-0.5 h-4 bg-slate-600 dark:bg-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => setLineWidth(2.5)}
                disabled={disabled}
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  lineWidth === 2.5
                    ? 'bg-cyan-100 dark:bg-cyan-950/30 border-cyan-500'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                } border transition-all`}
                title="Medium line"
              >
                <div className="w-1 h-4 bg-slate-600 dark:bg-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => setLineWidth(3.5)}
                disabled={disabled}
                className={`w-7 h-7 rounded flex items-center justify-center ${
                  lineWidth === 3.5
                    ? 'bg-cyan-100 dark:bg-cyan-950/30 border-cyan-500'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                } border transition-all`}
                title="Thick line"
              >
                <div className="w-1.5 h-4 bg-slate-600 dark:bg-slate-400" />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || !hasSignature}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors w-full sm:w-auto justify-center"
        >
          <Check className="h-3.5 w-3.5" />
          Confirm Signature
        </button>
      </div>
    </div>
  )
}
