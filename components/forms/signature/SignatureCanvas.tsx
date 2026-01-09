'use client'

import { useRef, useEffect, useState } from 'react'
import { RotateCcw, Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SignatureCanvasProps {
  onSignatureSave: (signatureData: string) => void
  width?: number
  height?: number
  disabled?: boolean
}

export function SignatureCanvas({
  onSignatureSave,
  width = 600,
  height = 200,
  disabled = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Get device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#1e293b'

    // Set white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    saveHistory()
  }, [width, height])

  const saveHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    setHistory((prev) => [...prev.slice(-9), ctx.getImageData(0, 0, canvas.width, canvas.height)])
  }

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * dpr,
        y: (touch.clientY - rect.top) * dpr,
      }
    } else {
      return {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
      }
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.preventDefault()
    setIsDrawing(true)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return
    e.preventDefault()

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()

    if (!hasSignature) {
      setHasSignature(true)
    }
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.closePath()
    saveHistory()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    setHistory([])
    saveHistory()
  }

  const undoSignature = () => {
    if (history.length <= 1) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    setHistory((prev) => {
      const newHistory = prev.slice(0, -1)
      const previousImageData = newHistory[newHistory.length - 1]
      if (previousImageData) {
        ctx.putImageData(previousImageData, 0, 0)
      }
      return newHistory
    })

    // Check if there's still content after undo
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const hasPixels = imageData.data.some((pixel, index) => {
      if (index % 4 === 3) return false // Skip alpha channel
      return pixel < 255 // Any non-white pixel
    })
    setHasSignature(hasPixels)
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return

    // Convert canvas to PNG data URL
    const signatureData = canvas.toDataURL('image/png')
    onSignatureSave(signatureData)
  }

  const downloadSignature = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `signature-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="space-y-4">
      {/* Canvas Container */}
      <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`w-full block ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
          style={{ height: '200px' }}
        />
      </div>

      {/* Instructions */}
      <p className="text-xs text-slate-500 italic">Sign above with your mouse or touch screen</p>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={undoSignature}
          disabled={history.length <= 1 || disabled}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Undo last stroke"
        >
          <RotateCcw size={16} />
          Undo
        </Button>

        <Button
          onClick={clearCanvas}
          disabled={!hasSignature || disabled}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Clear entire signature"
        >
          ✕ Clear
        </Button>

        <Button
          onClick={downloadSignature}
          disabled={!hasSignature || disabled}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Download signature as PNG"
        >
          <Download size={16} />
          Download
        </Button>

        <div className="flex-1" />

        <Button
          onClick={saveSignature}
          disabled={!hasSignature || disabled}
          className="gap-2"
          title="Save signature to form"
        >
          <Check size={16} />
          Save Signature
        </Button>
      </div>

      {/* Status */}
      {hasSignature && (
        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          ✓ Signature captured and ready to save
        </div>
      )}
    </div>
  )
}
