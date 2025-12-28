"use client"

import { Image as ImageIcon, MapPin, Calendar, User, Building2, AlertTriangle, CheckCircle, Droplet, Thermometer, Wind, FileText, DollarSign, Clock, Shield, Printer } from "lucide-react"

interface RestorationInspectionReportData {
  type: string
  version: string
  generatedAt: string
  header: {
    reportTitle: string
    businessName: string | null
    businessAddress: string | null
    businessLogo: string | null
    businessABN: string | null
    businessPhone: string | null
    businessEmail: string | null
    reportNumber: string
    dateGenerated: string
  }
  property: {
    clientName: string | null
    propertyAddress: string | null
    propertyPostcode: string | null
    state: string | null
    buildingAge: string | null
    structureType: string | null
    accessNotes: string | null
  }
  incident: {
    dateOfLoss: string | null
    technicianAttendanceDate: string | null
    technicianName: string | null
    claimReferenceNumber: string | null
    insurerName: string | null
    waterSource: string | null
    waterCategory: string | null
    waterClass: string | null
    timeSinceLoss: number | null
  }
  environmental: {
    ambientTemperature: number | null
    humidityLevel: number | null
    dewPoint: number | null
    airCirculation: boolean
  } | null
  psychrometric: {
    waterClass: string | null
    temperature: number | null
    humidity: number | null
    systemType: string | null
    dryingIndex: number | null
    dryingStatus: string | null
    recommendation: string | null
  } | null
  affectedAreas: Array<{
    name: string
    description: string
    materials: string[]
    moistureReadings: Array<{ location: string; value: number; unit: string }>
    photos: string[]
  }>
  moistureReadings: Array<{
    location: string
    surfaceType: string | null
    moistureLevel: number
    depth: string | null
    unit: string
  }>
  classification: {
    category: string | null
    class: string | null
    justification: string | null
    standardReference: string | null
  } | null
  hazards: {
    methamphetamineScreen: string | null
    methamphetamineTestCount: number | null
    biologicalMouldDetected: boolean
    biologicalMouldCategory: string | null
    asbestosRisk: string | null
    leadRisk: string | null
  }
  scopeItems: Array<{
    description: string
    quantity: number
    unit: string
    justification: string | null
  }>
  costEstimates: Array<{
    description: string
    quantity: number
    unit: string
    rate: number
    subtotal: number
    total: number
  }>
  equipment: Array<{
    name: string
    type: string
    quantity: number
    dailyRate: number
    estimatedDuration: number
    totalCost: number
  }>
  photos: Array<{
    url: string
    thumbnailUrl?: string | null
    location?: string | null
    caption?: string | null
  }>
  summary: {
    roomsAffected: number
    totalCost: number
    averageMoisture: number | null
    estimatedDuration: number | null
    dryingStatus: string | null
  }
  compliance: {
    standards: string[]
    state: string | null
    buildingAuthority: string | null
    workSafetyAuthority: string | null
    epaAuthority: string | null
  }
  technicianNotes: string | null
  timeline?: {
    phase1?: {
      startDate: string | null
      endDate: string | null
      description: string
    }
    phase2?: {
      startDate: string | null
      endDate: string | null
      description: string
    }
    phase3?: {
      startDate: string | null
      endDate: string | null
      description: string
    }
  }
  recommendations: any[]
  verificationChecklist: any
}

interface RestorationInspectionReportViewerProps {
  data: RestorationInspectionReportData
}

export default function RestorationInspectionReportViewer({ data }: RestorationInspectionReportViewerProps) {
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

  const getDryingStatusColor = (status: string | null) => {
    if (!status) return 'bg-slate-200 text-slate-700'
    const lower = status.toLowerCase()
    if (lower.includes('excellent') || lower.includes('good')) return 'bg-green-100 text-green-800'
    if (lower.includes('fair')) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getWaterCategoryColor = (category: string | null) => {
    if (!category) return 'bg-slate-200 text-slate-700'
    if (category.includes('1')) return 'bg-green-100 text-green-800'
    if (category.includes('2')) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="bg-white print:bg-white">
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-break { page-break-after: always; }
          .print-avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto p-8 print:p-6 space-y-8">
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
        <div className="border-b-2 border-slate-300 pb-6 print-avoid-break">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              {data.header.businessLogo && (
                <div className="mb-4">
                  <img 
                    src={data.header.businessLogo} 
                    alt={data.header.businessName || 'Company Logo'}
                    className="h-16 object-contain"
                  />
                </div>
              )}
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                {data.header.reportTitle}
              </h1>
              <p className="text-lg text-slate-600">
                {data.header.businessName || 'RestoreAssist'}
              </p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Report Number</p>
              <p className="text-lg">{data.header.reportNumber}</p>
              <p className="mt-2">
                {formatDate(data.header.dateGenerated)}
              </p>
            </div>
          </div>
        </div>

        {/* Property Information */}
        <section className="print-avoid-break">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-600" />
            Property Information
          </h2>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600 mb-1">Client Name</p>
                <p className="font-semibold text-slate-900">{data.property.clientName || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Property Address</p>
                <p className="font-semibold text-slate-900 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {data.property.propertyAddress || 'Not provided'}
                </p>
              </div>
              {data.property.propertyPostcode && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Postcode</p>
                  <p className="font-semibold text-slate-900">{data.property.propertyPostcode}</p>
                </div>
              )}
              {data.property.state && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">State</p>
                  <p className="font-semibold text-slate-900">{data.property.state}</p>
                </div>
              )}
              {data.property.buildingAge && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Building Age</p>
                  <p className="font-semibold text-slate-900">{data.property.buildingAge}</p>
                </div>
              )}
              {data.property.structureType && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Structure Type</p>
                  <p className="font-semibold text-slate-900">{data.property.structureType}</p>
                </div>
              )}
              {data.property.accessNotes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-600 mb-1">Access Notes</p>
                  <p className="text-slate-900">{data.property.accessNotes}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Incident Details */}
        <section className="print-avoid-break">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-cyan-600" />
            Incident Details
          </h2>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <div className="grid md:grid-cols-2 gap-4">
              {data.incident.dateOfLoss && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Date of Loss</p>
                  <p className="font-semibold text-slate-900">{formatDate(data.incident.dateOfLoss)}</p>
                </div>
              )}
              {data.incident.technicianAttendanceDate && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Technician Attendance</p>
                  <p className="font-semibold text-slate-900">{formatDate(data.incident.technicianAttendanceDate)}</p>
                </div>
              )}
              {data.incident.technicianName && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Technician</p>
                  <p className="font-semibold text-slate-900 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {data.incident.technicianName}
                  </p>
                </div>
              )}
              {data.incident.claimReferenceNumber && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Claim Reference</p>
                  <p className="font-semibold text-slate-900">{data.incident.claimReferenceNumber}</p>
                </div>
              )}
              {data.incident.insurerName && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Insurer</p>
                  <p className="font-semibold text-slate-900">{data.incident.insurerName}</p>
                </div>
              )}
              {data.incident.waterSource && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Water Source</p>
                  <p className="font-semibold text-slate-900">{data.incident.waterSource}</p>
                </div>
              )}
              {data.incident.waterCategory && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Water Category</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getWaterCategoryColor(data.incident.waterCategory)}`}>
                    {data.incident.waterCategory}
                  </span>
                </div>
              )}
              {data.incident.waterClass && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Water Class</p>
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                    Class {data.incident.waterClass}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Environmental Conditions */}
        {data.environmental && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Thermometer className="w-6 h-6 text-cyan-600" />
              Environmental Conditions
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="grid md:grid-cols-4 gap-4">
                {data.environmental.ambientTemperature !== null && (
                  <div className="text-center">
                    <Thermometer className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 mb-1">Temperature</p>
                    <p className="text-2xl font-bold text-slate-900">{data.environmental.ambientTemperature}°F</p>
                  </div>
                )}
                {data.environmental.humidityLevel !== null && (
                  <div className="text-center">
                    <Droplet className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 mb-1">Humidity</p>
                    <p className="text-2xl font-bold text-slate-900">{data.environmental.humidityLevel}%</p>
                  </div>
                )}
                {data.environmental.dewPoint !== null && (
                  <div className="text-center">
                    <Wind className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 mb-1">Dew Point</p>
                    <p className="text-2xl font-bold text-slate-900">{data.environmental.dewPoint}°F</p>
                  </div>
                )}
                <div className="text-center">
                  <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${data.environmental.airCirculation ? 'text-green-600' : 'text-slate-400'}`} />
                  <p className="text-sm text-slate-600 mb-1">Air Circulation</p>
                  <p className={`text-lg font-semibold ${data.environmental.airCirculation ? 'text-green-700' : 'text-slate-600'}`}>
                    {data.environmental.airCirculation ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* IICRC Classification */}
        {data.classification && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-cyan-600" />
              IICRC Classification
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Category</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getWaterCategoryColor(data.classification.category)}`}>
                    {data.classification.category || 'Not classified'}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Class</p>
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                    Class {data.classification.class || 'Not classified'}
                  </span>
                </div>
                {data.classification.justification && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-600 mb-1">Justification</p>
                    <p className="text-slate-900">{data.classification.justification}</p>
                  </div>
                )}
                {data.classification.standardReference && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-600 mb-1">Standard Reference</p>
                    <p className="text-slate-900 font-mono text-sm">{data.classification.standardReference}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Psychrometric Assessment */}
        {data.psychrometric && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Wind className="w-6 h-6 text-cyan-600" />
              Psychrometric Assessment
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                {data.psychrometric.dryingIndex !== null && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">Drying Index</p>
                    <p className="text-3xl font-bold text-slate-900">{data.psychrometric.dryingIndex}</p>
                  </div>
                )}
                {data.psychrometric.dryingStatus && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">Drying Status</p>
                    <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${getDryingStatusColor(data.psychrometric.dryingStatus)}`}>
                      {data.psychrometric.dryingStatus}
                    </span>
                  </div>
                )}
                {data.psychrometric.systemType && (
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">System Type</p>
                    <p className="text-lg font-semibold text-slate-900">{data.psychrometric.systemType}</p>
                  </div>
                )}
              </div>
              {data.psychrometric.recommendation && (
                <div className="mt-4 pt-4 border-t border-slate-300">
                  <p className="text-sm text-slate-600 mb-1">Recommendation</p>
                  <p className="text-slate-900">{data.psychrometric.recommendation}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Affected Areas */}
        {data.affectedAreas.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-cyan-600" />
              Affected Areas
            </h2>
            <div className="space-y-4">
              {data.affectedAreas.map((area, idx) => (
                <div key={idx} className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">{area.name}</h3>
                  {area.description && (
                    <p className="text-slate-700 mb-3">{area.description}</p>
                  )}
                  {area.moistureReadings.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Moisture Readings</p>
                      <div className="grid md:grid-cols-3 gap-2">
                        {area.moistureReadings.map((reading, rIdx) => (
                          <div key={rIdx} className="bg-white rounded p-2 border border-slate-200">
                            <p className="text-xs text-slate-600">{reading.location}</p>
                            <p className="text-lg font-bold text-slate-900">{reading.value}{reading.unit}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {area.photos.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Photos</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {area.photos.map((photoUrl, pIdx) => (
                          <div key={pIdx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                            <img 
                              src={photoUrl} 
                              alt={`${area.name} - Photo ${pIdx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Moisture Readings */}
        {data.moistureReadings.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Droplet className="w-6 h-6 text-cyan-600" />
              Moisture Readings
            </h2>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Location</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Surface Type</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Moisture Level</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.moistureReadings.map((reading, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{reading.location}</td>
                      <td className="px-4 py-3 text-slate-700">{reading.surfaceType || 'N/A'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{reading.moistureLevel}{reading.unit}</td>
                      <td className="px-4 py-3 text-slate-700">{reading.depth || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Hazards */}
        {(data.hazards.methamphetamineScreen || data.hazards.biologicalMouldDetected || data.hazards.asbestosRisk || data.hazards.leadRisk) && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              Hazard Assessment
            </h2>
            <div className="bg-amber-50 rounded-lg p-6 border-2 border-amber-200">
              <div className="space-y-3">
                {data.hazards.methamphetamineScreen && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Methamphetamine Screen: {data.hazards.methamphetamineScreen}</p>
                      {data.hazards.methamphetamineTestCount && (
                        <p className="text-sm text-amber-700">Test Count: {data.hazards.methamphetamineTestCount}</p>
                      )}
                    </div>
                  </div>
                )}
                {data.hazards.biologicalMouldDetected && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Biological Mould Detected: Yes</p>
                      {data.hazards.biologicalMouldCategory && (
                        <p className="text-sm text-amber-700">Category: {data.hazards.biologicalMouldCategory}</p>
                      )}
                    </div>
                  </div>
                )}
                {data.hazards.asbestosRisk && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <p className="font-semibold text-amber-900">Asbestos Risk: Pre-1990 building identified</p>
                  </div>
                )}
                {data.hazards.leadRisk && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <p className="font-semibold text-amber-900">Lead Risk: Pre-1990 building identified</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Scope Items */}
        {data.scopeItems.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-cyan-600" />
              Scope of Works
            </h2>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Quantity</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Unit</th>
                    {data.scopeItems.some(item => item.justification) && (
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Justification</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.scopeItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{item.description}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{item.quantity}</td>
                      <td className="px-4 py-3 text-slate-700">{item.unit}</td>
                      {data.scopeItems.some(i => i.justification) && (
                        <td className="px-4 py-3 text-sm text-slate-600">{item.justification || '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Equipment */}
        {data.equipment.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Wind className="w-6 h-6 text-cyan-600" />
              Equipment Deployment
            </h2>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Equipment</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Quantity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Daily Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Duration</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.equipment.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(item.dailyRate)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.estimatedDuration} days</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-bold text-slate-900">Total Equipment Cost</td>
                    <td className="px-4 py-3 text-right font-bold text-lg text-slate-900">
                      {formatCurrency(data.equipment.reduce((sum, item) => sum + item.totalCost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* Cost Estimates */}
        {data.costEstimates.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-cyan-600" />
              Cost Estimates
            </h2>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Quantity</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Unit</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Subtotal</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.costEstimates.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-slate-700">{item.unit}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(item.rate)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(item.subtotal)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-bold text-slate-900">Total Project Cost</td>
                    <td className="px-4 py-3 text-right font-bold text-lg text-slate-900">
                      {formatCurrency(data.costEstimates.reduce((sum, item) => sum + item.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* Photos */}
        {data.photos.length > 0 && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-cyan-600" />
              Photographic Documentation
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {data.photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                  <img 
                    src={photo.url} 
                    alt={photo.caption || photo.location || `Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error(`[RestorationInspectionReportViewer] Failed to load image: ${photo.url}`)
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E'
                    }}
                    onLoad={() => {
                      console.log(`[RestorationInspectionReportViewer] Successfully loaded image: ${photo.url}`)
                    }}
                  />
                  {(photo.caption || photo.location) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2">
                      {photo.caption || photo.location}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Summary */}
        <section className="print-avoid-break">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-600" />
            Summary
          </h2>
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg p-6 border-2 border-cyan-200">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-slate-600 mb-1">Rooms Affected</p>
                <p className="text-3xl font-bold text-slate-900">{data.summary.roomsAffected}</p>
              </div>
              {data.summary.averageMoisture !== null && (
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">Average Moisture</p>
                  <p className="text-3xl font-bold text-slate-900">{data.summary.averageMoisture.toFixed(1)}%</p>
                </div>
              )}
              {data.summary.estimatedDuration !== null && (
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">Estimated Duration</p>
                  <p className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-1">
                    <Clock className="w-6 h-6" />
                    {data.summary.estimatedDuration} days
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-sm text-slate-600 mb-1">Total Cost</p>
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(data.summary.totalCost)}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Compliance Standards */}
        <section className="print-avoid-break">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-600" />
            Compliance Standards
          </h2>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <ul className="space-y-2">
              {data.compliance.standards.map((standard, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-900">{standard}</span>
                </li>
              ))}
            </ul>
            {data.compliance.state && (
              <div className="mt-4 pt-4 border-t border-slate-300">
                <p className="text-sm text-slate-600 mb-2">State-Specific Authorities</p>
                <div className="grid md:grid-cols-2 gap-2 text-sm">
                  {data.compliance.buildingAuthority && (
                    <p className="text-slate-700"><span className="font-semibold">Building Authority:</span> {data.compliance.buildingAuthority}</p>
                  )}
                  {data.compliance.workSafetyAuthority && (
                    <p className="text-slate-700"><span className="font-semibold">Work Safety Authority:</span> {data.compliance.workSafetyAuthority}</p>
                  )}
                  {data.compliance.epaAuthority && (
                    <p className="text-slate-700"><span className="font-semibold">EPA Authority:</span> {data.compliance.epaAuthority}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Timeline Estimation */}
        {data.timeline && (data.timeline.phase1?.startDate || data.timeline.phase2?.startDate || data.timeline.phase3?.startDate) && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-cyan-600" />
              Timeline Estimation
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="space-y-4">
                {data.timeline.phase1?.startDate && (
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h3 className="font-semibold text-slate-900 mb-1">Phase 1: Make-safe</h3>
                    <p className="text-sm text-slate-700">
                      {formatDate(data.timeline.phase1.startDate)}
                      {data.timeline.phase1.endDate && ` - ${formatDate(data.timeline.phase1.endDate)}`}
                    </p>
                  </div>
                )}
                {data.timeline.phase2?.startDate && (
                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="font-semibold text-slate-900 mb-1">Phase 2: Remediation/Drying</h3>
                    <p className="text-sm text-slate-700">
                      {formatDate(data.timeline.phase2.startDate)}
                      {data.timeline.phase2.endDate && ` - ${formatDate(data.timeline.phase2.endDate)}`}
                    </p>
                  </div>
                )}
                {data.timeline.phase3?.startDate && (
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h3 className="font-semibold text-slate-900 mb-1">Phase 3: Verification</h3>
                    <p className="text-sm text-slate-700">
                      {formatDate(data.timeline.phase3.startDate)}
                      {data.timeline.phase3.endDate && ` - ${formatDate(data.timeline.phase3.endDate)}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Technician Notes */}
        {data.technicianNotes && (
          <section className="print-avoid-break">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-cyan-600" />
              Technician Field Notes
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <p className="text-slate-900 whitespace-pre-wrap">{data.technicianNotes}</p>
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="border-t-2 border-slate-300 pt-6 mt-8 print-avoid-break">
          <div className="text-center text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{data.header.businessName || 'RestoreAssist'}</p>
            {data.header.businessAddress && <p>{data.header.businessAddress}</p>}
            {data.header.businessABN && <p>ABN: {data.header.businessABN}</p>}
            {data.header.businessPhone && <p>Phone: {data.header.businessPhone}</p>}
            {data.header.businessEmail && <p>Email: {data.header.businessEmail}</p>}
            <p className="mt-4">This report was generated on {formatDate(data.header.dateGenerated)}</p>
            <p className="mt-2 text-xs">© {new Date().getFullYear()} {data.header.businessName || 'RestoreAssist'}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

