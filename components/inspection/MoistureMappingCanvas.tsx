"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Droplets, ZoomIn, ZoomOut, RotateCcw, Download, Upload, Loader2, Info, Wind, Thermometer, Filter } from "lucide-react"
import { getMoistureStatus, STATUS_COLORS, getDryStandard } from "@/lib/iicrc-dry-standards"

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

export interface EquipmentPoint {
  id: string
  x: number
  y: number
  equipmentType: string
}

type SketchMode = "structural" | "moisture" | "equipment"

interface MoistureMappingCanvasProps {
  readings: MoistureReading[]
  className?: string
  initialPoints?: MoisturePoint[]
  initialEquipmentPoints?: EquipmentPoint[]
  initialBackgroundImage?: string | null
  onPointsChange?: (points: MoisturePoint[]) => void
  onEquipmentPointsChange?: (points: EquipmentPoint[]) => void
  onBackgroundImageChange?: (imageUrl: string | null) => void
  onImageUpload?: (file: File) => Promise<string>
  readonly?: boolean
}

// IICRC S500 equipment configuration
const EQUIPMENT_TYPES = [
  {
    type: "dehu",
    label: "Dehumidifier",
    shortLabel: "LGR",
    color: "#3b82f6",
    coverageRadius: 45, // approx canvas units (represents ~50m²)
    symbol: "D",
    icon: Thermometer,
    iicrcRatio: "1 per 40m²",
  },
  {
    type: "air_mover",
    label: "Air Mover",
    shortLabel: "AM",
    color: "#8b5cf6",
    coverageRadius: 20,
    symbol: "A",
    icon: Wind,
    iicrcRatio: "1 per 10–15m²",
  },
  {
    type: "scrubber",
    label: "Air Scrubber",
    shortLabel: "AS",
    color: "#f97316",
    coverageRadius: 65,
    symbol: "S",
    icon: Filter,
    iicrcRatio: "1 per 100m²",
  },
]

function getEquipmentConfig(type: string) {
  return EQUIPMENT_TYPES.find(e => e.type === type) ?? EQUIPMENT_TYPES[0]
}

function getMoistureColor(level: number, material = "other"): string {
  const status = getMoistureStatus(level, material)
  return STATUS_COLORS[status].dot
}

function getMoistureLabel(level: number, material = "other"): string {
  const status = getMoistureStatus(level, material)
  const std = getDryStandard(material)
  if (status === "dry") return `Dry (≤${std.dryThreshold}%)`
  if (status === "drying") return `Drying (≤${std.wetThreshold}%)`
  return `Wet (>${std.wetThreshold}%)`
}

export default function MoistureMappingCanvas({
  readings,
  className,
  initialPoints = [],
  initialEquipmentPoints = [],
  initialBackgroundImage = null,
  onPointsChange,
  onEquipmentPointsChange,
  onBackgroundImageChange,
  onImageUpload,
  readonly = false,
}: MoistureMappingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [sketchMode, setSketchMode] = useState<SketchMode>("moisture")
  const [points, setPoints] = useState<MoisturePoint[]>(initialPoints)
  const [equipmentPoints, setEquipmentPoints] = useState<EquipmentPoint[]>(initialEquipmentPoints)
  const [selectedPoint, setSelectedPoint] = useState<MoisturePoint | null>(null)
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentPoint | null>(null)
  const [unplacedReadings, setUnplacedReadings] = useState<MoistureReading[]>(() => {
    const placedIds = new Set(initialPoints.map(p => p.id))
    return readings.filter(r => !placedIds.has(r.id))
  })
  const [placingReading, setPlacingReading] = useState<MoistureReading | null>(null)
  const [placingEquipment, setPlacingEquipment] = useState<string | null>(null) // equipment type
  const [backgroundImage, setBackgroundImage] = useState<string | null>(initialBackgroundImage)
  const [zoom, setZoom] = useState(1)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showCoverage, setShowCoverage] = useState(true)

  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 600

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (readonly) return
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH
      const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT

      if (sketchMode === "moisture" && placingReading) {
        const newPoint: MoisturePoint = { id: placingReading.id, x, y, reading: placingReading }
        const updatedPoints = [...points, newPoint]
        setPoints(updatedPoints)
        setUnplacedReadings(prev => prev.filter(r => r.id !== placingReading.id))
        setPlacingReading(null)
        onPointsChange?.(updatedPoints)
      } else if (sketchMode === "equipment" && placingEquipment) {
        const newEq: EquipmentPoint = {
          id: `eq-${Date.now()}`,
          x,
          y,
          equipmentType: placingEquipment,
        }
        const updatedEq = [...equipmentPoints, newEq]
        setEquipmentPoints(updatedEq)
        onEquipmentPointsChange?.(updatedEq)
        // Keep placing mode for rapid placement
      }
    },
    [placingReading, placingEquipment, readonly, points, equipmentPoints, sketchMode, onPointsChange, onEquipmentPointsChange]
  )

  const removeEquipment = (id: string) => {
    if (readonly) return
    const updated = equipmentPoints.filter(e => e.id !== id)
    setEquipmentPoints(updated)
    setSelectedEquipment(null)
    onEquipmentPointsChange?.(updated)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || readonly) return
    setUploadingImage(true)
    try {
      if (onImageUpload) {
        const imageUrl = await onImageUpload(file)
        setBackgroundImage(imageUrl)
        onBackgroundImageChange?.(imageUrl)
      } else {
        const reader = new FileReader()
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setBackgroundImage(dataUrl)
          onBackgroundImageChange?.(dataUrl)
        }
        reader.readAsDataURL(file)
      }
    } catch (error) {
      console.error("Error uploading floor plan:", error)
    } finally {
      setUploadingImage(false)
    }
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
      link.download = `moisture-map-${sketchMode}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    }
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))
  }

  const resetMap = () => {
    if (readonly) return
    setPoints([])
    setUnplacedReadings(readings)
    setPlacingReading(null)
    setSelectedPoint(null)
    onPointsChange?.([])
  }

  const resetEquipment = () => {
    if (readonly) return
    setEquipmentPoints([])
    setPlacingEquipment(null)
    setSelectedEquipment(null)
    onEquipmentPointsChange?.([])
  }

  // Equipment totals
  const equipmentCounts = EQUIPMENT_TYPES.reduce((acc, eq) => {
    acc[eq.type] = equipmentPoints.filter(p => p.equipmentType === eq.type).length
    return acc
  }, {} as Record<string, number>)

  useEffect(() => {
    if (initialPoints.length > 0) {
      setPoints(initialPoints)
      const placedIds = new Set(initialPoints.map(p => p.id))
      setUnplacedReadings(readings.filter(r => !placedIds.has(r.id)))
    } else {
      setPoints([])
      setUnplacedReadings(readings)
    }
  }, [readings, initialPoints])

  useEffect(() => {
    if (initialEquipmentPoints.length > 0) {
      setEquipmentPoints(initialEquipmentPoints)
    }
  }, [initialEquipmentPoints])

  useEffect(() => {
    if (initialBackgroundImage !== undefined) {
      setBackgroundImage(initialBackgroundImage)
    }
  }, [initialBackgroundImage])

  // Clear placing state when switching modes
  useEffect(() => {
    setPlacingReading(null)
    setPlacingEquipment(null)
    setSelectedPoint(null)
    setSelectedEquipment(null)
  }, [sketchMode])

  const MODE_TABS: { mode: SketchMode; label: string; description: string }[] = [
    { mode: "structural", label: "Structural", description: "Floor plan overview" },
    { mode: "moisture", label: "Moisture Map", description: "Place moisture readings" },
    { mode: "equipment", label: "Equipment", description: "Place drying equipment" },
  ]

  const isCrosshair =
    (sketchMode === "moisture" && !!placingReading) ||
    (sketchMode === "equipment" && !!placingEquipment)

  return (
    <div className={cn("space-y-3", className)}>
      {/* Mode toggle tabs */}
      <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-slate-800 rounded-xl w-fit">
        {MODE_TABS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setSketchMode(mode)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              sketchMode === mode
                ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                : "text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className={cn(
            "flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-slate-800 rounded-lg text-sm transition-colors",
            readonly ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-neutral-200 dark:hover:bg-slate-700"
          )}>
            {uploadingImage ? (
              <><Loader2 size={14} className="animate-spin" />Uploading...</>
            ) : (
              <><Upload size={14} />Upload Floor Plan</>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={readonly || uploadingImage}
            />
          </label>
          <button
            onClick={() => setZoom(z => Math.min(z + 0.25, 2))}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={sketchMode === "equipment" ? resetEquipment : resetMap}
            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700 transition-colors"
            title="Reset current layer"
          >
            <RotateCcw size={16} />
          </button>
          {sketchMode === "equipment" && (
            <button
              onClick={() => setShowCoverage(v => !v)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                showCoverage
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-neutral-100 dark:bg-slate-800 text-neutral-500"
              )}
              title="Toggle coverage zones"
            >
              Coverage zones
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={sketchMode === "structural" ? !backgroundImage : sketchMode === "moisture" ? points.length === 0 : equipmentPoints.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={14} />
          Export PNG
        </button>
      </div>

      {/* IICRC S500 Legend — conditional on mode */}
      {sketchMode === "moisture" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-slate-800/50 border border-neutral-200 dark:border-slate-700/50 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
            <Info size={11} className="flex-shrink-0" />
            <span className="font-semibold">IICRC S500</span>
          </div>
          {(["dry", "drying", "wet"] as const).map(status => (
            <span key={status} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[status].dot }} />
              <span className={STATUS_COLORS[status].text.split(" ")[0]}>
                {status === "dry" ? "Dry" : status === "drying" ? "Drying" : "Wet"}
              </span>
            </span>
          ))}
          <span className="text-neutral-400 dark:text-slate-500 ml-auto italic">Thresholds vary by material type</span>
        </div>
      )}

      {sketchMode === "equipment" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-slate-800/50 border border-neutral-200 dark:border-slate-700/50 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-slate-400">
            <Info size={11} className="flex-shrink-0" />
            <span className="font-semibold">IICRC S500 Ratios</span>
          </div>
          {EQUIPMENT_TYPES.map(eq => (
            <span key={eq.type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: eq.color }} />
              <span className="text-neutral-600 dark:text-slate-300">{eq.shortLabel}:</span>
              <span className="text-neutral-400 dark:text-slate-400">{eq.iicrcRatio}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        {/* SVG Canvas */}
        <div
          className="flex-1 rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden bg-neutral-50 dark:bg-slate-900/50"
          style={{ maxHeight: "600px" }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            className={cn("w-full h-auto", isCrosshair ? "cursor-crosshair" : "cursor-default")}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={handleCanvasClick}
          >
            {/* Background / floor plan */}
            {backgroundImage ? (
              <image href={backgroundImage} x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <>
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
                  </pattern>
                </defs>
                <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />
                {points.length === 0 && equipmentPoints.length === 0 && (
                  <text x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT / 2} textAnchor="middle" fill="currentColor" opacity="0.3" fontSize="16">
                    Upload a floor plan or click to place readings on the grid
                  </text>
                )}
              </>
            )}

            {/* ── MOISTURE LAYER (shown in moisture + equipment modes) ── */}
            {sketchMode !== "structural" && points.map(point => {
              const color = getMoistureColor(point.reading.moistureLevel, point.reading.surfaceType)
              const isSelected = selectedPoint?.id === point.id
              return (
                <g
                  key={point.id}
                  onClick={e => {
                    e.stopPropagation()
                    if (!readonly && sketchMode === "moisture") {
                      setSelectedPoint(isSelected ? null : point)
                    }
                  }}
                  style={{ cursor: readonly || sketchMode !== "moisture" ? "default" : "pointer" }}
                >
                  <circle cx={point.x} cy={point.y} r={isSelected ? 28 : 22} fill={color} opacity={0.15} />
                  <circle cx={point.x} cy={point.y} r={isSelected ? 20 : 16} fill={color} opacity={0.3} />
                  <circle cx={point.x} cy={point.y} r={isSelected ? 14 : 10} fill={color} stroke="white" strokeWidth={2} />
                  <text x={point.x} y={point.y + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={isSelected ? 10 : 8} fontWeight="bold">
                    {point.reading.moistureLevel}%
                  </text>
                  <text x={point.x} y={point.y + (isSelected ? 28 : 22)} textAnchor="middle" fill="currentColor" fontSize="10" opacity="0.7">
                    {point.reading.location}
                  </text>
                </g>
              )
            })}

            {/* ── EQUIPMENT LAYER (shown in equipment mode) ── */}
            {sketchMode === "equipment" && equipmentPoints.map(eq => {
              const config = getEquipmentConfig(eq.equipmentType)
              const isSelected = selectedEquipment?.id === eq.id
              return (
                <g
                  key={eq.id}
                  onClick={e => {
                    e.stopPropagation()
                    if (!readonly) setSelectedEquipment(isSelected ? null : eq)
                  }}
                  style={{ cursor: readonly ? "default" : "pointer" }}
                >
                  {/* Coverage zone */}
                  {showCoverage && (
                    <circle
                      cx={eq.x}
                      cy={eq.y}
                      r={config.coverageRadius}
                      fill={config.color}
                      fillOpacity={0.08}
                      stroke={config.color}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      strokeOpacity={0.4}
                    />
                  )}
                  {/* Equipment icon */}
                  <circle
                    cx={eq.x}
                    cy={eq.y}
                    r={isSelected ? 18 : 14}
                    fill={config.color}
                    stroke="white"
                    strokeWidth={2}
                    opacity={0.9}
                  />
                  <text
                    x={eq.x}
                    y={eq.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={isSelected ? 11 : 9}
                    fontWeight="bold"
                  >
                    {config.symbol}
                  </text>
                  <text
                    x={eq.x}
                    y={eq.y + (isSelected ? 24 : 20)}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                    opacity="0.6"
                  >
                    {config.shortLabel}
                  </text>
                </g>
              )
            })}

            {/* Placement cursor hint */}
            {placingReading && sketchMode === "moisture" && (
              <text x={CANVAS_WIDTH / 2} y={20} textAnchor="middle" fill="currentColor" fontSize="12" opacity="0.6">
                Click to place: {placingReading.location} ({placingReading.moistureLevel}%)
              </text>
            )}
            {placingEquipment && sketchMode === "equipment" && (
              <text x={CANVAS_WIDTH / 2} y={20} textAnchor="middle" fill="currentColor" fontSize="12" opacity="0.6">
                Click to place: {getEquipmentConfig(placingEquipment).label}
              </text>
            )}
          </svg>
        </div>

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 space-y-4">

          {/* ── STRUCTURAL mode sidebar ── */}
          {sketchMode === "structural" && (
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-slate-800/50 border border-neutral-200 dark:border-slate-700/50 text-sm text-neutral-500 dark:text-slate-400 text-center space-y-2">
              <p className="font-medium text-neutral-700 dark:text-slate-300">Structural View</p>
              <p className="text-xs">Floor plan overview without moisture or equipment data.</p>
              {backgroundImage ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Floor plan loaded</p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">Upload a floor plan to get started</p>
              )}
            </div>
          )}

          {/* ── MOISTURE mode sidebar ── */}
          {sketchMode === "moisture" && (
            <>
              {selectedPoint && (
                <div className="p-3 rounded-xl border-2 border-cyan-400 bg-cyan-50/50 dark:bg-cyan-900/10 space-y-2">
                  <div className="text-xs font-semibold text-cyan-600 uppercase">Selected Reading</div>
                  <div className="text-sm font-medium">{selectedPoint.reading.location}</div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: getMoistureColor(selectedPoint.reading.moistureLevel, selectedPoint.reading.surfaceType) }}>
                      {selectedPoint.reading.moistureLevel}%
                    </span>
                    <span className="text-xs text-neutral-500">{getMoistureLabel(selectedPoint.reading.moistureLevel, selectedPoint.reading.surfaceType)}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    <p>Surface: {selectedPoint.reading.surfaceType}</p>
                    <p>Depth: {selectedPoint.reading.depth}</p>
                    {selectedPoint.reading.notes && <p>Notes: {selectedPoint.reading.notes}</p>}
                  </div>
                </div>
              )}

              {unplacedReadings.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-neutral-500 uppercase">
                    Unplaced Readings ({unplacedReadings.length})
                  </div>
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {unplacedReadings.map(reading => (
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
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: getMoistureColor(reading.moistureLevel, reading.surfaceType) }}>
                            {reading.moistureLevel}%
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">{reading.surfaceType} / {reading.depth}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unplacedReadings.length === 0 && points.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 text-center">
                  <Droplets className="mx-auto text-emerald-500 mb-1" size={20} />
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">All readings placed</p>
                </div>
              )}

              {readings.length === 0 && (
                <div className="text-center py-8 text-neutral-400 text-sm">
                  No moisture readings to map
                </div>
              )}
            </>
          )}

          {/* ── EQUIPMENT mode sidebar ── */}
          {sketchMode === "equipment" && (
            <>
              {/* Equipment palette */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500 uppercase">Place Equipment</div>
                <div className="space-y-1.5">
                  {EQUIPMENT_TYPES.map(eq => (
                    <button
                      key={eq.type}
                      onClick={() => setPlacingEquipment(placingEquipment === eq.type ? null : eq.type)}
                      disabled={readonly}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg border text-sm transition-all",
                        placingEquipment === eq.type
                          ? "ring-2 ring-offset-1"
                          : "border-neutral-200 dark:border-slate-700 hover:border-opacity-50"
                      )}
                      style={placingEquipment === eq.type ? {
                        borderColor: eq.color,
                        backgroundColor: eq.color + "18",
                        outlineColor: eq.color,
                      } : {}}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: eq.color }}>
                            {eq.symbol}
                          </span>
                          <span className="font-medium">{eq.label}</span>
                        </div>
                        <span className="text-xs font-bold tabular-nums" style={{ color: eq.color }}>
                          ×{equipmentCounts[eq.type] ?? 0}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5 ml-8">{eq.iicrcRatio}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected equipment detail */}
              {selectedEquipment && (
                <div className="p-3 rounded-xl border-2 space-y-2" style={{ borderColor: getEquipmentConfig(selectedEquipment.equipmentType).color }}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-neutral-500 uppercase">Selected</div>
                    <button
                      onClick={() => removeEquipment(selectedEquipment.id)}
                      className="text-xs text-rose-500 hover:text-rose-600 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-sm font-medium">{getEquipmentConfig(selectedEquipment.equipmentType).label}</div>
                  <div className="text-xs text-neutral-500">
                    Position: ({Math.round(selectedEquipment.x)}, {Math.round(selectedEquipment.y)})
                  </div>
                </div>
              )}

              {/* Equipment summary */}
              {equipmentPoints.length > 0 && (
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-slate-800/50 border border-neutral-200 dark:border-slate-700/50">
                  <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Equipment Schedule</div>
                  <div className="space-y-1">
                    {EQUIPMENT_TYPES.filter(eq => (equipmentCounts[eq.type] ?? 0) > 0).map(eq => (
                      <div key={eq.type} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: eq.color }} />
                          {eq.label}
                        </span>
                        <span className="font-semibold tabular-nums">{equipmentCounts[eq.type]}</span>
                      </div>
                    ))}
                    <div className="pt-1 mt-1 border-t border-neutral-200 dark:border-slate-700 flex justify-between text-xs font-semibold">
                      <span>Total units</span>
                      <span>{equipmentPoints.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {equipmentPoints.length === 0 && (
                <div className="text-center py-6 text-neutral-400 text-sm">
                  Select a type above, then click the map to place equipment
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
