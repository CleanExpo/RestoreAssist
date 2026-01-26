"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas"
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
} from "lucide-react"

type Tab = "overview" | "environmental" | "moisture" | "moisture-map" | "areas" | "classification" | "scope" | "costs" | "photos"

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
    { key: "moisture-map", label: "Moisture Map", icon: Map },
    { key: "areas", label: "Affected Areas", icon: AlertTriangle, count: inspection.affectedAreas.length },
    { key: "classification", label: "Classification", icon: Shield, count: inspection.classifications.length },
    { key: "scope", label: "Scope Items", icon: Layers, count: inspection.scopeItems.length },
    { key: "costs", label: "Cost Estimates", icon: DollarSign, count: inspection.costEstimates.length },
    { key: "photos", label: "Photos", icon: Camera, count: inspection.photos.length },
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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              {inspection.inspectionNumber}
            </h1>
            {classification && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                Category {classification.category} / Class {classification.class}
              </span>
            )}
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
                    <div className="text-lg font-semibold">{inspection.environmentalData.ambientTemperature}°F</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Humidity</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.humidityLevel}%</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Dew Point</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.dewPoint?.toFixed(1) ?? "N/A"}°F</div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Air Circulation</span>
                    <div className="text-lg font-semibold">{inspection.environmentalData.airCirculation ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>
            )}
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
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.ambientTemperature}°F</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Humidity Level</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.humidityLevel}%</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">Dew Point</label>
                    <p className="text-2xl font-bold mt-1">{inspection.environmentalData.dewPoint?.toFixed(1) ?? "Not calculated"}°F</p>
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
              <div className="text-center py-12 text-neutral-400">No moisture readings recorded</div>
            )}
          </div>
        )}

        {/* Moisture Map Tab */}
        {activeTab === "moisture-map" && (
          <div>
            {inspection.moistureReadings.length > 0 ? (
              <MoistureMappingCanvas readings={inspection.moistureReadings} />
            ) : (
              <div className="text-center py-12 text-neutral-400">No moisture readings to map — add readings first</div>
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
          </div>
        )}

        {/* Scope Items Tab */}
        {activeTab === "scope" && (
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
              <div className="text-center py-12 text-neutral-400">No scope items — submit the inspection to auto-determine scope</div>
            )}
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
      </div>
    </div>
  )
}
