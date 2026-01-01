"use client"

import { AlertTriangle, Building2, Calendar, CheckCircle, ClipboardCheck, DollarSign, Droplet, FileText, HardHat, Image as ImageIcon, Shield, Thermometer, User, Wind, Wrench } from "lucide-react"
import { useState } from "react"

interface RestorationInspectionReportData {
  type: string
  version: string
  generatedAt: string
  reportDepthLevel?: string | null
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
    clientCompany: string | null
    propertyAddress: string | null
    propertyPostcode: string | null
    state: string | null
    buildingAge: string | null
    structureType: string | null
    accessNotes: string | null
    propertyId?: string | null
    jobNumber?: string | null
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
    category?: string | null
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
  reportInstructions?: string | null
  clientContactDetails?: string | null
  builderDeveloper?: {
    companyName?: string | null
    contact?: string | null
    address?: string | null
    phone?: string | null
  }
  ownerManagement?: {
    contactName?: string | null
    phone?: string | null
    email?: string | null
  }
  maintenanceHistory?: {
    lastInspectionDate?: string | null
    buildingChangedSinceLastInspection?: string | null
    structureChangesSinceLastInspection?: string | null
    previousLeakage?: string | null
    emergencyRepairPerformed?: string | null
  }
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
  tier1?: any
  tier2?: any
  tier3?: any
}

interface RestorationInspectionReportViewerProps {
  data: RestorationInspectionReportData
}

export default function RestorationInspectionReportViewer({ data }: RestorationInspectionReportViewerProps) {
  const [detailedAnalysis, setDetailedAnalysis] = useState<any>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not provided'
    try {
      return new Date(dateString).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const formatDateLong = (dateString: string | null) => {
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

  // Generate detailed observations text
  const generateObservations = () => {
    const observations: string[] = []
    
    if (data.summary.roomsAffected > 0) {
      observations.push(`${data.summary.roomsAffected} room(s) affected by water damage`)
    }
    
    if (data.incident.waterCategory) {
      observations.push(`Water category: ${data.incident.waterCategory}`)
    }
    
    if (data.incident.waterClass) {
      observations.push(`Water class: ${data.incident.waterClass}`)
    }
    
    if (data.summary.averageMoisture) {
      observations.push(`Average moisture reading: ${data.summary.averageMoisture.toFixed(1)}%`)
    }
    
    if (data.hazards.biologicalMouldDetected) {
      observations.push(`Biological mould detected${data.hazards.biologicalMouldCategory ? ` (${data.hazards.biologicalMouldCategory})` : ''}`)
    }
    
    if (data.hazards.asbestosRisk) {
      observations.push('Potential asbestos risk identified (pre-1990 building)')
    }
    
    if (data.hazards.leadRisk) {
      observations.push('Potential lead risk identified (pre-1990 building)')
    }
    
    if (data.summary.estimatedDuration) {
      observations.push(`Estimated restoration duration: ${data.summary.estimatedDuration} days`)
    }
    
    if (data.psychrometric?.dryingStatus) {
      observations.push(`Drying status: ${data.psychrometric.dryingStatus}`)
    }
    
    if (observations.length === 0) {
      return 'Comprehensive inspection and assessment completed. Detailed findings are documented in the following pages.'
    }
    
    return observations.join('. ') + '.'
  }

  const getComplianceStandards = () => {
    const standards = data.compliance?.standards || []
    if (standards.length === 0) {
      return [
        'IICRC S500 (Water Damage Restoration)',
        'IICRC S520 (Mould Remediation)',
        'Work Health and Safety Act 2011',
        'National Construction Code (NCC)',
        'AS/NZS 3000 (Electrical wiring rules)'
      ]
    }
    return standards
  }

  // Generate professional narrative summary using standards-based language
  const generateProfessionalSummary = () => {
    const summaryParts: string[] = []
    
    // Opening statement
    summaryParts.push(`This professional restoration inspection report has been prepared in accordance with IICRC S500 (Water Damage Restoration) standards and relevant Australian regulations including the National Construction Code (NCC) and Work Health and Safety Act 2011.`)
    
    // Incident overview
    if (data.incident.dateOfLoss) {
      summaryParts.push(`The water damage incident occurred on ${formatDateLong(data.incident.dateOfLoss)}.`)
    }
    
    if (data.incident.waterSource) {
      summaryParts.push(`The source of water ingress has been identified as ${data.incident.waterSource.toLowerCase()}.`)
    }
    
    // Water classification per IICRC S500
    if (data.incident.waterCategory && data.incident.waterClass) {
      summaryParts.push(`In accordance with IICRC S500 classification standards, the water has been categorised as ${data.incident.waterCategory} and classified as ${data.incident.waterClass}.`)
    }
    
    // Affected areas
    if (data.summary.roomsAffected > 0) {
      summaryParts.push(`The inspection has identified ${data.summary.roomsAffected} room${data.summary.roomsAffected > 1 ? 's' : ''} affected by water damage.`)
    }
    
    // Moisture assessment
    if (data.summary.averageMoisture !== null) {
      const moistureLevel = data.summary.averageMoisture
      if (moistureLevel > 20) {
        summaryParts.push(`Moisture readings indicate significant saturation with an average moisture level of ${moistureLevel.toFixed(1)}%, requiring immediate remediation in accordance with IICRC S500 protocols.`)
      } else if (moistureLevel > 15) {
        summaryParts.push(`Moisture assessment reveals elevated moisture levels averaging ${moistureLevel.toFixed(1)}%, necessitating structured drying procedures per IICRC S500 guidelines.`)
      } else {
        summaryParts.push(`Moisture readings show average levels of ${moistureLevel.toFixed(1)}%, indicating moderate water impact requiring monitoring and controlled drying.`)
      }
    }
    
    // Psychrometric assessment
    if (data.psychrometric?.dryingStatus) {
      summaryParts.push(`Psychrometric analysis indicates a ${data.psychrometric.dryingStatus.toLowerCase()} drying condition.`)
    }
    
    // Hazards assessment
    if (data.hazards.biologicalMouldDetected) {
      summaryParts.push(`Biological mould growth has been detected${data.hazards.biologicalMouldCategory ? `, categorised as ${data.hazards.biologicalMouldCategory}` : ''}, requiring compliance with IICRC S520 (Mould Remediation) standards and appropriate containment protocols.`)
    }
    
    if (data.hazards.asbestosRisk) {
      summaryParts.push(`Given the building's age (pre-1990), potential asbestos-containing materials may be present, requiring assessment in accordance with Work Health and Safety Regulations 2011 before any demolition or structural work.`)
    }
    
    if (data.hazards.leadRisk) {
      summaryParts.push(`Lead-based materials may be present in this pre-1990 structure, necessitating appropriate safety measures per Work Health and Safety Regulations 2011.`)
    }
    
    // Equipment and remediation
    if (data.equipment && data.equipment.length > 0) {
      const totalEquipment = data.equipment.reduce((sum, item) => sum + item.quantity, 0)
      summaryParts.push(`Remediation equipment has been deployed, including ${totalEquipment} unit${totalEquipment > 1 ? 's' : ''} of specialised drying equipment, in compliance with IICRC S500 equipment placement and operational guidelines.`)
    }
    
    // Duration and cost
    if (data.summary.estimatedDuration) {
      summaryParts.push(`The estimated restoration duration is ${data.summary.estimatedDuration} day${data.summary.estimatedDuration > 1 ? 's' : ''}, subject to ongoing monitoring and verification per IICRC S500 completion criteria.`)
    }
    
    if (data.summary.totalCost > 0) {
      summaryParts.push(`The preliminary cost estimate for remediation works is ${formatCurrency(data.summary.totalCost)}, inclusive of equipment, labour, and materials required for compliance with Australian restoration standards.`)
    }
    
    // Compliance statement
    summaryParts.push(`All remediation procedures will be conducted in strict compliance with IICRC S500 standards, National Construction Code requirements, Work Health and Safety Act 2011, and AS/NZS 3000 electrical safety standards where applicable.`)
    
    // Closing
    summaryParts.push(`Detailed findings, recommendations, and compliance documentation are provided in the following sections of this report.`)
    
    return summaryParts.join(' ')
  }

  return (
    <>
      {/* Print Styles - Professional A4 Formatting */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm;
            /* Remove browser-added URL and page info */
            margin-bottom: 20mm !important;
            /* Disable browser headers and footers */
            marks: none;
          }

          html, body {
            width: 210mm;
            height: auto;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          /* Hide any browser-added URLs or page info */
          body::after,
          body::before,
          html::after,
          html::before {
            display: none !important;
            content: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          #inspection-report-content,
          #inspection-report-content * {
            visibility: visible !important;
          }

          #inspection-report-content {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            max-width: 210mm !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-page-break {
            page-break-before: always !important;
          }

          .print-avoid-break {
            page-break-inside: avoid !important;
          }

          h1 {
            font-size: 24pt !important;
            line-height: 1.2 !important;
            margin-bottom: 10mm !important;
          }

          h2 {
            font-size: 18pt !important;
            margin-top: 8mm !important;
            margin-bottom: 6mm !important;
          }

          h3 {
            font-size: 14pt !important;
            margin-top: 6mm !important;
            margin-bottom: 4mm !important;
          }

          p, li, td {
            font-size: 10.5pt !important;
            line-height: 1.5 !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          .print\\:hidden {
            display: none !important;
          }

          /* Position footers at bottom of each page */
          .print-page {
            position: relative;
            min-height: calc(100vh - 40mm);
            display: flex;
            flex-direction: column;
          }

          .print-page-footer {
            margin-top: auto;
            padding-top: 8mm;
            padding-bottom: 5mm;
            border-top: 1px solid #cbd5e1;
            text-align: center;
            font-size: 9pt !important;
            color: #94a3b8;
            font-style: italic;
          }

          /* For middle pages, add footer that appears at page bottom */
          .print-page-middle-footer {
            margin-top: 15mm;
            padding-top: 5mm;
            border-top: 1px solid #cbd5e1;
            text-align: center;
            font-size: 9pt !important;
            color: #94a3b8;
            font-style: italic;
            page-break-inside: avoid;
          }
        }
      `}} />

      <div id="inspection-report-content" className="bg-white text-slate-900 max-w-5xl mx-auto p-8 print:p-0">
        {/* PAGE 1: PROFESSIONAL COVER PAGE */}
        <div className="min-h-[297mm] print:min-h-0 flex flex-col print-page">
          {/* Header with Logo/Branding */}
          <div className="mb-8 print:mb-6">
            {data.header.businessLogo && (
              <div className="mb-4 print:mb-3">
                <img 
                  src={data.header.businessLogo} 
                  alt={data.header.businessName || "Business Logo"} 
                  className="h-16 print:h-12 w-auto object-contain"
                />
              </div>
            )}
            <div className="text-center print:text-left mb-2 print:mb-1">
              <p className="text-xs print:text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                {data.header.businessName || 'RESTORATION INSPECTION REPORTS'}
              </p>
            </div>
          </div>

          {/* Main Title */}
          <div className="text-center mb-12 print:mb-8">
            <h1 className="text-4xl print:text-3xl font-bold text-slate-900 mb-3 print:mb-2">
              {data.header.businessName || 'Professional Restoration'}
            </h1>
            <h2 className="text-2xl print:text-xl font-semibold text-slate-700 mb-4 print:mb-3">
              Professional Restoration Inspection Report
            </h2>
          </div>

          {/* Prepared By Section */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-900 font-semibold mb-2 print:mb-1">
              Prepared By:
            </p>
            <p className="text-base print:text-sm text-slate-700">
              {data.incident.technicianName || data.header.businessName || 'Not provided'}
            </p>
          </div>

          {/* Prepared For Section - Table Format */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-900 font-semibold mb-3 print:mb-2">
              Prepared for:
            </p>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">CLIENT NAME:</td>
                  <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">
                    {data.property.clientName || data.property.clientCompany || 'Not provided'}
                  </td>
                </tr>
                {data.property.propertyId && (
                  <tr>
                    <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">PROPERTY ID:</td>
                    <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">{data.property.propertyId}</td>
                  </tr>
                )}
                {data.property.jobNumber && (
                  <tr>
                    <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">JOB NO:</td>
                    <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">{data.property.jobNumber}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs">SITE ADDRESS:</td>
                  <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs">
                    {data.property.propertyAddress || 'Not provided'}
                    {data.property.propertyPostcode && `, ${data.property.propertyPostcode}`}
                    {data.property.state && `, ${data.property.state}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Inspection Date */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-700">
              <span className="font-semibold">Inspection Date:</span> {formatDate(data.incident.technicianAttendanceDate || data.header.dateGenerated)}
            </p>
          </div>

          {/* Instructions Box */}
          {data.reportInstructions && (
            <div className="mb-8 print:mb-6">
              <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-6 print:p-4">
                <h3 className="text-base print:text-sm font-bold text-slate-900 mb-3 print:mb-2">Instructions:</h3>
                <p className="text-sm print:text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {data.reportInstructions}
                </p>
              </div>
            </div>
          )}

          {/* Observations Box */}
          <div className="mb-8 print:mb-6">
            <h3 className="text-base print:text-sm font-bold text-slate-900 mb-3 print:mb-2">
              The Following Observations are noted:
            </h3>
            <div className="bg-white border-2 border-slate-300 rounded-lg p-6 print:p-4 min-h-[120px] print:min-h-[100px]">
              <p className="text-sm print:text-xs text-slate-700 leading-relaxed">
                {generateObservations()}
              </p>
            </div>
          </div>

          {/* Footer - Business Information */}
          <div className="mt-auto pt-8 print:pt-6 border-t-2 border-slate-300">
            <div className="text-center text-xs print:text-[10px] text-slate-600 space-y-1">
              {data.header.businessName && (
                <p className="font-semibold text-slate-700">{data.header.businessName}</p>
              )}
              {data.header.businessAddress && (
                <p>{data.header.businessAddress}</p>
              )}
              {data.header.businessABN && (
                <p>ABN: {data.header.businessABN}</p>
              )}
              {data.header.businessPhone && (
                <p>Phone: {data.header.businessPhone}</p>
              )}
              {data.header.businessEmail && (
                <p>Email: {data.header.businessEmail}</p>
              )}
            </div>
          </div>
        </div>

        {/* PAGE 2: EXECUTIVE SUMMARY */}
        <div className="print-page-break print-page flex flex-col">
          <div className="mb-6 print:mb-4">
            <h2 className="text-2xl print:text-xl font-bold text-slate-900 text-center">
              Executive Summary
            </h2>
          </div>
          
          <div className="mb-6 print:mb-4">
            <div className="bg-white border-2 border-slate-300 rounded-lg p-6 print:p-4">
              <p className="text-sm print:text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {generateProfessionalSummary()}
              </p>
            </div>
          </div>
        </div>

        {/* PAGE 3: DETAILED INSPECTION FORM */}
        <div className="print-page-break print-page min-h-[297mm] print:min-h-0 flex flex-col">
          <div className="mb-6 print:mb-4">
            <h2 className="text-2xl print:text-xl font-bold text-slate-900 text-center">
              Residential Restoration Inspection Form
            </h2>
          </div>

          {/* Inspector Information */}
          <div className="mb-6 print:mb-4">
            <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2">Inspector Information</h3>
            <table className="w-full border-collapse border border-slate-300">
              <tbody>
                <tr>
                  <td className="p-3 print:p-2 border border-slate-300 bg-slate-50 font-semibold text-sm print:text-xs w-1/2">Inspector Name</td>
                  <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{data.incident.technicianName || 'Not provided'}</td>
                </tr>
                <tr>
                  <td className="p-3 print:p-2 border border-slate-300 bg-slate-50 font-semibold text-sm print:text-xs">Inspector ID</td>
                  <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{data.header.reportNumber || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Structure Information */}
          <div className="mb-6 print:mb-4">
            <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2">Structure Information</h3>
            <div className="space-y-3 print:space-y-2">
              <div>
                <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Address</label>
                <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs min-h-[40px] print:min-h-[30px]">
                  {data.property.propertyAddress || 'Not provided'}
                  {data.property.propertyPostcode && `, ${data.property.propertyPostcode}`}
                  {data.property.state && `, ${data.property.state}`}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Job No</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                    {data.property.jobNumber || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <div className="flex gap-4 print:gap-2 text-sm print:text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" name="description" value="permanent" className="print:hidden" defaultChecked />
                      <span>Permanent</span>
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name="description" value="temporary" className="print:hidden" />
                      <span>Temporary</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Building Type</label>
                <div className="flex gap-4 print:gap-2 text-sm print:text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" className="print:hidden" defaultChecked={data.property.structureType?.toLowerCase().includes('tough')} />
                    <span>Tough deck</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" className="print:hidden" defaultChecked />
                    <span>Applicable</span>
                  </label>
                </div>
              </div>

              {/* Builder/Developer Contact */}
              {data.builderDeveloper && (
                <div className="grid grid-cols-2 gap-3 print:gap-2">
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Builder/Dev Company Name</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.builderDeveloper.companyName || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Owner/Mgmt Contact</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.ownerManagement?.contactName || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Builder/Dev Address</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.builderDeveloper.address || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Owner/Mgmt Phone</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.ownerManagement?.phone || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Builder/Dev Phone</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.builderDeveloper.phone || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Owner/Mgmt Email</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.ownerManagement?.email || 'Not provided'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Previous Maintenance and Repair Work */}
          {data.maintenanceHistory && (
            <div className="mb-6 print:mb-4">
              <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2">Previous Maintenance and Repair Work</h3>
              <div className="space-y-3 print:space-y-2">
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Date of last inspection:</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs inline-block">
                    {data.maintenanceHistory.lastInspectionDate ? formatDate(data.maintenanceHistory.lastInspectionDate) : 'Not provided'}
                  </div>
                </div>
                
                <div className="space-y-2 print:space-y-1">
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Is the roof permanent?</span>
                    <div className="flex gap-3 print:gap-2 text-sm print:text-xs">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="roof_permanent" className="print:hidden" defaultChecked />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name="roof_permanent" className="print:hidden" />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Attach copy of guarantee or previous works.</span>
                    <span className="text-xs print:text-[10px] text-slate-500 italic">(See attachments)</span>
                  </div>
                  
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Has any scope of work to the building changed since last inspection?</span>
                    <div className="flex gap-3 print:gap-2 text-sm print:text-xs">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="building_changed" className="print:hidden" defaultChecked={data.maintenanceHistory.buildingChangedSinceLastInspection?.toLowerCase().includes('yes')} />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name="building_changed" className="print:hidden" />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Has any changes, additions or new penetrations been made to roof since last inspection?</span>
                    <div className="flex gap-3 print:gap-2 text-sm print:text-xs">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="structure_changed" className="print:hidden" defaultChecked={data.maintenanceHistory.structureChangesSinceLastInspection?.toLowerCase().includes('yes')} />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name="structure_changed" className="print:hidden" />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Was there previous leakage?</span>
                    <div className="flex gap-3 print:gap-2 text-sm print:text-xs">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="previous_leakage" className="print:hidden" defaultChecked={data.maintenanceHistory.previousLeakage?.toLowerCase().includes('yes')} />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name="previous_leakage" className="print:hidden" />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 print:gap-1">
                    <span className="text-sm print:text-xs font-semibold text-slate-700">Emergency repair performed?</span>
                    <div className="flex gap-3 print:gap-2 text-sm print:text-xs">
                      <label className="flex items-center gap-1">
                        <input type="radio" name="emergency_repair" className="print:hidden" defaultChecked={data.maintenanceHistory.emergencyRepairPerformed?.toLowerCase().includes('yes')} />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name="emergency_repair" className="print:hidden" />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* PAGE 3: PROPERTY & INCIDENT INFORMATION - Form Style */}
        <div className="print-page-break print-page flex flex-col">
          <div className="mb-6 print:mb-4">
            <h2 className="text-2xl print:text-xl font-bold text-slate-900 text-center">
              Property & Incident Information
            </h2>
          </div>

          {/* Property Information */}
          <div className="mb-6 print:mb-4">
            <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 print:w-4 print:h-4 text-cyan-600" />
              Property Information
            </h3>
            <div className="space-y-3 print:space-y-2">
              {data.property.propertyId && (
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Property ID</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                    {data.property.propertyId}
                  </div>
                </div>
              )}
              {data.property.jobNumber && (
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Job Number</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                    {data.property.jobNumber}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                {data.property.buildingAge && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Building Age</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.property.buildingAge}
                    </div>
                  </div>
                )}
                {data.property.structureType && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Structure Type</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.property.structureType}
                    </div>
                  </div>
                )}
              </div>
              {data.property.accessNotes && (
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Access Notes</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs min-h-[40px] print:min-h-[30px]">
                    {data.property.accessNotes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Incident Details */}
          <div className="mb-6 print:mb-4">
            <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 print:w-4 print:h-4 text-cyan-600" />
              Incident Details
            </h3>
            <div className="space-y-3 print:space-y-2">
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                {data.incident.dateOfLoss && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Date of Loss</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {formatDateLong(data.incident.dateOfLoss)}
                    </div>
                  </div>
                )}
                {data.incident.technicianAttendanceDate && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Technician Attendance</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {formatDateLong(data.incident.technicianAttendanceDate)}
                    </div>
                  </div>
                )}
              </div>
              {data.incident.technicianName && (
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Technician</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs flex items-center gap-1">
                    <User className="w-4 h-4 print:w-3 print:h-3 text-slate-600" />
                    {data.incident.technicianName}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                {data.incident.claimReferenceNumber && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Claim Reference</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.incident.claimReferenceNumber}
                    </div>
                  </div>
                )}
                {data.incident.insurerName && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Insurer</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.incident.insurerName}
                    </div>
                  </div>
                )}
              </div>
              {data.incident.waterSource && (
                <div>
                  <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Source</label>
                  <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                    {data.incident.waterSource}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                {data.incident.waterCategory && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Category</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <span className={`inline-block px-3 print:px-2 py-1 print:py-0.5 rounded text-sm print:text-xs font-semibold ${
                        data.incident.waterCategory.includes('1') ? 'bg-green-100 text-green-800' :
                        data.incident.waterCategory.includes('2') ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {data.incident.waterCategory}
                      </span>
                    </div>
                  </div>
                )}
                {data.incident.waterClass && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Class</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <span className={`inline-block px-3 print:px-2 py-1 print:py-0.5 rounded text-sm print:text-xs font-semibold ${
                        data.incident.waterClass.includes('1') ? 'bg-green-100 text-green-800' :
                        data.incident.waterClass.includes('2') ? 'bg-yellow-100 text-yellow-800' :
                        data.incident.waterClass.includes('3') ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {data.incident.waterClass}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tier 1 Data - Enhanced/Optimised Reports Only */}
          {data.tier1 && (data.reportDepthLevel === 'Enhanced' || data.reportDepthLevel === 'Optimised') && (
            <div className="mb-6 print:mb-4">
              <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 print:w-4 print:h-4 text-cyan-600" />
                Tier 1: Critical Assessment
              </h3>
              <div className="space-y-3 print:space-y-2">
                {data.tier1.T1_Q1_propertyType && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Property Type</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier1.T1_Q1_propertyType}
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q2_constructionYear && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Construction Year</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier1.T1_Q2_constructionYear}
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q3_waterSource && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Source</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier1.T1_Q3_waterSource}
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q4_occupancyStatus && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Occupancy Status</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier1.T1_Q4_occupancyStatus}
                      {data.tier1.T1_Q4_petsPresent && (
                        <span className="text-slate-600 ml-2">(Pets: {data.tier1.T1_Q4_petsPresent})</span>
                      )}
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q5_roomsAffected && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Rooms Affected</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier1.T1_Q5_roomsAffected}
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q6_materialsAffected && Array.isArray(data.tier1.T1_Q6_materialsAffected) && data.tier1.T1_Q6_materialsAffected.length > 0 && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Materials Affected</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <ul className="list-disc list-inside space-y-1">
                        {data.tier1.T1_Q6_materialsAffected.map((material: string, idx: number) => (
                          <li key={idx}>{material}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q7_hazards && Array.isArray(data.tier1.T1_Q7_hazards) && data.tier1.T1_Q7_hazards.length > 0 && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Hazards Identified</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <ul className="list-disc list-inside space-y-1">
                        {data.tier1.T1_Q7_hazards.map((hazard: string, idx: number) => (
                          <li key={idx}>{hazard}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {data.tier1.T1_Q8_waterDuration && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Duration</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier1.T1_Q8_waterDuration}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tier 2 Data - Enhanced/Optimised Reports Only */}
          {data.tier2 && (data.reportDepthLevel === 'Enhanced' || data.reportDepthLevel === 'Optimised') && (
            <div className="mb-6 print:mb-4">
              <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 print:w-4 print:h-4 text-cyan-600" />
                Tier 2: Enhanced Assessment
              </h3>
              <div className="space-y-3 print:space-y-2">
                {data.tier2.T2_Q1_moistureReadings && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Detailed Moisture Readings</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier2.T2_Q1_moistureReadings}
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q2_waterMigrationPattern && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Water Migration Pattern</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier2.T2_Q2_waterMigrationPattern}
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q3_equipmentDeployed && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Equipment Deployed</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier2.T2_Q3_equipmentDeployed}
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q4_affectedContents && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Affected Contents</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier2.T2_Q4_affectedContents}
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q5_structuralConcerns && Array.isArray(data.tier2.T2_Q5_structuralConcerns) && data.tier2.T2_Q5_structuralConcerns.length > 0 && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Structural Concerns</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <ul className="list-disc list-inside space-y-1">
                        {data.tier2.T2_Q5_structuralConcerns.map((concern: string, idx: number) => (
                          <li key={idx}>{concern}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q6_buildingServicesAffected && Array.isArray(data.tier2.T2_Q6_buildingServicesAffected) && data.tier2.T2_Q6_buildingServicesAffected.length > 0 && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Building Services Affected</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      <ul className="list-disc list-inside space-y-1">
                        {data.tier2.T2_Q6_buildingServicesAffected.map((service: string, idx: number) => (
                          <li key={idx}>{service}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {data.tier2.T2_Q7_insuranceConsiderations && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Insurance Considerations</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier2.T2_Q7_insuranceConsiderations}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tier 3 Data - Optimised Reports Only */}
          {data.tier3 && data.reportDepthLevel === 'Optimised' && (
            <div className="mb-6 print:mb-4">
              <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 print:w-4 print:h-4 text-cyan-600" />
                Tier 3: Optimised Assessment
              </h3>
              <div className="space-y-3 print:space-y-2">
                {data.tier3.T3_Q1_timelineRequirements && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Timeline Requirements</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier3.T3_Q1_timelineRequirements}
                    </div>
                  </div>
                )}
                {data.tier3.T3_Q2_dryingPreferences && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Drying Preferences</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier3.T3_Q2_dryingPreferences}
                    </div>
                  </div>
                )}
                {data.tier3.T3_Q3_chemicalTreatment && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Chemical Treatment Requirements</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier3.T3_Q3_chemicalTreatment}
                    </div>
                  </div>
                )}
                {data.tier3.T3_Q4_totalAffectedArea && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Total Affected Area</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs">
                      {data.tier3.T3_Q4_totalAffectedArea}
                    </div>
                  </div>
                )}
                {data.tier3.T3_Q5_class4DryingAssessment && (
                  <div>
                    <label className="block text-sm print:text-xs font-semibold text-slate-700 mb-1">Class 4 Drying Assessment</label>
                    <div className="border border-slate-300 rounded p-2 print:p-1.5 bg-white text-sm print:text-xs whitespace-pre-wrap min-h-[60px] print:min-h-[40px]">
                      {data.tier3.T3_Q5_class4DryingAssessment}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PAGE 4+: DETAILED REPORT CONTENT WITH IMAGES AND ANALYSIS */}
        <div className="print-page-break print-page flex flex-col">

          {/* Environmental Conditions & Classification */}
          {(data.environmental || data.classification || data.psychrometric) && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <Thermometer className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Environmental Conditions & Classification
              </h2>
              
              {data.environmental && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 print:p-4 border-2 border-blue-200 mb-4 print:mb-3">
                  <h3 className="text-lg print:text-base font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                    <Thermometer className="w-5 h-5 print:w-4 print:h-4 text-blue-600" />
                    Environmental Data
                  </h3>
                  <div className="grid grid-cols-3 gap-4 print:gap-3">
                    {data.environmental.ambientTemperature !== null && (
                      <div className="bg-white rounded-lg p-4 print:p-3 text-center border border-blue-100">
                        <Thermometer className="w-6 h-6 print:w-5 print:h-5 text-blue-600 mx-auto mb-2 print:mb-1" />
                        <p className="text-xs print:text-[10px] text-slate-600 mb-1 font-medium">Temperature</p>
                        <p className="text-2xl print:text-xl font-bold text-slate-900">{data.environmental.ambientTemperature}°C</p>
                      </div>
                    )}
                    {data.environmental.humidityLevel !== null && (
                      <div className="bg-white rounded-lg p-4 print:p-3 text-center border border-blue-100">
                        <Droplet className="w-6 h-6 print:w-5 print:h-5 text-blue-600 mx-auto mb-2 print:mb-1" />
                        <p className="text-xs print:text-[10px] text-slate-600 mb-1 font-medium">Humidity</p>
                        <p className="text-2xl print:text-xl font-bold text-slate-900">{data.environmental.humidityLevel}%</p>
                      </div>
                    )}
                    {data.environmental.dewPoint !== null && (
                      <div className="bg-white rounded-lg p-4 print:p-3 text-center border border-blue-100">
                        <Wind className="w-6 h-6 print:w-5 print:h-5 text-blue-600 mx-auto mb-2 print:mb-1" />
                        <p className="text-xs print:text-[10px] text-slate-600 mb-1 font-medium">Dew Point</p>
                        <p className="text-2xl print:text-xl font-bold text-slate-900">{data.environmental.dewPoint}°C</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.classification && (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-6 print:p-4 border-2 border-amber-200 mb-4 print:mb-3">
                  <h3 className="text-lg print:text-base font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                    <Shield className="w-5 h-5 print:w-4 print:h-4 text-amber-600" />
                    IICRC Classification
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 print:gap-3">
                    {data.classification.category && (
                      <div>
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Category</p>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">{data.classification.category}</p>
                      </div>
                    )}
                    {data.classification.class && (
                      <div>
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Class</p>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">{data.classification.class}</p>
                      </div>
                    )}
                    {data.classification.justification && (
                      <div className="md:col-span-2">
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Justification</p>
                        <p className="text-slate-900 text-sm print:text-xs">{data.classification.justification}</p>
                      </div>
                    )}
                    {data.classification.standardReference && (
                      <div className="md:col-span-2">
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Standard Reference</p>
                        <p className="text-slate-900 text-sm print:text-xs font-mono">{data.classification.standardReference}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.psychrometric && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 print:p-4 border-2 border-green-200">
                  <h3 className="text-lg print:text-base font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                    <Wind className="w-5 h-5 print:w-4 print:h-4 text-green-600" />
                    Psychrometric Assessment
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 print:gap-3">
                    {data.psychrometric.dryingIndex !== null && (
                      <div>
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Drying Index</p>
                        <p className="font-semibold text-slate-900 text-2xl print:text-xl">{data.psychrometric.dryingIndex}</p>
                      </div>
                    )}
                    {data.psychrometric.dryingStatus && (
                      <div>
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Drying Status</p>
                        <span className={`inline-block px-3 print:px-2 py-1 print:py-0.5 rounded text-sm print:text-xs font-semibold ${
                          data.psychrometric.dryingStatus.toLowerCase().includes('excellent') || data.psychrometric.dryingStatus.toLowerCase().includes('good') 
                            ? 'bg-green-100 text-green-800' 
                            : data.psychrometric.dryingStatus.toLowerCase().includes('fair')
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {data.psychrometric.dryingStatus}
                        </span>
                      </div>
                    )}
                    {data.psychrometric.recommendation && (
                      <div className="md:col-span-2">
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Recommendation</p>
                        <p className="text-slate-900 text-sm print:text-xs">{data.psychrometric.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Affected Areas */}
          {data.affectedAreas && data.affectedAreas.length > 0 && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <Droplet className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Affected Areas
              </h2>
              <div className="space-y-4 print:space-y-3">
                {data.affectedAreas.map((area, index) => (
                  <div key={index} className="bg-slate-50 rounded-lg p-6 print:p-4 border border-slate-200">
                    <h3 className="text-lg print:text-base font-bold text-slate-900 mb-3 print:mb-2">
                      Area {index + 1}: {area.name}
                    </h3>
                    {area.description && (
                      <p className="text-sm print:text-xs text-slate-700 mb-3 print:mb-2 leading-relaxed">
                        {area.description}
                      </p>
                    )}
                    {area.materials && area.materials.length > 0 && (
                      <div className="mb-3 print:mb-2">
                        <p className="text-sm print:text-xs text-slate-600 mb-1 font-semibold">Materials Affected:</p>
                        <p className="text-slate-900 text-sm print:text-xs">{area.materials.join(', ')}</p>
                      </div>
                    )}
                    {area.moistureReadings && area.moistureReadings.length > 0 && (
                      <div>
                        <p className="text-sm print:text-xs text-slate-600 mb-2 font-semibold">Moisture Readings:</p>
                        <div className="grid grid-cols-2 gap-2 print:gap-1">
                          {area.moistureReadings.map((reading, rIndex) => (
                            <div key={rIndex} className="bg-white rounded p-2 print:p-1.5 border border-slate-200">
                              <p className="text-xs print:text-[10px] text-slate-600">{reading.location}</p>
                              <p className="text-sm print:text-xs font-semibold text-slate-900">{reading.value} {reading.unit}</p>
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

          {/* Moisture Readings Table */}
          {data.moistureReadings && data.moistureReadings.length > 0 && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <FileText className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Detailed Moisture Readings
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-3 print:p-2 border border-slate-300 text-left text-sm print:text-xs font-semibold text-slate-900">Location</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-left text-sm print:text-xs font-semibold text-slate-900">Surface Type</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-left text-sm print:text-xs font-semibold text-slate-900">Moisture Level</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-left text-sm print:text-xs font-semibold text-slate-900">Depth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.moistureReadings.map((reading, index) => (
                      <tr key={index}>
                        <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{reading.location}</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{reading.surfaceType || 'N/A'}</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs font-semibold">
                          {reading.moistureLevel} {reading.unit}
                        </td>
                        <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{reading.depth || 'Surface'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Hazards Assessment */}
          {(data.hazards.biologicalMouldDetected || data.hazards.asbestosRisk || data.hazards.leadRisk || data.hazards.methamphetamineScreen) && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 print:w-5 print:h-5 text-red-600" />
                Hazards Assessment
              </h2>
              <div className="bg-red-50 rounded-lg p-6 print:p-4 border-2 border-red-200">
                <div className="space-y-3 print:space-y-2">
                  {data.hazards.biologicalMouldDetected && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 print:w-4 print:h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">Biological Mould Detected</p>
                        {data.hazards.biologicalMouldCategory && (
                          <p className="text-sm print:text-xs text-slate-700">Category: {data.hazards.biologicalMouldCategory}</p>
                        )}
                        <p className="text-sm print:text-xs text-slate-600 mt-1">
                          <strong>Compliance:</strong> IICRC S520 (Mould Remediation) standards apply. Appropriate containment and remediation protocols required.
                        </p>
                      </div>
                    </div>
                  )}
                  {data.hazards.asbestosRisk && (
                    <div className="flex items-start gap-2">
                      <HardHat className="w-5 h-5 print:w-4 print:h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">Potential Asbestos Risk</p>
                        <p className="text-sm print:text-xs text-slate-600 mt-1">
                          <strong>Compliance:</strong> Work Health and Safety Regulations 2011 (WHS) require asbestos assessment for pre-1990 buildings. Licensed asbestos assessor consultation recommended before any demolition or structural work.
                        </p>
                      </div>
                    </div>
                  )}
                  {data.hazards.leadRisk && (
                    <div className="flex items-start gap-2">
                      <HardHat className="w-5 h-5 print:w-4 print:h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">Potential Lead Risk</p>
                        <p className="text-sm print:text-xs text-slate-600 mt-1">
                          <strong>Compliance:</strong> Work Health and Safety Regulations 2011 (WHS) require lead assessment for pre-1990 buildings. Appropriate PPE and containment measures required.
                        </p>
                      </div>
                    </div>
                  )}
                  {data.hazards.methamphetamineScreen && (
                    <div className="flex items-start gap-2">
                      <Shield className="w-5 h-5 print:w-4 print:h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900 text-base print:text-sm">Methamphetamine Screen: {data.hazards.methamphetamineScreen}</p>
                        {data.hazards.methamphetamineTestCount && (
                          <p className="text-sm print:text-xs text-slate-700">Tests Performed: {data.hazards.methamphetamineTestCount}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Equipment Deployment */}
          {data.equipment && data.equipment.length > 0 && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <Wrench className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Equipment Deployment
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-3 print:p-2 border border-slate-300 text-left text-sm print:text-xs font-semibold text-slate-900">Equipment</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs font-semibold text-slate-900">Quantity</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs font-semibold text-slate-900">Daily Rate</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs font-semibold text-slate-900">Duration</th>
                      <th className="p-3 print:p-2 border border-slate-300 text-right text-sm print:text-xs font-semibold text-slate-900">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.equipment.map((item, index) => (
                      <tr key={index}>
                        <td className="p-3 print:p-2 border border-slate-300 text-sm print:text-xs">{item.name}</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs">{item.quantity}</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs">{formatCurrency(item.dailyRate)}</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-center text-sm print:text-xs">{item.estimatedDuration} days</td>
                        <td className="p-3 print:p-2 border border-slate-300 text-right text-sm print:text-xs font-semibold">{formatCurrency(item.totalCost)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-semibold">
                      <td colSpan={4} className="p-3 print:p-2 border border-slate-300 text-right text-sm print:text-xs">Total Equipment Cost:</td>
                      <td className="p-3 print:p-2 border border-slate-300 text-right text-sm print:text-xs">
                        {formatCurrency(data.equipment.reduce((sum, item) => sum + item.totalCost, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Compliance & Standards */}
          <section className="print-avoid-break mb-6 print:mb-4">
            <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
              Compliance & Standards
            </h2>
            <div className="bg-slate-50 rounded-lg p-6 print:p-4 border border-slate-200">
              <div className="space-y-2 print:space-y-1">
                {getComplianceStandards().map((standard, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 print:w-3 print:h-3 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm print:text-xs text-slate-900">{standard}</p>
                  </div>
                ))}
              </div>
              {data.compliance?.state && (
                <div className="mt-4 print:mt-3 pt-4 print:pt-3 border-t border-slate-300">
                  <p className="text-sm print:text-xs text-slate-600 mb-2 print:mb-1">
                    <strong>State:</strong> {data.compliance.state}
                  </p>
                  {data.compliance.buildingAuthority && (
                    <p className="text-sm print:text-xs text-slate-600 mb-1">
                      <strong>Building Authority:</strong> {data.compliance.buildingAuthority}
                    </p>
                  )}
                  {data.compliance.workSafetyAuthority && (
                    <p className="text-sm print:text-xs text-slate-600 mb-1">
                      <strong>Work Safety Authority:</strong> {data.compliance.workSafetyAuthority}
                    </p>
                  )}
                  {data.compliance.epaAuthority && (
                    <p className="text-sm print:text-xs text-slate-600">
                      <strong>EPA Authority:</strong> {data.compliance.epaAuthority}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Photos Section - Grouped by Category */}
          {data.photos && data.photos.length > 0 && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <ImageIcon className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Photographic Evidence
              </h2>
              
              {/* Category mapping for display labels */}
              {(() => {
                const categoryLabels: Record<string, string> = {
                  'site_damage': 'Site & Damage Photography',
                  'moisture_mapping': 'Moisture Mapping & Thermal Imaging',
                  'equipment_deployment': 'Equipment Deployment',
                  'remediation_progress': 'Remediation Progress',
                  'structural_assessment': 'Structural Assessment',
                  'final_verification': 'Final Verification & Handover'
                }
                
                // Group photos by category
                const photosByCategory: Record<string, typeof data.photos> = {}
                const uncategorizedPhotos: typeof data.photos = []
                
                data.photos.forEach((photo) => {
                  const category = photo.category
                  if (category && categoryLabels[category]) {
                    if (!photosByCategory[category]) {
                      photosByCategory[category] = []
                    }
                    photosByCategory[category].push(photo)
                  } else {
                    uncategorizedPhotos.push(photo)
                  }
                })
                
                // Get all categories in order
                const categoryOrder = ['site_damage', 'moisture_mapping', 'equipment_deployment', 'remediation_progress', 'structural_assessment', 'final_verification']
                const sortedCategories = categoryOrder.filter(cat => photosByCategory[cat] && photosByCategory[cat].length > 0)
                
                return (
                  <div className="space-y-6 print:space-y-4">
                    {/* Display photos grouped by category */}
                    {sortedCategories.map((categoryId) => {
                      const categoryPhotos = photosByCategory[categoryId]
                      const categoryLabel = categoryLabels[categoryId]
                      
                      return (
                        <div key={categoryId} className="print-avoid-break">
                          <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 border-b border-slate-300 pb-2">
                            {categoryLabel}
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:gap-3">
                            {categoryPhotos.map((photo, index) => (
                              <div key={index} className="relative bg-slate-100 rounded-lg overflow-hidden border border-slate-300">
                                <img
                                  src={photo.url}
                                  alt={photo.caption || photo.location || `${categoryLabel} ${index + 1}`}
                                  className="w-full h-auto object-cover"
                                  onError={(e) => {
                                    console.error(`[RestorationInspectionReportViewer] Failed to load image: ${photo.url}`)
                                    const target = e.target as HTMLImageElement
                                    if (target) {
                                      target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E'
                                    }
                                  }}
                                  onLoad={() => {
                                    console.log(`[RestorationInspectionReportViewer] Successfully loaded image: ${photo.url}`)
                                  }}
                                />
                                {(photo.caption || photo.location) && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 print:p-1">
                                    {photo.caption || photo.location}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Display uncategorized photos if any */}
                    {uncategorizedPhotos.length > 0 && (
                      <div className="print-avoid-break">
                        <h3 className="text-lg print:text-base font-semibold text-slate-900 mb-3 print:mb-2 border-b border-slate-300 pb-2">
                          Additional Photographs
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:gap-3">
                          {uncategorizedPhotos.map((photo, index) => (
                            <div key={index} className="relative bg-slate-100 rounded-lg overflow-hidden border border-slate-300">
                              <img
                                src={photo.url}
                                alt={photo.caption || photo.location || `Photo ${index + 1}`}
                                className="w-full h-auto object-cover"
                                onError={(e) => {
                                  console.error(`[RestorationInspectionReportViewer] Failed to load image: ${photo.url}`)
                                  const target = e.target as HTMLImageElement
                                  if (target) {
                                    target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E'
                                  }
                                }}
                                onLoad={() => {
                                  console.log(`[RestorationInspectionReportViewer] Successfully loaded image: ${photo.url}`)
                                }}
                              />
                              {(photo.caption || photo.location) && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 print:p-1">
                                  {photo.caption || photo.location}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </section>
          )}

          {/* Technician Notes */}
          {data.technicianNotes && (
            <section className="print-avoid-break mb-6 print:mb-4">
              <h2 className="text-2xl print:text-xl font-bold text-slate-900 mb-4 print:mb-3 flex items-center gap-2">
                <FileText className="w-6 h-6 print:w-5 print:h-5 text-cyan-600" />
                Technician Field Notes
              </h2>
              <div className="bg-slate-50 rounded-lg p-6 print:p-4 border border-slate-200">
                <p className="text-sm print:text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {data.technicianNotes}
                </p>
              </div>
            </section>
          )}

          {/* Footer - Complete footer on last page */}
          <div className="mt-8 print:mt-6 pt-6 print:pt-4 border-t-2 border-slate-300">
            <div className="text-center text-xs print:text-[10px] text-slate-600 space-y-1">
              {data.header.businessName && (
                <p className="font-semibold text-slate-700">{data.header.businessName}</p>
              )}
              {data.header.businessAddress && <p>{data.header.businessAddress}</p>}
              {data.header.businessABN && <p>ABN: {data.header.businessABN}</p>}
              {data.header.businessPhone && <p>Phone: {data.header.businessPhone}</p>}
              {data.header.businessEmail && <p>Email: {data.header.businessEmail}</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
