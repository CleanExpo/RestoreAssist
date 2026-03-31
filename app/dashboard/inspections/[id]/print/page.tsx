"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvironmentalData {
  ambientTemperature: number
  humidityLevel: number
  dewPoint: number | null
  airCirculation: boolean
  weatherConditions: string | null
  notes: string | null
}

interface MoistureReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  notes: string | null
}

interface AffectedArea {
  id: string
  roomZoneId: string
  affectedSquareFootage: number
  waterSource: string
  timeSinceLoss: number | null
  category: string | null
  class: string | null
  description: string | null
}

interface ScopeItem {
  id: string
  itemType: string
  description: string
  quantity: number | null
  unit: string | null
  justification: string | null
  isRequired: boolean
  isSelected: boolean
  autoDetermined: boolean
}

interface CostEstimate {
  id: string
  category: string
  description: string
  quantity: number
  unit: string
  rate: number
  subtotal: number
  total: number
}

interface Classification {
  id: string
  category: string
  class: string
  justification: string
  standardReference: string
  confidence: number | null
}

interface Inspection {
  id: string
  inspectionNumber: string
  propertyAddress: string
  propertyPostcode: string
  technicianName: string | null
  status: string
  createdAt: string
  submittedAt: string | null
  environmentalData: EnvironmentalData | null
  moistureReadings: MoistureReading[]
  affectedAreas: AffectedArea[]
  scopeItems: ScopeItem[]
  classifications: Classification[]
  costEstimates: CostEstimate[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function moistureLabel(level: number): string {
  if (level < 15) return "Dry"
  if (level < 25) return "Borderline"
  return "Wet"
}

function fmtCurrency(val: number): string {
  return val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function PrintSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6 animate-pulse">
      <div className="h-10 bg-neutral-200 rounded w-2/3" />
      <div className="h-4 bg-neutral-100 rounded w-1/3" />
      <div className="h-40 bg-neutral-100 rounded" />
      <div className="h-60 bg-neutral-100 rounded" />
      <div className="h-48 bg-neutral-100 rounded" />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InspectionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/inspections/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Inspection not found")
        const data = await res.json()
        setInspection(data.inspection)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PrintSkeleton />
  if (error || !inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-neutral-500">{error ?? "Inspection not found"}</p>
        <Link href="/dashboard/inspections">
          <Button variant="outline">Back to Inspections</Button>
        </Link>
      </div>
    )
  }

  const classification = inspection.classifications?.[0] ?? null
  const selectedScope = inspection.scopeItems.filter((s) => s.isSelected)
  const subtotalCost = inspection.costEstimates.reduce((sum, c) => sum + c.subtotal, 0)
  const totalCost = inspection.costEstimates.reduce((sum, c) => sum + c.total, 0)
  const gst = totalCost / 11
  const grandTotal = totalCost
  const generatedAt = new Date().toLocaleString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <>
      {/* ── Print CSS ────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; background: white !important; }
          .page-break { page-break-before: always; }
          .print-card {
            border: 1px solid #d1d5db !important;
            box-shadow: none !important;
          }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 10px; }
          thead { background: #f9fafb !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      {/* ── Screen Top Bar ───────────────────────────────────────────────── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-neutral-200 shadow-sm flex items-center justify-between px-6 py-3">
        <Link
          href={`/dashboard/inspections/${id}`}
          className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </Link>
        <span className="text-sm font-semibold text-neutral-700">{inspection.inspectionNumber}</span>
        <Button onClick={() => window.print()} size="sm">
          Print / Save PDF
        </Button>
      </div>

      {/* ── Report Body ──────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pb-16 pt-20 print:pt-0 print:px-0 space-y-8">

        {/* ── 1. Header ───────────────────────────────────────────────────── */}
        <div className="print-card rounded-xl border border-neutral-200 bg-white p-8">
          <div className="flex items-start justify-between gap-6 mb-6">
            {/* Logo placeholder */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-bold text-lg">
                RA
              </div>
              <div>
                <div className="text-lg font-bold text-neutral-900">RestoreAssist</div>
                <div className="text-xs text-neutral-500">National Inspection Report</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-neutral-900 tracking-tight">INSPECTION SUMMARY REPORT</div>
              <div className="text-sm text-neutral-500 mt-1">Report No: {inspection.inspectionNumber}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 border-t border-neutral-100 pt-6">
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Property Address</div>
                <div className="text-sm font-medium text-neutral-900 mt-0.5">
                  {inspection.propertyAddress}, {inspection.propertyPostcode}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Inspector</div>
                <div className="text-sm font-medium text-neutral-900 mt-0.5">
                  {inspection.technicianName ?? "—"}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Inspection Date</div>
                <div className="text-sm font-medium text-neutral-900 mt-0.5">{fmtDate(inspection.createdAt)}</div>
              </div>
              {classification && (
                <div>
                  <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">IICRC Classification</div>
                  <div className="mt-0.5">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-neutral-900">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">Category {classification.category}</span>
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">Class {classification.class}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {classification && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Standard Reference: </span>
              <span className="text-xs text-amber-700">{classification.standardReference}</span>
            </div>
          )}
        </div>

        {/* ── 2. Environmental Conditions ─────────────────────────────────── */}
        {inspection.environmentalData && (
          <div className="print-card rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-4 pb-2 border-b border-neutral-100">
              Environmental Conditions
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <table className="text-sm w-full">
                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-500 font-medium">Internal Temperature</td>
                    <td className="py-2 font-semibold text-neutral-900">
                      {inspection.environmentalData.ambientTemperature}°C
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-500 font-medium">Relative Humidity</td>
                    <td className="py-2 font-semibold text-neutral-900">
                      {inspection.environmentalData.humidityLevel}%
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-500 font-medium">Dew Point</td>
                    <td className="py-2 font-semibold text-neutral-900">
                      {inspection.environmentalData.dewPoint != null
                        ? `${inspection.environmentalData.dewPoint.toFixed(1)}°C`
                        : "Not recorded"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-neutral-500 font-medium">Air Circulation</td>
                    <td className="py-2 font-semibold text-neutral-900">
                      {inspection.environmentalData.airCirculation ? "Active" : "None"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <table className="text-sm w-full">
                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-500 font-medium">Weather Conditions</td>
                    <td className="py-2 font-semibold text-neutral-900">
                      {inspection.environmentalData.weatherConditions ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-neutral-500 font-medium align-top pt-2">Notes</td>
                    <td className="py-2 text-neutral-700">
                      {inspection.environmentalData.notes ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 3. Moisture Readings ─────────────────────────────────────────── */}
        {inspection.moistureReadings.length > 0 && (
          <div className="print-card rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-4 pb-2 border-b border-neutral-100">
              Moisture Readings ({inspection.moistureReadings.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">#</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Location</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Material</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Reading %</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Standard</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Depth</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.moistureReadings.map((reading, i) => (
                    <tr
                      key={reading.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                    >
                      <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-neutral-900">{reading.location}</td>
                      <td className="px-3 py-2 capitalize text-neutral-700">{reading.surfaceType}</td>
                      <td className="px-3 py-2">
                        <span
                          className={[
                            "px-2 py-0.5 rounded-full text-xs font-semibold",
                            reading.moistureLevel < 15
                              ? "bg-emerald-100 text-emerald-700"
                              : reading.moistureLevel < 25
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700",
                          ].join(" ")}
                        >
                          {reading.moistureLevel}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{moistureLabel(reading.moistureLevel)}</td>
                      <td className="px-3 py-2 text-neutral-700">{reading.depth}</td>
                      <td className="px-3 py-2 text-neutral-500 max-w-[160px] truncate">{reading.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 4. Affected Areas ───────────────────────────────────────────── */}
        {inspection.affectedAreas.length > 0 && (
          <div className="print-card rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-4 pb-2 border-b border-neutral-100">
              Affected Areas ({inspection.affectedAreas.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {inspection.affectedAreas.map((area) => (
                <div
                  key={area.id}
                  className="border border-neutral-200 rounded-lg p-4 bg-neutral-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-neutral-900">{area.roomZoneId}</span>
                    <div className="flex gap-1.5">
                      {area.category && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                          Cat {area.category}
                        </span>
                      )}
                      {area.class && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">
                          Class {area.class}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 mb-2">
                    <div>
                      <span className="text-neutral-400">Size: </span>
                      <span className="font-medium">{area.affectedSquareFootage} sq ft</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">Water Source: </span>
                      <span className="font-medium capitalize">{area.waterSource}</span>
                    </div>
                    {area.timeSinceLoss != null && (
                      <div className="col-span-2">
                        <span className="text-neutral-400">Time Since Loss: </span>
                        <span className="font-medium">{area.timeSinceLoss}h</span>
                      </div>
                    )}
                  </div>
                  {area.description && (
                    <p className="text-xs text-neutral-500 mt-1">{area.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Scope of Works ───────────────────────────────────────────── */}
        {selectedScope.length > 0 && (
          <div className="print-card rounded-xl border border-neutral-200 bg-white p-6 page-break">
            <h2 className="text-base font-bold text-neutral-900 mb-4 pb-2 border-b border-neutral-100">
              Scope of Works ({selectedScope.length} items)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-8">#</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Unit</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">IICRC Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedScope.map((item, i) => (
                    <tr
                      key={item.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                    >
                      <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                      <td className="px-3 py-2 text-neutral-900">
                        <div className="font-medium">{item.description}</div>
                        {item.justification && (
                          <div className="text-xs text-neutral-400 mt-0.5">[{item.justification}]</div>
                        )}
                        <div className="flex gap-1 mt-1">
                          {item.isRequired && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600">Required</span>
                          )}
                          {item.autoDetermined && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-600">Auto</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-700">
                        {item.quantity ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{item.unit ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {item.justification ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 6. Cost Estimate ────────────────────────────────────────────── */}
        {inspection.costEstimates.length > 0 && (
          <div className="print-card rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-4 pb-2 border-b border-neutral-100">
              Cost Estimate
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Unit</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Rate</th>
                    <th className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.costEstimates.map((cost, i) => (
                    <tr
                      key={cost.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                    >
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">
                          {cost.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-neutral-900">{cost.description}</td>
                      <td className="px-3 py-2 text-right text-neutral-700">{cost.quantity}</td>
                      <td className="px-3 py-2 text-neutral-700">{cost.unit}</td>
                      <td className="px-3 py-2 text-right text-neutral-700">${fmtCurrency(cost.rate)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-neutral-900">${fmtCurrency(cost.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50">
                    <td colSpan={5} className="px-3 py-2 text-right text-sm text-neutral-600">Subtotal (ex. GST)</td>
                    <td className="px-3 py-2 text-right font-semibold text-neutral-900">${fmtCurrency(subtotalCost)}</td>
                  </tr>
                  <tr className="bg-neutral-50">
                    <td colSpan={5} className="px-3 py-2 text-right text-sm text-neutral-600">GST (10%)</td>
                    <td className="px-3 py-2 text-right font-semibold text-neutral-900">${fmtCurrency(gst)}</td>
                  </tr>
                  <tr className="bg-neutral-50 border-t-2 border-neutral-300">
                    <td colSpan={5} className="px-3 py-3 text-right text-sm font-bold text-neutral-900">Grand Total (inc. GST)</td>
                    <td className="px-3 py-3 text-right font-bold text-lg text-emerald-700">${fmtCurrency(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── 7. Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-neutral-200 pt-4 flex items-center justify-between text-xs text-neutral-400">
          <span>Generated by RestoreAssist — National Inspection Report Platform</span>
          <span>Generated: {generatedAt}</span>
        </div>

      </div>
    </>
  )
}
