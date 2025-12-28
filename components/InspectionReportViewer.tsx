"use client"

import { useState, useEffect } from "react"
import { FileText, Download, Loader2, AlertCircle, CheckCircle, Edit, Save, Sparkles, FileCheck } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"
import VisualDashboardReport from "./VisualDashboardReport"
import RestorationInspectionReportViewer from "./RestorationInspectionReportViewer"

// Convert structured report data to VisualDashboardReport format
function convertToVisualReportData(structuredData: any): any {
  console.log('[convertToVisualReportData] 🔍 Input structured data:', {
    hasData: !!structuredData,
    type: structuredData?.type,
    hasEnvironmental: !!structuredData?.environmental,
    environmental: structuredData?.environmental,
    hasPsychrometric: !!structuredData?.psychrometric,
    psychrometric: structuredData?.psychrometric,
    hasHazards: !!structuredData?.hazards,
    hazards: structuredData?.hazards,
    hasTimeline: !!structuredData?.timeline,
    timeline: structuredData?.timeline,
    fullData: structuredData
  })
  
  if (!structuredData || structuredData.type !== 'restoration_inspection_report') {
    console.log('[convertToVisualReportData] ❌ Invalid structured data:', structuredData)
    return null
  }

  const { 
    header = {}, 
    property = {}, 
    incident = {}, 
    environmental = null, 
    psychrometric = null, 
    affectedAreas = [], 
    moistureReadings = [],
    scopeItems = [],
    costEstimates = [],
    summary = {}, 
    equipment = [], 
    compliance = {}, 
    hazards = {},
    photos = [],
    technicianNotes = ''
  } = structuredData
  
  console.log('[convertToVisualReportData] 📦 Extracted data:', {
    environmental,
    psychrometric,
    hazards,
    affectedAreasCount: affectedAreas?.length || 0,
    moistureReadingsCount: moistureReadings?.length || 0,
    scopeItemsCount: scopeItems?.length || 0,
    equipmentCount: equipment?.length || 0,
    photosCount: photos?.length || 0
  })

  // Calculate real materials from affected areas and scope items
  const allMaterials = new Set<string>()
  if (affectedAreas && Array.isArray(affectedAreas)) {
    affectedAreas.forEach((area: any) => {
      if (area.materials && Array.isArray(area.materials)) {
        area.materials.forEach((m: string) => allMaterials.add(m))
      }
    })
  }
  const materialsList = Array.from(allMaterials).join(', ') || 'Various'

  // Calculate real average moisture from actual readings
  let avgMoisture = 0
  if (moistureReadings && Array.isArray(moistureReadings) && moistureReadings.length > 0) {
    const total = moistureReadings.reduce((sum: number, r: any) => sum + (r.moistureLevel || 0), 0)
    avgMoisture = Math.round(total / moistureReadings.length)
  } else if (summary?.averageMoisture) {
    avgMoisture = Math.round(summary.averageMoisture)
  }

  // Build room details from REAL affected areas data
  const roomDetails = (affectedAreas && Array.isArray(affectedAreas) && affectedAreas.length > 0) ? affectedAreas.map((area: any) => {
    // Get moisture readings for this area
    const areaMoistureReadings = area.moistureReadings || []
    const areaMoisture = areaMoistureReadings.length > 0
      ? Math.round(areaMoistureReadings.reduce((sum: number, r: any) => sum + r.value, 0) / areaMoistureReadings.length)
      : avgMoisture

    // Get scope items for this area
    const areaScopeItems = scopeItems?.filter((item: any) => 
      item.description?.toLowerCase().includes(area.name?.toLowerCase() || '') ||
      area.name?.toLowerCase().includes(item.description?.toLowerCase() || '')
    ) || []

    // Build scope of work from actual scope items
    const scopeOfWork = areaScopeItems.length > 0
      ? areaScopeItems.map((item: any) => item.description).join(', ')
      : scopeItems?.length > 0 
        ? scopeItems.map((item: any) => item.description).join(', ')
        : 'Extract water & apply antimicrobial'

    // Get equipment for this area (match by area or use all equipment)
    const areaEquipment = equipment?.map((e: any) => `${e.quantity}x ${e.name}`) || []

    return {
      name: area.name || 'Unknown Area',
      materials: area.materials?.length > 0 ? area.materials.join(', ') : materialsList,
      moisture: areaMoisture,
      targetMoisture: 12,
      status: areaMoisture > 20 ? 'Saturated' : areaMoisture > 15 ? 'Fair' : 'Good',
      scopeOfWork: scopeOfWork,
      equipment: areaEquipment.length > 0 ? areaEquipment : []
    }
  }) : []

  // Build equipment costs from REAL equipment data
  const equipmentCosts: any[] = []
  const lgrEquipment = equipment?.filter((e: any) => e.type === 'LGR_DEHUMIDIFIER' || e.type === 'DESICCANT_DEHUMIDIFIER') || []
  const airMovers = equipment?.filter((e: any) => e.type === 'AIR_MOVER') || []

  if (lgrEquipment.length > 0) {
    const totalQty = lgrEquipment.reduce((sum: number, e: any) => sum + (e.quantity || 0), 0)
    const totalDailyRate = lgrEquipment.reduce((sum: number, e: any) => sum + ((e.dailyRate || 0) * (e.quantity || 0)), 0)
    const totalCost = lgrEquipment.reduce((sum: number, e: any) => sum + (e.totalCost || 0), 0)
    if (totalQty > 0) {
      equipmentCosts.push({
        type: 'LGR',
        qty: totalQty,
        ratePerDay: totalDailyRate,
        total: totalCost
      })
    }
  }

  if (airMovers.length > 0) {
    const totalQty = airMovers.reduce((sum: number, e: any) => sum + (e.quantity || 0), 0)
    const totalDailyRate = airMovers.reduce((sum: number, e: any) => sum + ((e.dailyRate || 0) * (e.quantity || 0)), 0)
    const totalCost = airMovers.reduce((sum: number, e: any) => sum + (e.totalCost || 0), 0)
    if (totalQty > 0) {
      equipmentCosts.push({
        type: 'Air',
        qty: totalQty,
        ratePerDay: totalDailyRate,
        total: totalCost
      })
    }
  }

  // Calculate total litres extracted from cost estimates or equipment
  let totalLitresExtracted = '0 L'
  const extractionItem = costEstimates?.find((item: any) => 
    item.description?.toLowerCase().includes('extract') || 
    item.description?.toLowerCase().includes('water removal')
  )
  if (extractionItem && extractionItem.quantity) {
    totalLitresExtracted = `${extractionItem.quantity} L`
  }

  return {
    header: {
      title: header?.businessName || 'Restore Assist',
      subtitle: 'Water Damage Restoration Overview',
      claimRef: header?.reportNumber || incident?.claimReferenceNumber || 'N/A',
      location: property?.state ? `${property.state}` : '',
      date: header?.dateGenerated ? new Date(header.dateGenerated).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      occupancy: 'Vacant', // Can be enhanced with actual occupancy data
      occupancyDetails: ''
    },
    summaryMetrics: {
      roomsAffected: summary?.roomsAffected || (Array.isArray(affectedAreas) ? affectedAreas.length : 0) || 0,
      materialsAffected: materialsList,
      moistureLevel: avgMoisture,
      totalCost: summary?.totalCost || (Array.isArray(costEstimates) ? costEstimates.reduce((sum: number, item: any) => sum + (item.total || 0), 0) : 0) || 0,
      dryingStatus: summary?.dryingStatus || psychrometric?.dryingStatus || 'Fair',
      totalLitresExtracted: totalLitresExtracted,
      estimatedDuration: summary?.estimatedDuration || (Array.isArray(equipment) && equipment.length > 0 ? equipment[0]?.estimatedDuration : null) || 4,
      dryingIndex: psychrometric?.dryingIndex || 33.6
    },
    safety: {
      trafficLight: 'vacant',
      hasChildren: false,
      waterCategory: incident?.waterCategory?.replace('Category ', '') || incident?.waterCategory || '1'
    },
    roomDetails: roomDetails.length > 0 ? roomDetails : [],
    complianceStandards: Array.isArray(compliance?.standards) ? compliance.standards : [],
    equipmentCosts: equipmentCosts,
    estimatedDays: summary?.estimatedDuration || (Array.isArray(equipment) && equipment.length > 0 ? equipment[0]?.estimatedDuration : null) || 4,
    businessInfo: {
      businessName: header?.businessName || null,
      businessAddress: header?.businessAddress || null,
      businessLogo: header?.businessLogo || null,
      businessABN: header?.businessABN || null,
      businessPhone: header?.businessPhone || null,
      businessEmail: header?.businessEmail || null
    },
    // Add full structured data for detailed pages
    fullData: {
      ...structuredData,
      // Ensure environmental data is passed through
      environmental: environmental || null,
      psychrometric: psychrometric || null,
      classification: structuredData.classification || null,
      hazards: hazards || {},
      timeline: structuredData.timeline || null
    }
  }
}

interface InspectionReportViewerProps {
  reportId: string
  onReportGenerated?: () => void
}

export default function InspectionReportViewer({ reportId, onReportGenerated }: InspectionReportViewerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [reportContent, setReportContent] = useState<string>('')
  const [visualData, setVisualData] = useState<any>(null)
  const [structuredReportData, setStructuredReportData] = useState<any>(null)
  const [isBasicReport, setIsBasicReport] = useState(false)
  const [hasAttemptedAutoGenerate, setHasAttemptedAutoGenerate] = useState(false)

  useEffect(() => {
    fetchReport()
  }, [reportId])

  // Auto-generate Basic Report if it doesn't exist (only once)
  useEffect(() => {
    const autoGenerateBasicReport = async () => {
      // Only auto-generate if:
      // 1. Report is loaded
      // 2. No report content exists
      // 3. Report type is Basic (or reportDepthLevel is Basic)
      // 4. Not currently generating
      // 5. Haven't already attempted auto-generation
      if (report && !reportContent && !structuredReportData && !visualData && !generating && !hasAttemptedAutoGenerate) {
        const isBasicReport = report.reportDepthLevel === 'Basic' || 
                              report.reportDepthLevel === 'basic' ||
                              (!report.reportDepthLevel && !report.detailedReport)
        
        if (isBasicReport) {
          setHasAttemptedAutoGenerate(true)
          // Small delay to ensure UI is ready
          setTimeout(() => {
            handleGenerateReport('basic')
          }, 500)
        }
      }
    }

    if (report && !loading && !hasAttemptedAutoGenerate) {
      autoGenerateBasicReport()
    }
  }, [report, reportContent, structuredReportData, visualData, generating, loading, hasAttemptedAutoGenerate])

  // Preprocess report content to ensure proper markdown heading formatting
  const preprocessReportContent = (content: string): string => {
    if (!content) return ''
    
    let processed = content
    
    // Remove HTML tags that might have been incorrectly included
    processed = processed.replace(/<p[^>]*>/gi, '')
    processed = processed.replace(/<\/p>/gi, '\n')
    processed = processed.replace(/<br\s*\/?>/gi, '\n')
    processed = processed.replace(/<div[^>]*>/gi, '')
    processed = processed.replace(/<\/div>/gi, '\n')
    processed = processed.replace(/style="[^"]*"/gi, '')
    
    // Convert "PRELIMINARY ASSESSMENT" to H1 if not already formatted
    processed = processed.replace(/^(\*\*)?PRELIMINARY ASSESSMENT[^\n]*(\*\*)?$/gim, '# PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE')
    
    // Convert "RestoreAssist Inspection Report" to H1 if not already formatted
    processed = processed.replace(/^(\*\*)?RestoreAssist\s+Inspection\s+Report(\*\*)?$/gim, '# RestoreAssist Inspection Report')
    
    // Convert "SECTION X: TITLE" patterns to H2 if not already formatted
    processed = processed.replace(/^(?!##\s)(\*\*)?(SECTION\s+\d+:\s*[^\n]+)(\*\*)?$/gim, '## $2')
    processed = processed.replace(/^##\s*SECTION\s+(\d+):\s*([^\n]+)$/gim, '## SECTION $1: $2')
    
    // Convert subsection headers like "KEY PERFORMANCE METRICS" to H3
    processed = processed.replace(/^(?!###\s)(\*\*)?(KEY\s+[A-Z\s]+|SUBSECTION\s+[A-Z]|Subsection\s+[A-Z])(\*\*)?$/gm, '### $2')
    
    // Convert "Subsection A:", "Subsection B:" etc. to H3
    processed = processed.replace(/^(?!###\s)(\*\*)?(Subsection\s+[A-E]:\s*[^\n]+)(\*\*)?$/gim, '### $2')
    
    return processed
  }

  const fetchReport = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, not wrapped in a 'report' object
        if (data && typeof data === 'object') {
          setReport(data)
          if (data.detailedReport) {
            // Check if it's structured JSON (new Basic Report format)
            try {
              const parsed = JSON.parse(data.detailedReport)
              console.log('[InspectionReportViewer] 📊 Parsed structured report data:', {
                type: parsed.type,
                hasEnvironmental: !!parsed.environmental,
                environmental: parsed.environmental,
                hasPsychrometric: !!parsed.psychrometric,
                psychrometric: parsed.psychrometric,
                hasHazards: !!parsed.hazards,
                hazards: parsed.hazards,
                hasTimeline: !!parsed.timeline,
                timeline: parsed.timeline,
                hasEquipment: parsed.equipment?.length > 0,
                equipmentCount: parsed.equipment?.length || 0,
                hasMoistureReadings: parsed.moistureReadings?.length > 0,
                moistureReadingsCount: parsed.moistureReadings?.length || 0,
                hasAffectedAreas: parsed.affectedAreas?.length > 0,
                affectedAreasCount: parsed.affectedAreas?.length || 0,
                hasScopeItems: parsed.scopeItems?.length > 0,
                scopeItemsCount: parsed.scopeItems?.length || 0,
                hasPhotos: parsed.photos?.length > 0,
                photosCount: parsed.photos?.length || 0,
                fullData: parsed
              })
              if (parsed.type === 'restoration_inspection_report') {
                setStructuredReportData(parsed)
                setIsBasicReport(true)
                setReportContent('')
                setVisualData(null)
              } else if (parsed.header && parsed.summaryMetrics) {
                // Legacy visual report format
                setVisualData(parsed)
                setIsBasicReport(true)
                setReportContent('')
                setStructuredReportData(null)
              } else {
                throw new Error('Not structured data')
              }
            } catch (e) {
              // It's text/markdown content
              const processedContent = preprocessReportContent(data.detailedReport)
              setReportContent(processedContent)
              setIsBasicReport(false)
              setStructuredReportData(null)
              setVisualData(null)
            }
          }
        } else {
          toast.error('Failed to parse report data')
        }
      } else {
        let errorMessage = 'Failed to load report'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReport = async (reportType: 'basic' | 'enhanced' = 'enhanced') => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-inspection-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, reportType })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[InspectionReportViewer] ✅ Report generation response:', {
          hasReport: !!data.report,
          hasStructuredData: !!data.report?.structuredData,
          hasDetailedReport: !!data.report?.detailedReport,
          reportData: data.report
        })
        if (data.report) {
          // Check if it's structured data (new Basic Report format)
          if (data.report.structuredData) {
            console.log('[InspectionReportViewer] 📊 Setting structured data from response:', {
              hasEnvironmental: !!data.report.structuredData.environmental,
              environmental: data.report.structuredData.environmental,
              fullStructuredData: data.report.structuredData
            })
            setStructuredReportData(data.report.structuredData)
            setIsBasicReport(true)
            setReportContent('')
            setVisualData(null)
            toast.success('Restoration inspection report generated successfully')
          } else if (data.report.detailedReport) {
            // Try to parse as structured JSON
            try {
              const parsed = JSON.parse(data.report.detailedReport)
              if (parsed.type === 'restoration_inspection_report') {
                setStructuredReportData(parsed)
                setIsBasicReport(true)
                setReportContent('')
                setVisualData(null)
                toast.success('Restoration inspection report generated successfully')
              } else if (parsed.header && parsed.summaryMetrics) {
                // Legacy visual report format
                setVisualData(parsed)
                setIsBasicReport(true)
                setReportContent('')
                setStructuredReportData(null)
                toast.success('Visual report generated successfully')
              } else {
                throw new Error('Not structured data')
              }
            } catch (e) {
              // It's text/markdown content
              const processedContent = preprocessReportContent(data.report.detailedReport)
              setReportContent(processedContent)
              setIsBasicReport(false)
              setStructuredReportData(null)
              setVisualData(null)
              toast.success('Inspection report generated successfully')
            }
          } else {
            toast.error('Failed to parse report response')
          }
          if (onReportGenerated) {
            onReportGenerated()
          }
          // Refresh report data
          fetchReport()
        } else {
          toast.error('Failed to parse report response')
        }
      } else {
        let errorMessage = 'Failed to generate report'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      toast.error('Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!reportContent) {
      toast.error('No report content to download')
      return
    }

    try {
      const response = await fetch(`/api/reports/${reportId}/download-inspection-report`)
      
      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to download PDF')
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : `Inspection-Report-${reportId}.pdf`
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Inspection Report PDF downloaded')
    } catch (error) {
      toast.error('Failed to download PDF')
    }
  }


  const handleSave = async () => {
    if (!reportContent) {
      toast.error('No report content to save')
      return
    }

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailedReport: reportContent
        })
      })

      if (response.ok) {
        toast.success('Report saved successfully')
        setEditing(false)
        fetchReport() // Refresh report data
      } else {
        toast.error('Failed to save report')
      }
    } catch (error) {
      toast.error('Failed to save report')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Professional Inspection Report
          </h2>
          <p className="text-slate-400">
            {reportContent ? 'View and download your generated report' : 'Generate your comprehensive inspection report'}
          </p>
        </div>
        <div className="flex gap-2">
          {(reportContent || visualData) && (
            <>
              {reportContent && (
                <>
                  {/* <button
                    onClick={() => setEditing(!editing)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    {editing ? 'Cancel Edit' : 'Edit'}
                  </button>
                  {editing && (
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  )} */}
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Generate Report Options */}
      {!reportContent && !structuredReportData && !visualData && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Report Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your professional inspection report with all 13 sections. The report will include comprehensive analysis based on all collected data.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleGenerateReport('basic')}
              disabled={generating}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Basic Report'}
            </button>
            <button
              onClick={() => handleGenerateReport('enhanced')}
              disabled={generating}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Enhanced Report'}
            </button>
          </div>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Processing report generation...</p>
              <p className="text-sm text-slate-400">Our AI expert system is analyzing your data and generating a professional restoration inspection report based on IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000 standards. This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Report Content */}
      {(reportContent || visualData || structuredReportData) && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">
                {isBasicReport ? 'Basic Report Generated Successfully' : 'Report Generated Successfully'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {isBasicReport && structuredReportData ? (
              <VisualDashboardReport data={convertToVisualReportData(structuredReportData) || structuredReportData} />
            ) : isBasicReport && visualData ? (
              <VisualDashboardReport data={visualData} />
            ) : editing ? (
              <div className="p-6">
                <textarea
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  rows={30}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 font-mono text-sm text-slate-300"
                />
              </div>
            ) : (
              <ProfessionalDocumentViewer content={reportContent} />
            )}
          </div>

          {/* Regenerate Option */}
          {/* <div className="flex justify-end gap-2">
            <button
              onClick={() => handleGenerateReport(isBasicReport ? 'basic' : 'enhanced')}
              disabled={generating}
              className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              Regenerate Report
            </button>
          </div> */}
        </div>
      )}

      {/* Report Info */}
      {report && (
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-sm font-semibold mb-2">Report Information</h3>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Report Depth Level:</span>
              <span className="text-slate-300 ml-2">{report.reportDepthLevel || 'Not set'}</span>
            </div>
            <div>
              <span className="text-slate-400">Version:</span>
              <span className="text-slate-300 ml-2">{report.reportVersion || 1}</span>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <span className="text-slate-300 ml-2">{report.status}</span>
            </div>
            <div>
              <span className="text-slate-400">Last Updated:</span>
              <span className="text-slate-300 ml-2">
                {new Date(report.updatedAt).toLocaleString('en-AU')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

