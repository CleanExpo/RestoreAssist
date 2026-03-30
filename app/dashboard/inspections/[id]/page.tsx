"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas"
import MoistureTrendChart from "@/components/inspection/MoistureTrendChart"
import DryingProgressChart from "@/components/inspection/DryingProgressChart"
import { MoistureReadingEntryForm } from "@/components/inspection/MoistureReadingEntryForm"
import InspectionSignOff from "@/components/inspection/InspectionSignOff"
import { NirPilotSurvey } from "@/components/nir-pilot-survey"
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Calendar,
  User,
  Droplets,
  Thermometer,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  DollarSign,
  Camera,
  Shield,
  Layers,
  CheckCircle2,
  Clock,
  XCircle,
  Map,
  TrendingDown,
  PencilRuler,
  Sparkles,
  Copy,
  Check,
  PenLine,
} from "lucide-react"

// Fabric.js canvas — must be client-only (no SSR)
const SketchEditor = dynamic(
  () => import("@/components/sketch/SketchEditor").then((m) => ({ default: m.SketchEditor })),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-cyan-500" size={28} /></div> }
)

type Tab = "overview" | "environmental" | "moisture" | "drying-chart" | "moisture-map" | "areas" | "classification" | "scope" | "costs" | "photos" | "sketch"

interface Inspection {
  id: string
  inspectionNumber: string
  propertyAddress: string
  propertyPostcode: string
  technicianName: string | null
  status: string
  createdAt: string
  submittedAt: string | null
  processedAt: string | null
  signedAt: string | null
  signedByName: string | null
  signatureUrl: string | null
  lossDescription: string | null
  environmentalData: {
    ambientTemperature: number
    humidityLevel: number
    dewPoint: number | null
    airCirculation: boolean
    weatherConditions: string | null
    notes: string | null
  } | null
  moistureReadings: {
    id: string
    location: string
    surfaceType: string
    moistureLevel: number
    depth: string
    notes: string | null
    photoUrl: string | null
    recordedAt: string
  }[]
  affectedAreas: {
    id: string
    roomZoneId: string
    affectedSquareFootage: number
    waterSource: string
    timeSinceLoss: number | null
    category: string | null
    class: string | null
    description: string | null
  }[]
  scopeItems: {
    id: string
    itemType: string
    description: string
    quantity: number | null
    unit: string | null
    justification: string | null
    isRequired: boolean
    isSelected: boolean
    autoDetermined: boolean
  }[]
  classifications: {
    id: string
    category: string
    class: string
    justification: string
    standardReference: string
    confidence: number | null
  }[]
  costEstimates: {
    id: string
    category: string
    description: string
    quantity: number
    unit: string
    rate: number
    subtotal: number
    total: number
  }[]
  photos: {
    id: string
    url: string
    thumbnailUrl: string | null
    location: string | null
    description: string | null
    timestamp: string
  }[]
  auditLogs: {
    id: string
    action: string
    timestamp: string
  }[]
}

const STATUS_STEPS = ["DRAFT", "SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED", "ESTIMATED", "COMPLETED"]

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus)
  const isRejected = currentStatus === "REJECTED"

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STATUS_STEPS.map((step, i) => {
        const isActive = i === currentIndex
        const isComplete = i < currentIndex
        return (
          <div key={step} className="flex items-center">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all",
              isComplete && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
              isActive && !isRejected && "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 ring-2 ring-cyan-500/30",
              isActive && isRejected && "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-2 ring-red-500/30",
              !isComplete && !isActive && "bg-neutral-100 dark:bg-slate-800 text-neutral-400 dark:text-slate-500"
            )}>
              {isComplete ? <CheckCircle2 size={12} /> : isActive ? <Clock size={12} /> : null}
              {step.charAt(0) + step.slice(1).toLowerCase()}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={cn(
                "w-4 h-0.5 mx-0.5",
                i < currentIndex ? "bg-emerald-400" : "bg-neutral-200 dark:bg-slate-700"
              )} />
            )}
          </div>
        )
      })}
      {isRejected && (
        <div className="flex items-center">
          <div className="w-4 h-0.5 mx-0.5 bg-red-400" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-2 ring-red-500/30">
            <XCircle size={12} /> Rejected
          </div>
        </div>
      )}
    </div>
  )
}

function moistureColor(level: number): string {
  if (level < 15) return "text-emerald-600 dark:text-emerald-400"
  if (level < 25) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function moistureBg(level: number): string {
  if (level < 15) return "bg-emerald-50 dark:bg-emerald-900/20"
  if (level < 25) return "bg-amber-50 dark:bg-amber-900/20"
  return "bg-red-50 dark:bg-red-900/20"
}

export default function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [showAddReading, setShowAddReading] = useState(false)
  const [scopeNarrative, setScopeNarrative] = useState("")
  const [isGeneratingScope, setIsGeneratingScope] = useState(false)
  const [scopeGenError, setScopeGenError] = useState<string | null>(null)
  const [narrativeCopied, setNarrativeCopied] = useState(false)
  const [similarJobs, setSimilarJobs] = useState<Array<{
    id: string; claimType: string; suburb: string; state: string;
    description: string; totalExTax: number; itemCount: number; equipmentCount: number; distance: number;
  }>>([])
  const [isLoadingSimilarJobs, setIsLoadingSimilarJobs] = useState(false)
  const [isCalculatingEquipment, setIsCalculatingEquipment] = useState(false)

  const generateScopeNarrative = async () => {
    if (!inspection) return
    setIsGeneratingScope(true)
    setScopeNarrative("")
    setScopeGenError(null)

    // affectedSquareFootage is sq ft → convert to m² (1 sq ft = 0.0929 m²)
    const area = inspection.affectedAreas.reduce((sum, a) => sum + (a.affectedSquareFootage ?? 0) * 0.0929, 0)
    const rooms = inspection.affectedAreas.map((a) => a.roomZoneId).filter(Boolean)

    try {
      const resp = await fetch(`/api/inspections/${inspection.id}/generate-scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affectedAreaM2: area || 25,
          affectedRooms: rooms,
          lossSourceDescription: inspection.lossDescription ?? undefined,
        }),
      })

      if (!resp.ok || !resp.body) {
        setScopeGenError("Failed to start generation — check ANTHROPIC_API_KEY is set.")
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

        for (const line of lines) {
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.type === "delta" && payload.text) {
              setScopeNarrative((prev) => prev + payload.text)
            } else if (payload.type === "error") {
              setScopeGenError(payload.error ?? "Generation error")
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setScopeGenError(err instanceof Error ? err.message : "Network error")
    } finally {
      setIsGeneratingScope(false)
    }
  }

  const copyScopeNarrative = async () => {
    await navigator.clipboard.writeText(scopeNarrative)
    setNarrativeCopied(true)
    setTimeout(() => setNarrativeCopied(false), 2000)
  }

  const fetchSimilarJobs = async (inspectionId: string) => {
    setIsLoadingSimilarJobs(true)
    try {
      const resp = await fetch(`/api/inspections/${inspectionId}/similar-jobs?limit=5`)
      if (resp.ok) {
        const data = await resp.json()
        setSimilarJobs(data.results ?? [])
      }
    } catch {
      // silent fail — similar jobs are non-critical
    } finally {
      setIsLoadingSimilarJobs(false)
    }
  }

  useEffect(() => {
    if (activeTab === "classification" && id && similarJobs.length === 0) {
      fetchSimilarJobs(id)
    }
  }, [activeTab, id])

  useEffect(() => {
    fetchInspection()
  }, [id])

  const fetchInspection = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/inspections/${id}`)
      if (response.ok) {
        const data = await response.json()
        setInspection(data.inspection)
      } else {
        toast.error("Inspection not found")
        router.push("/dashboard/inspections")
      }
    } catch (error) {
      console.error("Error:", error)
      toast.error("Failed to load inspection")
    } finally {
      setLoading(false)
    }
  }

  const runEquipmentCalculator = async () => {
    if (!inspection) return
    // affectedSquareFootage is sq ft → convert to m² (1 sq ft = 0.0929 m²)
    const totalAreaM2 = inspection.affectedAreas.reduce((sum, a) => sum + (a.affectedSquareFootage ?? 0) * 0.0929, 0)
    if (totalAreaM2 === 0) {
      toast.error("Add affected areas with m² measurements before calculating equipment")
      return
    }
    setIsCalculatingEquipment(true)
    try {
      const resp = await fetch(`/api/inspections/${inspection.id}/equipment-calculator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affectedAreaM2: totalAreaM2, saveScopeItems: true }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? "Equipment calculator failed")
      toast.success(`Added ${data.equipmentItems?.length ?? 0} equipment scope items`)
      await fetchInspection()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to calculate equipment")
    } finally {
      setIsCalculatingEquipment(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    )
  }

  if (!inspection) return null

  const classification = inspection.classifications?.[0]
  const totalCost = inspection.costEstimates.reduce((sum, c) => sum + c.total, 0)

  const TABS: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "overview", label: "Overview", icon: ClipboardCheck },
    { key: "environmental", label: "Environmental", icon: Thermometer },
    { key: "moisture", label: "Moisture", icon: Droplets, count: inspection.moistureReadings.length },
    { key: "drying-chart", label: "Drying Chart", icon: TrendingDown },
    { key: "moisture-map", label: "Moisture Map", icon: Map },
    { key: "areas", label: "Affected Areas", icon: AlertTriangle, count: inspection.affectedAreas.length },
    { key: "classification", label: "Classification", icon: Shield, count: inspection.classifications.length },
    { key: "scope", label: "Scope Items", icon: Layers, count: inspection.scopeItems.length },
    { key: "costs", label: "Cost Estimates", icon: DollarSign, count: inspection.costEstimates.length },
    { key: "photos", label: "Photos", icon: Camera, count: inspection.photos.length },
    { key: "sketch", label: "Sketch", icon: PencilRuler },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/dashboard/inspections")}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              {inspection.inspectionNumber}
            </h1>
            {classification && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                Category {classification.category} / Class {classification.class}
              </span>
            )}
            {inspection.signedAt && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center gap-1">
                <PenLine size={11} />
                Signed
              </span>
            )}
            {/* Report export buttons */}
            <div className="flex items-center gap-1.5 ml-auto">
              <a
                href={`/api/inspections/${inspection.id}/report?format=pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-neutral-50 dark:hover:bg-slate-700 text-neutral-700 dark:text-slate-200 transition-colors"
              >
                <FileText size={12} />
                PDF
              </a>
              <a
                href={`/api/inspections/${inspection.id}/report?format=excel`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-neutral-50 dark:hover:bg-slate-700 text-neutral-700 dark:text-slate-200 transition-colors"
              >
                <Layers size={12} />
                Excel
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <MapPin size={14} />
              {inspection.propertyAddress} ({inspection.propertyPostcode})
            </span>
            {inspection.technicianName && (
              <span className="flex items-center gap-1">
                <User size={14} />
                {inspection.technicianName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {new Date(inspection.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <StatusTimeline currentStatus={inspection.status} />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-neutral-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2",
              activeTab === tab.key
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-900/10"
                : "border-transparent text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/50"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-xs",
                activeTab === tab.key ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600" : "bg-neutral-100 dark:bg-slate-800 text-neutral-500"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">Moisture Readings</div>
              <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{inspection.moistureReadings.length}</div>
              {inspection.moistureReadings.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  Avg: {(inspection.moistureReadings.reduce((s, r) => s + r.moistureLevel, 0) / inspection.moistureReadings.length).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">Affected Areas</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{inspection.affectedAreas.length}</div>
              {inspection.affectedAreas.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  Total: {inspection.affectedAreas.reduce((s, a) => s + a.affectedSquareFootage, 0).toFixed(0)} sq ft
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">Scope Items</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{inspection.scopeItems.filter(s => s.isSelected).length}</div>
              <div className="text-xs text-neutral-500 mt-1">{inspection.scopeItems.filter(s => s.autoDetermined).length} auto-determined</div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">Estimated Cost</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                ${totalCost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-neutral-500 mt-1">{inspection.costEstimates.length} line items</div>
            </div>

            {/* Classification Card */}
            {classification && (
              <div className="md:col-span-2 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">IICRC S500 Classification</div>
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <span className="text-sm text-neutral-500 dark:text-slate-400">Category</span>
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">{classification.category}</div>
                  </div>
                  <div className="w-px h-10 bg-amber-200 dark:bg-amber-800" />
                  <div>
                    <span className="text-sm text-neutral-500 dark:text-slate-400">Class</span>
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">{classification.class}</div>
                  </div>
                  {classification.confidence && (
                    <>
                      <div className="w-px h-10 bg-amber-200 dark:bg-amber-800" />
                      <div>
                        <span className="text-sm text-neutral-500 dark:text-slate-400">Confidence</span>
                        <div className="text-xl font-bold text-neutral-900 dark:text-white">{classification.confidence}%</div>
                      </div>
                    </>
                  )}
                </div>
                <p className="text-sm text-neutral-600 dark:text-slate-300">{classification.justification}</p>
                <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">Ref: {classification.standardReference}</p>
              </div>
            )}

            {/* Environmental Summary */}
            {inspection.environmentalData && (
              <div className="md:col-span-2 p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
                <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-2">Environmental Conditions</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-neutral-400">Temperature</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.ambientTemperature}°C</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Humidity</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.humidityLevel}%</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Dew Point</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.dewPoint?.toFixed(1) ?? "N/A"}°C</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Air Circulation</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.airCirculation ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Sign Off */}
            <div className="md:col-span-full">
              <InspectionSignOff
                inspectionId={inspection.id}
                inspectionNumber={inspection.inspectionNumber}
                signedAt={inspection.signedAt}
                signedByName={inspection.signedByName}
                onSigned={(signedAt, signedByName) => {
                  setInspection(prev => prev ? { ...prev, signedAt: signedAt.toISOString(), signedByName } : prev)
                }}
              />
            </div>
          </div>
        )}

        {/* Environmental Tab */}
        {activeTab === "environmental" && (
          <div className="max-w-2xl">
            {inspection.environmentalData ? (
              <div className="p-6 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 space-y-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Thermometer className="text-cyan-500" size={20} />
                  Environmental Data
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Ambient Temperature</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.ambientTemperature}°C</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Humidity Level</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.humidityLevel}%</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Dew Point</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.dewPoint?.toFixed(1) ?? "Not calculated"}°C</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Air Circulation</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.airCirculation ? "Active" : "None"}</p>
                  </div>
                </div>
                {inspection.environmentalData.weatherConditions && (
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Weather Conditions</label>
                    <p className="mt-1 text-neutral-700 dark:text-slate-300">{inspection.environmentalData.weatherConditions}</p>
                  </div>
                )}
                {inspection.environmentalData.notes && (
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Notes</label>
                    <p className="mt-1 text-neutral-700 dark:text-slate-300">{inspection.environmentalData.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">No environmental data recorded</div>
            )}
          </div>
        )}

        {/* Moisture Readings Tab */}
        {activeTab === "moisture" && (
          <div className="space-y-4">
            {/* Add Reading toggle */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddReading(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  showAddReading
                    ? "bg-neutral-100 dark:bg-slate-700 text-neutral-700 dark:text-slate-300"
                    : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/30"
                )}
              >
                <Droplets size={15} />
                {showAddReading ? "Cancel" : "Add Reading"}
              </button>
            </div>

            {/* Inline entry form */}
            {showAddReading && (
              <div className="p-5 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/50 dark:bg-cyan-500/5">
                <MoistureReadingEntryForm
                  inspectionId={id}
                  onSuccess={(reading) => {
                    setInspection(prev => prev ? {
                      ...prev,
                      moistureReadings: [...prev.moistureReadings, reading]
                    } : prev)
                    setShowAddReading(false)
                  }}
                  onCancel={() => setShowAddReading(false)}
                />
              </div>
            )}

            {inspection.moistureReadings.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Surface Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Moisture %</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Depth</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                    {inspection.moistureReadings.map((reading) => (
                      <tr key={reading.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-medium text-sm">{reading.location}</td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-slate-300 capitalize">{reading.surfaceType}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-0.5 rounded-full text-sm font-semibold", moistureBg(reading.moistureLevel), moistureColor(reading.moistureLevel))}>
                            {reading.moistureLevel}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-slate-300">{reading.depth}</td>
                        <td className="px-4 py-3 text-sm text-neutral-400 max-w-[200px] truncate">{reading.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">No moisture readings recorded — use &quot;Add Reading&quot; above</div>
            )}
          </div>
        )}

        {/* Drying Chart Tab (RA-266) */}
        {activeTab === "drying-chart" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                IICRC S500 Drying Progress Curve
              </h3>
              <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
                Multi-day drying curve per location — target lines derived from IICRC S500:2021 dry standards per material type
              </p>
            </div>
            <DryingProgressChart
              readings={inspection.moistureReadings}
              inspectionStartDate={inspection.createdAt}
            />
          </div>
        )}

        {/* Moisture Map Tab */}
        {activeTab === "moisture-map" && (
          <div className="space-y-6">
            {inspection.moistureReadings.length > 0 ? (
              <MoistureMappingCanvas readings={inspection.moistureReadings} />
            ) : (
              <div className="text-center py-12 text-neutral-400">No moisture readings to map — add readings first</div>
            )}
            {inspection.moistureReadings.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-3">Drying Progress</h3>
                <MoistureTrendChart readings={inspection.moistureReadings} />
              </div>
            )}
          </div>
        )}

        {/* Affected Areas Tab */}
        {activeTab === "areas" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inspection.affectedAreas.length > 0 ? (
              inspection.affectedAreas.map((area) => (
                <div key={area.id} className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-neutral-900 dark:text-white">{area.roomZoneId}</h4>
                    <div className="flex gap-2">
                      {area.category && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                          Cat {area.category}
                        </span>
                      )}
                      {area.class && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                          Class {area.class}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-neutral-400 text-xs">Area</span>
                      <p className="font-medium">{area.affectedSquareFootage} sq ft</p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-xs">Water Source</span>
                      <p className="font-medium capitalize">{area.waterSource}</p>
                    </div>
                    {area.timeSinceLoss && (
                      <div>
                        <span className="text-neutral-400 text-xs">Time Since Loss</span>
                        <p className="font-medium">{area.timeSinceLoss}h</p>
                      </div>
                    )}
                  </div>
                  {area.description && (
                    <p className="text-sm text-neutral-500 dark:text-slate-400 mt-3">{area.description}</p>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center py-12 text-neutral-400">No affected areas recorded</div>
            )}
          </div>
        )}

        {/* Classification Tab */}
        {activeTab === "classification" && (
          <div className="space-y-4 max-w-3xl">
            {inspection.classifications.length > 0 ? (
              inspection.classifications.map((cls) => (
                <div key={cls.id} className="p-6 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10">
                  <div className="flex items-center gap-6 mb-4">
                    <div className="text-center">
                      <div className="text-xs text-amber-600 dark:text-amber-400 uppercase font-semibold mb-1">Category</div>
                      <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {cls.category}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">Class</div>
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {cls.class}
                      </div>
                    </div>
                    {cls.confidence && (
                      <div className="text-center">
                        <div className="text-xs text-cyan-600 dark:text-cyan-400 uppercase font-semibold mb-1">Confidence</div>
                        <div className="w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-2xl font-bold text-cyan-700 dark:text-cyan-300">
                          {cls.confidence}%
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-neutral-400 uppercase font-semibold">Justification</span>
                      <p className="text-sm text-neutral-700 dark:text-slate-300 mt-0.5">{cls.justification}</p>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 uppercase font-semibold">Standard Reference</span>
                      <p className="text-sm text-neutral-700 dark:text-slate-300 mt-0.5">{cls.standardReference}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-400">No classification data — submit the inspection to auto-classify</div>
            )}

            {/* Similar Historical Jobs from Ascora pgvector */}
            <div className="mt-6 pt-6 border-t border-neutral-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-slate-200">Similar Historical Jobs</h3>
                {isLoadingSimilarJobs && <Loader2 size={12} className="animate-spin text-cyan-500" />}
              </div>
              {!isLoadingSimilarJobs && similarJobs.length === 0 && (
                <p className="text-xs text-neutral-400">
                  No similar jobs found. Vectorise your Ascora job history in Admin → AI Lab to enable this feature.
                </p>
              )}
              {similarJobs.length > 0 && (
                <div className="space-y-2">
                  {similarJobs.map((job) => (
                    <div key={job.id} className="p-3 rounded-lg border border-neutral-100 dark:border-slate-700/50 bg-neutral-50/50 dark:bg-slate-900/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400 capitalize">
                              {job.claimType?.replace(/_/g, " ")}
                            </span>
                            {job.suburb && (
                              <span className="text-xs text-neutral-400">{job.suburb}, {job.state}</span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-600 dark:text-slate-300 mt-0.5 line-clamp-2">{job.description || "No description"}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                            <span>{job.itemCount ?? 0} items</span>
                            <span>{job.equipmentCount ?? 0} equipment</span>
                          </div>
                        </div>
                        {job.totalExTax > 0 && (
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-neutral-800 dark:text-white">
                              ${job.totalExTax.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-neutral-400">ex tax</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scope Items Tab */}
        {activeTab === "scope" && (
          <div className="space-y-6">
            {/* Actions row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={runEquipmentCalculator}
                disabled={isCalculatingEquipment}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {isCalculatingEquipment ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Layers size={12} />
                )}
                {isCalculatingEquipment ? "Calculating…" : "Auto-Calculate Equipment (IICRC S500)"}
              </button>
            </div>
            {/* Scope line items */}
            <div className="space-y-3">
              {inspection.scopeItems.length > 0 ? (
                inspection.scopeItems.map((item) => (
                  <div key={item.id} className={cn(
                    "p-4 rounded-xl border bg-white dark:bg-slate-900/50 flex items-start gap-3",
                    item.isSelected
                      ? "border-emerald-200 dark:border-emerald-800/50"
                      : "border-neutral-200 dark:border-slate-700/50 opacity-50"
                  )}>
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5",
                      item.isSelected ? "bg-emerald-500 text-white" : "bg-neutral-200 dark:bg-slate-700"
                    )}>
                      {item.isSelected && <CheckCircle2 size={14} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.description}</span>
                        {item.autoDetermined && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">Auto</span>
                        )}
                        {item.isRequired && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Required</span>
                        )}
                      </div>
                      {item.justification && (
                        <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">{item.justification}</p>
                      )}
                      {item.quantity && (
                        <p className="text-xs text-neutral-500 mt-1">Qty: {item.quantity} {item.unit}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-neutral-400 text-sm">No scope items — submit the inspection to auto-determine scope</div>
              )}
            </div>

            {/* AI Scope Narrative Generator */}
            <div className="rounded-xl border border-cyan-200/50 dark:border-cyan-800/40 bg-cyan-50/30 dark:bg-cyan-900/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-500" />
                  <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">AI Scope Narrative</h3>
                  <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
                    IICRC S500
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {scopeNarrative && (
                    <button
                      onClick={copyScopeNarrative}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {narrativeCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {narrativeCopied ? "Copied" : "Copy"}
                    </button>
                  )}
                  <button
                    onClick={generateScopeNarrative}
                    disabled={isGeneratingScope}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isGeneratingScope ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        {scopeNarrative ? "Regenerate" : "Generate"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scopeGenError && (
                <div className="text-xs text-red-600 dark:text-red-400 mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                  {scopeGenError}
                </div>
              )}

              {scopeNarrative ? (
                <div className="text-xs text-neutral-700 dark:text-slate-300 leading-relaxed font-mono whitespace-pre-wrap bg-white dark:bg-slate-900/50 rounded-lg border border-neutral-100 dark:border-slate-700/50 p-4 max-h-96 overflow-y-auto">
                  {scopeNarrative}
                  {isGeneratingScope && <span className="inline-block w-1.5 h-3.5 bg-cyan-500 animate-pulse ml-0.5 align-middle" />}
                </div>
              ) : !isGeneratingScope && (
                <p className="text-xs text-neutral-400 dark:text-slate-500">
                  Generate a 7-section IICRC S500-cited scope narrative using AI. Draws on your moisture readings, affected areas, and similar historical jobs.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cost Estimates Tab */}
        {activeTab === "costs" && (
          <div>
            {inspection.costEstimates.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Description</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Rate</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                    {inspection.costEstimates.map((cost) => (
                      <tr key={cost.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300">
                            {cost.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{cost.description}</td>
                        <td className="px-4 py-3 text-sm text-right">{cost.quantity} {cost.unit}</td>
                        <td className="px-4 py-3 text-sm text-right">${cost.rate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">${cost.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right">Total</td>
                      <td className="px-4 py-3 text-sm font-bold text-right text-emerald-600 dark:text-emerald-400">
                        ${totalCost.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">No cost estimates — submit the inspection to auto-estimate costs</div>
            )}
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div>
            {inspection.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {inspection.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-xl overflow-hidden border border-neutral-200 dark:border-slate-700/50 hover:border-cyan-400 transition-all"
                  >
                    <img
                      src={photo.thumbnailUrl || photo.url}
                      alt={photo.location || "Inspection photo"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {photo.location && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <p className="text-xs text-white truncate">{photo.location}</p>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">No photos uploaded</div>
            )}
          </div>
        )}

        {/* Sketch Tab — Fabric.js multi-floor canvas with auto-loaded property floor plan */}
        {activeTab === "sketch" && (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-800 dark:text-slate-200">Property Sketch</h2>
                <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
                  Floor plan loaded from OnTheHouse · Draw rooms, place moisture readings and equipment
                </p>
              </div>
            </div>
            <SketchEditor
              inspectionId={inspection.id}
              propertyAddress={inspection.propertyAddress}
              propertyPostcode={inspection.propertyPostcode}
              height={680}
            />
          </div>
        )}
      </div>

      {/* Pilot ease-of-use survey — shown once per technician after COMPLETED */}
      <NirPilotSurvey
        inspectionId={inspection.id}
        inspectionStatus={inspection.status}
      />
    </div>
  )
}
