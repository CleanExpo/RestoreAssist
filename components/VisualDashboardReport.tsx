"use client"

import { useState } from "react"
import { Home, Droplet, DollarSign, Gauge, Calendar, Building2, AlertTriangle, Square, Printer, Download, FileText, MapPin, Thermometer, Wind, Shield, Image as ImageIcon, User, Clock, CheckCircle } from "lucide-react"
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
  businessInfo?: {
    businessName?: string | null
    businessAddress?: string | null
    businessLogo?: string | null
    businessABN?: string | null
    businessPhone?: string | null
    businessEmail?: string | null
  }
  fullData?: any // Full structured report data for detailed pages
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

    const safeSafety = {
      trafficLight: (safety?.trafficLight === 'occupied' || safety?.trafficLight === 'vacant') 
        ? (safety.trafficLight as 'occupied' | 'vacant')
        : 'vacant' as 'occupied' | 'vacant',
      hasChildren: safety?.hasChildren || false,
      waterCategory: safety?.waterCategory || '1'
    }

    const businessInfo = data.businessInfo || {}
    const hasBusinessInfo = businessInfo.businessName || businessInfo.businessLogo

    return (
    <div id="visual-report-content" className="bg-white p-8 rounded-lg shadow-lg w-full print-content">
      {/* Print Button - Top */}
      <div className="mb-6 flex justify-end print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Report
        </button>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {hasBusinessInfo && (
              <div className="flex items-center gap-4 mb-4">
                {businessInfo.businessLogo && (
                  <img 
                    src={businessInfo.businessLogo} 
                    alt={businessInfo.businessName || "Business Logo"} 
                    className="h-16 w-auto object-contain"
                  />
                )}
                <div>
                  {businessInfo.businessName && (
                    <h1 className="text-2xl font-bold text-slate-900">{businessInfo.businessName}</h1>
                  )}
                  {businessInfo.businessAddress && (
                    <p className="text-sm text-slate-600 mt-1">{businessInfo.businessAddress}</p>
                  )}
                  <div className="flex gap-4 mt-1 text-xs text-slate-500">
                    {businessInfo.businessABN && <span>ABN: {businessInfo.businessABN}</span>}
                    {businessInfo.businessPhone && <span>Phone: {businessInfo.businessPhone}</span>}
                    {businessInfo.businessEmail && <span>Email: {businessInfo.businessEmail}</span>}
                  </div>
                </div>
              </div>
            )}
            {!hasBusinessInfo && (
              <div className="flex items-baseline gap-2 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">{safeHeader.title}</h1>
                <h2 className="text-xl font-semibold text-slate-700">{safeHeader.subtitle}</h2>
              </div>
            )}
          </div>
        </div>
        <div className="text-sm text-slate-600 space-y-1 border-t border-slate-200 pt-3">
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
      <div className="mt-6 pt-4 border-t border-slate-300 print:hidden">
        <p className="text-xs text-slate-500">Report generated by RestoreAssist v1.0</p>
      </div>

      {/* Detailed Pages Below Overview */}
      {data.fullData && (
        <DetailedReportPages fullData={data.fullData} businessInfo={data.businessInfo} />
      )}
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

// Detailed Report Pages Component
function DetailedReportPages({ fullData, businessInfo }: { fullData: any; businessInfo?: any }) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not provided'
    try {
      return new Date(dateString).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  return (
    <div className="mt-12 space-y-8 print:space-y-6">
      {/* Page Break for Print */}
      <div className="print:page-break-before-always"></div>

      {/* Page 2: Property & Incident Details */}
      <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
        <div className="border-b-2 border-slate-300 pb-4 mb-6">
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-8 h-8 text-cyan-600" />
            Property & Incident Information
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg p-6 border-2 border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-700" />
              Property Details
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-600 mb-1">Client Name</p>
                <p className="font-semibold text-slate-900">{fullData.property?.clientName || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Property Address</p>
                <p className="font-semibold text-slate-900 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {fullData.property?.propertyAddress || 'Not provided'}
                </p>
              </div>
              {fullData.property?.propertyPostcode && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Postcode</p>
                  <p className="font-semibold text-slate-900">{fullData.property.propertyPostcode}</p>
                </div>
              )}
              {fullData.property?.state && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">State</p>
                  <p className="font-semibold text-slate-900">{fullData.property.state}</p>
                </div>
              )}
              {fullData.property?.buildingAge && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Building Age</p>
                  <p className="font-semibold text-slate-900">{fullData.property.buildingAge}</p>
                </div>
              )}
              {fullData.property?.structureType && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Structure Type</p>
                  <p className="font-semibold text-slate-900">{fullData.property.structureType}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-cyan-50 rounded-lg p-6 border-2 border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-700" />
              Incident Details
            </h3>
            <div className="space-y-3">
              {fullData.incident?.dateOfLoss && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Date of Loss</p>
                  <p className="font-semibold text-slate-900">{formatDate(fullData.incident.dateOfLoss)}</p>
                </div>
              )}
              {fullData.incident?.technicianAttendanceDate && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Technician Attendance</p>
                  <p className="font-semibold text-slate-900">{formatDate(fullData.incident.technicianAttendanceDate)}</p>
                </div>
              )}
              {fullData.incident?.technicianName && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Technician</p>
                  <p className="font-semibold text-slate-900 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {fullData.incident.technicianName}
                  </p>
                </div>
              )}
              {fullData.incident?.claimReferenceNumber && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Claim Reference</p>
                  <p className="font-semibold text-slate-900">{fullData.incident.claimReferenceNumber}</p>
                </div>
              )}
              {fullData.incident?.insurerName && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Insurer</p>
                  <p className="font-semibold text-slate-900">{fullData.incident.insurerName}</p>
                </div>
              )}
              {fullData.incident?.waterSource && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Water Source</p>
                  <p className="font-semibold text-slate-900">{fullData.incident.waterSource}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {fullData.property?.accessNotes && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg p-5 border-2 border-amber-300 shadow-sm">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <p className="text-sm font-bold text-amber-900 uppercase tracking-wide">Access Notes</p>
            </div>
            <p className="text-amber-900 leading-relaxed pl-7">{fullData.property.accessNotes}</p>
          </div>
        )}
      </div>

      {/* Page 3: Environmental & Classification */}
      <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
        <div className="border-b-2 border-slate-300 pb-4 mb-6">
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Thermometer className="w-8 h-8 text-cyan-600" />
            Environmental Conditions & Classification
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {(() => {
            console.log('[VisualDashboardReport] Environmental Data Check:', {
              hasEnvironmental: !!fullData.environmental,
              environmental: fullData.environmental,
              hasTemperature: fullData.environmental?.ambientTemperature !== null && fullData.environmental?.ambientTemperature !== undefined,
              hasHumidity: fullData.environmental?.humidityLevel !== null && fullData.environmental?.humidityLevel !== undefined,
              hasDewPoint: fullData.environmental?.dewPoint !== null && fullData.environmental?.dewPoint !== undefined,
              temperature: fullData.environmental?.ambientTemperature,
              humidity: fullData.environmental?.humidityLevel,
              dewPoint: fullData.environmental?.dewPoint
            })
            const hasEnvData = fullData.environmental && (
              (fullData.environmental.ambientTemperature !== null && fullData.environmental.ambientTemperature !== undefined) ||
              (fullData.environmental.humidityLevel !== null && fullData.environmental.humidityLevel !== undefined) ||
              (fullData.environmental.dewPoint !== null && fullData.environmental.dewPoint !== undefined)
            )
            return hasEnvData
          })() ? (
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border-2 border-blue-200 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Thermometer className="w-6 h-6 text-blue-600" />
                  Environmental Data
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {fullData.environmental.ambientTemperature !== null && (
                    <div className="bg-white rounded-lg p-4 text-center border border-blue-100">
                      <Thermometer className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-600 mb-1 font-medium">Temperature</p>
                      <p className="text-2xl font-bold text-slate-900">{fullData.environmental.ambientTemperature}°F</p>
                    </div>
                  )}
                  {fullData.environmental.humidityLevel !== null && (
                    <div className="bg-white rounded-lg p-4 text-center border border-blue-100">
                      <Droplet className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-600 mb-1 font-medium">Humidity</p>
                      <p className="text-2xl font-bold text-slate-900">{fullData.environmental.humidityLevel}%</p>
                    </div>
                  )}
                  {fullData.environmental.dewPoint !== null && (
                    <div className="bg-white rounded-lg p-4 text-center border border-blue-100">
                      <Wind className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-600 mb-1 font-medium">Dew Point</p>
                      <p className="text-2xl font-bold text-slate-900">{fullData.environmental.dewPoint}°F</p>
                    </div>
                  )}
                  <div className="bg-white rounded-lg p-4 text-center border border-blue-100">
                    <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${fullData.environmental.airCirculation ? 'text-green-600' : 'text-slate-400'}`} />
                    <p className="text-xs text-slate-600 mb-1 font-medium">Air Circulation</p>
                    <p className={`text-lg font-bold ${fullData.environmental.airCirculation ? 'text-green-700' : 'text-slate-600'}`}>
                      {fullData.environmental.airCirculation ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>
          ) : (
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border-2 border-blue-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Thermometer className="w-6 h-6 text-blue-600" />
                Environmental Data
              </h3>
              <p className="text-slate-600 italic">No environmental data recorded for this inspection.</p>
            </div>
          )}

          {/* {fullData.classification ? (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border-2 border-green-200 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-green-600" />
                  IICRC Classification
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-2 font-medium">Category</p>
                    <span className="inline-block px-4 py-2 rounded-lg text-base font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      {fullData.classification.category || 'Not classified'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2 font-medium">Class</p>
                    <span className="inline-block px-4 py-2 rounded-lg text-base font-bold bg-green-100 text-green-800 border border-green-300">
                      Class {fullData.classification.class || 'Not classified'}
                    </span>
                  </div>
                  {fullData.classification.justification && (
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-xs text-slate-600 mb-1 font-semibold">Justification</p>
                      <p className="text-sm text-slate-900 leading-relaxed">{fullData.classification.justification}</p>
                    </div>
                  )}
                  {fullData.classification.standardReference && (
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-xs text-slate-600 mb-1 font-semibold">Standard Reference</p>
                      <p className="text-sm text-slate-900 font-mono">{fullData.classification.standardReference}</p>
                    </div>
                  )}
                </div>
              </div>
          ) : (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border-2 border-green-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-green-600" />
                IICRC Classification
              </h3>
              <p className="text-slate-600 italic">No classification data available.</p>
            </div>
          )} */}
        </div>

        {fullData.psychrometric ? (
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-6 border-2 border-orange-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Gauge className="w-6 h-6 text-orange-600" />
                Psychrometric Assessment
              </h3>
              <div className="grid md:grid-cols-4 gap-4 mb-4">
                {fullData.psychrometric.dryingIndex !== null && (
                  <div className="bg-white rounded-lg p-4 text-center border border-orange-200">
                    <Gauge className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 mb-1 font-medium">Drying Index</p>
                    <p className="text-3xl font-bold text-slate-900">{fullData.psychrometric.dryingIndex}</p>
                  </div>
                )}
                {fullData.psychrometric.dryingStatus && (
                  <div className="bg-white rounded-lg p-4 text-center border border-orange-200">
                    <p className="text-xs text-slate-600 mb-1 font-medium">Drying Status</p>
                    <span className="inline-block px-4 py-2 rounded-lg text-base font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
                      {fullData.psychrometric.dryingStatus.toUpperCase()}
                    </span>
                  </div>
                )}
                {fullData.psychrometric.systemType && (
                  <div className="bg-white rounded-lg p-4 text-center border border-orange-200">
                    <Wind className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 mb-1 font-medium">System Type</p>
                    <p className="text-lg font-bold text-slate-900">{fullData.psychrometric.systemType}</p>
                  </div>
                )}
                {fullData.psychrometric.temperature !== null && (
                  <div className="bg-white rounded-lg p-4 text-center border border-orange-200">
                    <Thermometer className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 mb-1 font-medium">Temperature</p>
                    <p className="text-lg font-bold text-slate-900">{fullData.psychrometric.temperature}°C</p>
                  </div>
                )}
              </div>
              {fullData.psychrometric.recommendation && (
                <div className="mt-4 pt-4 border-t-2 border-orange-300 bg-white rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-2 font-semibold">Recommendation</p>
                  <p className="text-slate-900 leading-relaxed">{fullData.psychrometric.recommendation}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-6 border-2 border-orange-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Gauge className="w-6 h-6 text-orange-600" />
                Psychrometric Assessment
              </h3>
              <p className="text-slate-600 italic">No psychrometric assessment data available.</p>
            </div>
          )}
        </div>
      )}

      {/* Page 4: Affected Areas with Photos */}
      {fullData.affectedAreas && fullData.affectedAreas.length > 0 && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-8 h-8 text-cyan-600" />
              Affected Areas
            </h2>
          </div>
          <div className="space-y-6">
            {fullData.affectedAreas.map((area: any, idx: number) => (
              <div key={idx} className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg p-6 border-2 border-slate-200 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-blue-600" />
                  {area.name || `Area ${idx + 1}`}
                </h3>
                
                {area.description && (
                  <div className="mb-4 bg-white rounded-lg p-4 border border-slate-200">
                    <p className="text-slate-900 leading-relaxed">{area.description}</p>
                  </div>
                )}

                {area.materials && area.materials.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Materials Affected</p>
                    <div className="flex flex-wrap gap-2">
                      {area.materials.map((material: string, mIdx: number) => (
                        <span key={mIdx} className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                          {material}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {area.moistureReadings && area.moistureReadings.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Moisture Readings</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {area.moistureReadings.map((reading: any, rIdx: number) => (
                        <div key={rIdx} className="bg-white rounded-lg p-3 border border-blue-200 text-center">
                          <p className="text-xs text-slate-600 mb-1">{reading.location || 'Location'}</p>
                          <p className="text-xl font-bold text-blue-700">{reading.value}{reading.unit || '%'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {area.photos && area.photos.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Photographic Documentation</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {area.photos.map((photoUrl: string, pIdx: number) => (
                        <div key={pIdx} className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-300 shadow-md">
                          <img 
                            src={photoUrl} 
                            alt={`${area.name} - Photo ${pIdx + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Page 4.5: Moisture Readings (All) */}
      {fullData.moistureReadings && fullData.moistureReadings.length > 0 && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Droplet className="w-8 h-8 text-cyan-600" />
              Moisture Readings
            </h2>
          </div>
          <div className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-cyan-100 to-blue-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Location</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Surface Type</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Moisture Level</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Depth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fullData.moistureReadings.map((reading: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-900 font-medium">{reading.location}</td>
                    <td className="px-6 py-4 text-slate-700">{reading.surfaceType || 'N/A'}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                        {reading.moistureLevel}{reading.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{reading.depth || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page 5: Scope Items */}
      {fullData.scopeItems && fullData.scopeItems.length > 0 && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-cyan-600" />
              Scope of Works
            </h2>
          </div>
          <div className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-100 to-emerald-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Description</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Quantity</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Unit</th>
                  {fullData.scopeItems.some((item: any) => item.justification) && (
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Justification</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fullData.scopeItems.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-900 font-medium">{item.description}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{item.unit}</td>
                    {fullData.scopeItems.some((i: any) => i.justification) && (
                      <td className="px-6 py-4 text-sm text-slate-600 italic">{item.justification || '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page 6: Equipment & Cost Estimates */}
      {fullData.equipment && fullData.equipment.length > 0 && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Wind className="w-8 h-8 text-cyan-600" />
              Equipment Deployment & Costs
            </h2>
          </div>
          <div className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden mb-6 shadow-sm">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-100 to-indigo-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Equipment</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Quantity</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Daily Rate</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Duration</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fullData.equipment.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-900 font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-800">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-700 font-medium">{formatCurrency(item.dailyRate)}</td>
                    <td className="px-6 py-4 text-right text-slate-700">{item.estimatedDuration} days</td>
                    <td className="px-6 py-4 text-right font-bold text-green-700">{formatCurrency(item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gradient-to-r from-slate-100 to-slate-200">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-right font-bold text-slate-900 text-lg">Total Equipment Cost</td>
                  <td className="px-6 py-4 text-right font-bold text-2xl text-green-700">
                    {formatCurrency(fullData.equipment.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {fullData.costEstimates && fullData.costEstimates.length > 0 && (
            <div className="bg-white rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-emerald-100 to-teal-100 px-6 py-3 border-b-2 border-emerald-200">
                <h3 className="text-xl font-bold text-slate-900">Cost Estimates</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gradient-to-r from-emerald-100 to-teal-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Description</th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Quantity</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-900 uppercase tracking-wide">Unit</th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Rate</th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-slate-900 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {fullData.costEstimates.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-900 font-medium">{item.description}</td>
                      <td className="px-6 py-4 text-right text-slate-700">{item.quantity}</td>
                      <td className="px-6 py-4 text-slate-700">{item.unit}</td>
                      <td className="px-6 py-4 text-right text-slate-700 font-medium">{formatCurrency(item.rate)}</td>
                      <td className="px-6 py-4 text-right font-bold text-green-700">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gradient-to-r from-slate-100 to-slate-200">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-right font-bold text-slate-900 text-lg">Total Project Cost</td>
                    <td className="px-6 py-4 text-right font-bold text-2xl text-green-700">
                      {formatCurrency(fullData.costEstimates.reduce((sum: number, item: any) => sum + (item.total || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Page 7: All Photos (General) */}
      {fullData.photos && fullData.photos.length > 0 && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-8 h-8 text-cyan-600" />
              Photographic Documentation
            </h2>
            <p className="text-slate-600 mt-2">All inspection photographs</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {fullData.photos.map((photo: any, idx: number) => (
              <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-300 shadow-md group">
                <img 
                  src={photo.url} 
                  alt={photo.caption || photo.location || `Photo ${idx + 1}`}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E'
                  }}
                />
                {(photo.caption || photo.location) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-3">
                    <p className="font-semibold">{photo.caption || photo.location}</p>
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  #{idx + 1}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center text-sm text-slate-600">
            <p>Total: {fullData.photos.length} photograph{fullData.photos.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Page 8: Hazards & Compliance */}
      {(fullData.hazards || fullData.compliance) && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-8 h-8 text-cyan-600" />
              Hazards & Compliance
            </h2>
          </div>

          {fullData.hazards && (
            <div className="mb-6 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-6 border-2 border-amber-300 shadow-sm">
              <h3 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
                Hazard Assessment
              </h3>
              <div className="space-y-3">
                {fullData.hazards.methamphetamineScreen && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Methamphetamine Screen: {fullData.hazards.methamphetamineScreen}</p>
                      {fullData.hazards.methamphetamineTestCount && (
                        <p className="text-sm text-amber-700">Test Count: {fullData.hazards.methamphetamineTestCount}</p>
                      )}
                    </div>
                  </div>
                )}
                {fullData.hazards.biologicalMouldDetected && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Biological Mould Detected: Yes</p>
                      {fullData.hazards.biologicalMouldCategory && (
                        <p className="text-sm text-amber-700">Category: {fullData.hazards.biologicalMouldCategory}</p>
                      )}
                    </div>
                  </div>
                )}
                {fullData.hazards.asbestosRisk && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <p className="font-semibold text-amber-900">Asbestos Risk: Pre-1990 building identified</p>
                  </div>
                )}
                {fullData.hazards.leadRisk && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <p className="font-semibold text-amber-900">Lead Risk: Pre-1990 building identified</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {fullData.compliance && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border-2 border-green-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-green-600" />
                Compliance Standards
              </h3>
              <ul className="space-y-3">
                {fullData.compliance.standards.map((standard: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-green-200">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-900 font-medium">{standard}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Page 9: Technician Notes */}
      {fullData.technicianNotes && (
        <div className="print:page-break-before-always bg-white p-8 rounded-lg shadow-lg print:shadow-none">
          <div className="border-b-2 border-slate-300 pb-4 mb-6">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-cyan-600" />
              Technician Field Notes
            </h2>
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg p-6 border-2 border-slate-200 shadow-sm">
            <div className="bg-white rounded-lg p-5 border border-slate-200">
              <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">{fullData.technicianNotes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Final Footer */}
      <div className="print:page-break-before-always border-t-2 border-slate-300 pt-6 mt-8">
        <div className="text-center text-sm text-slate-600">
          {businessInfo?.businessName && <p className="font-semibold text-slate-900">{businessInfo.businessName}</p>}
          {businessInfo?.businessAddress && <p>{businessInfo.businessAddress}</p>}
          {businessInfo?.businessABN && <p>ABN: {businessInfo.businessABN}</p>}
          {businessInfo?.businessPhone && <p>Phone: {businessInfo.businessPhone}</p>}
          {businessInfo?.businessEmail && <p>Email: {businessInfo.businessEmail}</p>}
          <p className="mt-4">This report was generated on {formatDate(fullData.header?.dateGenerated)}</p>
          <p className="mt-2 text-xs">© {new Date().getFullYear()} {businessInfo?.businessName || 'RestoreAssist'}. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

