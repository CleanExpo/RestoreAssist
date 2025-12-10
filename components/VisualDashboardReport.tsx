"use client"

import { useState } from "react"
import { Home, Droplet, DollarSign, Gauge, Calendar, Building2, AlertTriangle, Square, Printer, Download } from "lucide-react"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

interface VisualReportData {
  header: {
    title: string
    subtitle: string
    claimRef: string
    location: string
    date: string
    occupancy: string
    occupancyDetails: string
  }
  summaryMetrics: {
    roomsAffected: number
    materialsAffected: string
    moistureLevel: number
    totalCost: number
    dryingStatus: string
    totalLitresExtracted: string
    estimatedDuration: number
    dryingIndex: number
  }
  safety: {
    trafficLight: 'occupied' | 'vacant'
    hasChildren: boolean
    waterCategory: string
  }
  roomDetails: Array<{
    name: string
    materials: string
    moisture: number
    targetMoisture: number
    status: string
    scopeOfWork: string
    equipment: string[]
  }>
  complianceStandards: string[]
  equipmentCosts: Array<{
    type: string
    qty: number
    ratePerDay: number
    total: number
  }>
  estimatedDays: number
}

interface VisualDashboardReportProps {
  data: VisualReportData
}

export default function VisualDashboardReport({ data }: VisualDashboardReportProps) {

  const handlePrint = () => {
    window.print()
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">Error: No data provided</div>
        <pre className="text-xs bg-slate-100 p-4 rounded overflow-auto text-left max-w-4xl mx-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    )
  }

  try {
    const { 
      header, 
      summaryMetrics, 
      safety, 
      roomDetails = [], 
      complianceStandards = [], 
      equipmentCosts = [], 
      estimatedDays = 0 
    } = data

    // Provide defaults for missing required fields
    const safeHeader = {
      title: header?.title || 'Restore Assist',
      subtitle: header?.subtitle || 'Inspection Report',
      claimRef: header?.claimRef || 'N/A',
      location: header?.location || '',
      date: header?.date || new Date().toLocaleDateString('en-AU'),
      occupancy: header?.occupancy || 'Unknown',
      occupancyDetails: header?.occupancyDetails || ''
    }

    const safeSummaryMetrics = {
      roomsAffected: summaryMetrics?.roomsAffected ?? 0,
      materialsAffected: summaryMetrics?.materialsAffected || 'Not specified',
      moistureLevel: summaryMetrics?.moistureLevel ?? 0,
      totalCost: summaryMetrics?.totalCost ?? 0,
      dryingStatus: summaryMetrics?.dryingStatus || 'Unknown',
      totalLitresExtracted: summaryMetrics?.totalLitresExtracted || '0 L',
      estimatedDuration: summaryMetrics?.estimatedDuration ?? 0,
      dryingIndex: summaryMetrics?.dryingIndex ?? 0
    }
    console.log("safeSummaryMetrics", safeSummaryMetrics)

    const safeSafety = {
      trafficLight: (safety?.trafficLight === 'occupied' || safety?.trafficLight === 'vacant') 
        ? (safety.trafficLight as 'occupied' | 'vacant')
        : 'vacant' as 'occupied' | 'vacant',
      hasChildren: safety?.hasChildren || false,
      waterCategory: safety?.waterCategory || '1'
    }

    return (
    <div id="visual-report-content" className="bg-white p-8 rounded-lg shadow-lg w-full print-content">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-baseline gap-2 mb-2">
          <h1 className="text-2xl font-bold text-slate-900">{safeHeader.title}</h1>
          <h2 className="text-xl font-semibold text-slate-700">{safeHeader.subtitle}</h2>
        </div>
        <div className="text-sm text-slate-600 space-y-1">
          <p><strong>Claim Ref:</strong> {safeHeader.claimRef} {safeHeader.location && `| ${safeHeader.location}`}</p>
          <p><strong>Date:</strong> {safeHeader.date}</p>
          <p><strong>Occupancy:</strong> {safeHeader.occupancy}{safeHeader.occupancyDetails && ` (${safeHeader.occupancyDetails})`}</p>
        </div>
      </div>

      {/* Summary Metrics Grid - 8 cards in 4x2 layout */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Row 1 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              <Square className="w-4 h-4 text-blue-600 fill-blue-600" />
              <Square className="w-4 h-4 text-blue-600 fill-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-700">Rooms Affected</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{safeSummaryMetrics.roomsAffected}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              <Square className="w-4 h-4 text-blue-600 fill-blue-600" />
              <Square className="w-4 h-4 text-blue-600 fill-blue-600" />
              <Square className="w-4 h-4 text-blue-600 fill-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-700">Materials Affected</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">{safeSummaryMetrics.materialsAffected}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Droplet className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">Moisture Level</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">Avg. {safeSummaryMetrics.moistureLevel}%</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-6 h-6 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">Total Cost</span>
          </div>
          <p className="text-2xl font-bold text-green-600">${safeSummaryMetrics.totalCost.toLocaleString()}</p>
        </div>

        {/* Row 2 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-medium text-slate-700">Drying Status</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{safeSummaryMetrics.dryingStatus}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Droplet className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">Total Litres Extracted</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{safeSummaryMetrics.totalLitresExtracted}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">Estimated Duration</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{safeSummaryMetrics.estimatedDuration} Days</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">Drying Index</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{safeSummaryMetrics.dryingIndex}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* State Compliance & Standards */}
        <div className="col-span-2 bg-blue-600 text-white rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4 uppercase">STATE COMPLIANCE & STANDARDS</h3>
          <ul className="space-y-2">
            {complianceStandards.map((standard, idx) => (
              <li key={idx} className="flex items-start">
                <span className="mr-2">•</span>
                <span>{standard}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Safety & Water Category Panel */}
        <div className="space-y-4">
          <div className="bg-slate-100 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Safety Traffic Light</h3>
            <div className="flex flex-col items-center">
              <div className="flex flex-col gap-1 mb-2">
                <div className={`w-8 h-8 rounded-full ${safeSafety.trafficLight === 'occupied' ? 'bg-orange-500' : 'bg-slate-300'}`}></div>
                <div className={`w-8 h-8 rounded-full ${safeSafety.hasChildren ? 'bg-teal-500' : 'bg-slate-300'}`}></div>
              </div>
              <p className="text-xs text-slate-600 text-center">
                {safeSafety.trafficLight === 'occupied' ? 'Occupied' : 'Vacant'}
                {safeSafety.hasChildren && ' + Children'}
              </p>
            </div>
          </div>

          <div className="bg-slate-100 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Category of Water</h3>
            <div className="flex items-center justify-center">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">{safeSafety.waterCategory}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Room Details */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {roomDetails.map((room, idx) => (
          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-lg font-bold text-slate-900 mb-3">{room.name}</h3>
            <div className="space-y-2 text-sm text-black">
              <p><strong>Materials:</strong> {room.materials}</p>
              <p><strong>Moisture:</strong> {room.moisture}% - Target: {room.targetMoisture}%</p>
              <p><strong>Current moisture:</strong> {room.status}</p>
              <p><strong>Scope of work:</strong> {room.scopeOfWork}</p>
              <div className="mt-2">
                <strong>Equipment:</strong>
                <ul className="list-disc list-inside ml-2">
                  {room.equipment.map((eq, eqIdx) => (
                    <li key={eqIdx}>{eq}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overall Status / Warning Panel & Cost & Forecast */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Overall Status */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Overall Status / Warning Panel</h3>
          <div className="flex flex-col items-center">
            <div className="relative w-32 h-16 mb-4">
              <svg className="w-full h-full" viewBox="0 0 100 50">
                <path
                  d="M 10 40 A 40 40 0 0 1 90 40"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                />
                <path
                  d="M 10 40 A 40 40 0 0 1 50 10"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="8"
                />
                <path
                  d="M 50 10 A 40 40 0 0 1 90 40"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="8"
                />
                <line
                  x1="50"
                  y1="10"
                  x2="50"
                  y2="40"
                  stroke="#6366f1"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
              </svg>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 10 3, 0 6" fill="#6366f1" />
                </marker>
              </defs>
            </div>
            <p className="text-2xl font-bold text-slate-900">{safeSummaryMetrics.dryingIndex}</p>
            <p className="text-lg font-semibold text-slate-700">{safeSummaryMetrics.dryingStatus.toUpperCase()}</p>
            {safeSafety.trafficLight === 'occupied' && safeSafety.hasChildren && (
              <div className="mt-4 bg-amber-100 border-2 border-amber-400 rounded-lg p-3 w-full">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-900">Amber: Occupied: Children Present</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cost & Forecast */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2 uppercase">COST & FORECAST</h3>
          <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase">EQUIPMENT</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-2 px-2 font-semibold text-slate-700">QTY</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-700">RATE/DAY</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-700">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {equipmentCosts.map((cost, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-2 px-2 text-slate-900">{cost.type} ({cost.qty})</td>
                    <td className="py-2 px-2 text-green-600 font-semibold">${cost.ratePerDay.toFixed(2)}</td>
                    <td className="py-2 px-2 text-green-600 font-semibold">${cost.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-slate-600"><strong>Total reserve:</strong> {estimatedDays} days</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-slate-300 flex justify-between items-center print:hidden">
        <p className="text-xs text-slate-500">Report generated by RestoreAssist v1.0</p>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>

        </div>
      </div>
    </div>
    )
  } catch (error) {
    console.error('Error rendering VisualDashboardReport:', error)
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">Error rendering report</div>
        <pre className="text-xs bg-slate-100 p-4 rounded overflow-auto text-left">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    )
  }
}

