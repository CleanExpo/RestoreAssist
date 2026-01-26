"use client"

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Droplets, ZoomIn, ZoomOut, RotateCcw, Download, Upload } from "lucide-react"

interface MoistureReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  notes: string | null
}

interface MoisturePoint {
  id: string
  x: number
  y: number
  reading: MoistureReading
}

interface MoistureMappingCanvasProps {
  readings: MoistureReading[]
  className?: string
}

function getMoistureColor(level: number): string {
  if (level < 15) return "#10b981" // emerald-500 (dry)
  if (level < 25) return "#f59e0b" // amber-500 (caution)
  if (level < 40) return "#f97316" // orange-500 (wet)
  return "#ef4444" // red-500 (saturated)
}

function getMoistureLabel(level: number): string {
  if (level < 15) return "Dry"
  if (level < 25) return "Caution"
  if (level < 40) return "Wet"
  return "Saturated"
}

export default function MoistureMappingCanvas({ readings, className }: MoistureMappingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [points, setPoints] = useState<MoisturePoint[]>([])
  const [selectedPoint, setSelectedPoint] = useState<MoisturePoint | null>(null)
  const [unplacedReadings, setUnplacedReadings] = useState<MoistureReading[]>(readings)
  const [placingReading, setPlacingReading] = useState<MoistureReading | null>(null)
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 600

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placingReading) return

      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH
      const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT

      const newPoint: MoisturePoint = {
        id: placingReading.id,
        x,
        y,
        reading: placingReading,
      }

      setPoints((prev) => [...prev, newPoint])
      setUnplacedReadings((prev) => prev.filter((r) => r.id !== placingReading.id))
      setPlacingReading(null)
    },
    [placingReading]
  )

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setBackgroundImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleExport = () => {
    const svg = svgRef.current
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    canvas.width = CANVAS_WIDTH * 2
    canvas.height = CANVAS_HEIGHT * 2
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      const link = document.createElement("a")
      link.download = "moisture-map.png"
      link.href = canvas.toDataURL("image/png")
      link.click()
    }
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))
  }

  const resetMap = () => {
    setPoints([])
    setUnplacedReadings(readings)
    setPlacingReading(null)
    setSelectedPoint(null)
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-slate-800 rounded-lg text-sm cursor-pointer hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors">
            <Upload size={14} />
            Upload Floor Plan
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.25, 2))}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={resetMap}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Reset"
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={points.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={14} />
            Export PNG
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-medium text-neutral-500">Legend:</span>
        {[
          { label: "Dry (<15%)", color: "#10b981" },
          { label: "Caution (15-25%)", color: "#f59e0b" },
          { label: "Wet (25-40%)", color: "#f97316" },
          { label: "Saturated (>40%)", color: "#ef4444" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Canvas */}
        <div
          className="flex-1 rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden bg-neutral-50 dark:bg-slate-900/50"
          style={{ maxHeight: "600px" }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            className={cn(
              "w-full h-auto",
              placingReading ? "cursor-crosshair" : "cursor-default"
            )}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={handleCanvasClick}
          >
            {/* Background */}
            {backgroundImage ? (
              <image href={backgroundImage} x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <>
                {/* Grid pattern for empty state */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
                  </pattern>
                </defs>
                <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />
                {!backgroundImage && points.length === 0 && (
                  <text x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} textAnchor="middle" fill="currentColor" opacity="0.3" fontSize="16">
                    Upload a floor plan or click to place readings on the grid
                  </text>
                )}
              </>
            )}

            {/* Moisture points */}
            {points.map((point) => {
              const color = getMoistureColor(point.reading.moistureLevel)
              const isSelected = selectedPoint?.id === point.id
              return (
                <g
                  key={point.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedPoint(isSelected ? null : point)
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {/* Glow ring */}
                  <circle cx={point.x} cy={point.y} r={isSelected ? 28 : 22} fill={color} opacity={0.15} />
                  {/* Outer ring */}
                  <circle cx={point.x} cy={point.y} r={isSelected ? 20 : 16} fill={color} opacity={0.3} />
                  {/* Inner circle */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 14 : 10}
                    fill={color}
                    stroke="white"
                    strokeWidth={2}
                  />
                  {/* Value label */}
                  <text
                    x={point.x}
                    y={point.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={isSelected ? 10 : 8}
                    fontWeight="bold"
                  >
                    {point.reading.moistureLevel}%
                  </text>
                  {/* Location label */}
                  <text
                    x={point.x}
                    y={point.y + (isSelected ? 28 : 22)}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="10"
                    opacity="0.7"
                  >
                    {point.reading.location}
                  </text>
                </g>
              )
            })}

            {/* Placement cursor */}
            {placingReading && (
              <text x={CANVAS_WIDTH / 2} y={20} textAnchor="middle" fill="currentColor" fontSize="12" opacity="0.6">
                Click to place: {placingReading.location} ({placingReading.moistureLevel}%)
              </text>
            )}
          </svg>
        </div>

        {/* Sidebar — Unplaced readings + Selected details */}
        <div className="w-64 flex-shrink-0 space-y-4">
          {/* Selected point detail */}
          {selectedPoint && (
            <div className="p-3 rounded-xl border-2 border-cyan-400 bg-cyan-50/50 dark:bg-cyan-900/10 space-y-2">
              <div className="text-xs font-semibold text-cyan-600 uppercase">Selected Reading</div>
              <div className="text-sm font-medium">{selectedPoint.reading.location}</div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: getMoistureColor(selectedPoint.reading.moistureLevel) }}
                >
                  {selectedPoint.reading.moistureLevel}%
                </span>
                <span className="text-xs text-neutral-500">{getMoistureLabel(selectedPoint.reading.moistureLevel)}</span>
              </div>
              <div className="text-xs text-neutral-500">
                <p>Surface: {selectedPoint.reading.surfaceType}</p>
                <p>Depth: {selectedPoint.reading.depth}</p>
                {selectedPoint.reading.notes && <p>Notes: {selectedPoint.reading.notes}</p>}
              </div>
            </div>
          )}

          {/* Unplaced readings */}
          {unplacedReadings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-neutral-500 uppercase">
                Unplaced Readings ({unplacedReadings.length})
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {unplacedReadings.map((reading) => (
                  <button
                    key={reading.id}
                    onClick={() => setPlacingReading(placingReading?.id === reading.id ? null : reading)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border text-sm transition-all",
                      placingReading?.id === reading.id
                        ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 ring-2 ring-cyan-500/30"
                        : "border-neutral-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{reading.location}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: getMoistureColor(reading.moistureLevel) }}
                      >
                        {reading.moistureLevel}%
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">{reading.surfaceType} / {reading.depth}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All placed */}
          {unplacedReadings.length === 0 && points.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 text-center">
              <Droplets className="mx-auto text-emerald-500 mb-1" size={20} />
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">All readings placed</p>
            </div>
          )}

          {/* Empty state */}
          {readings.length === 0 && (
            <div className="text-center py-8 text-neutral-400 text-sm">
              No moisture readings to map
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
