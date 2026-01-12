"use client"

import { AlertCircle, CheckCircle, Download, FileText, Table, Loader2, Printer } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"
import RestorationInspectionReportViewer from "./RestorationInspectionReportViewer"

interface InspectionReportViewerProps {
  reportId: string
  onReportGenerated?: () => void
}

export default function InspectionReportViewer({ reportId, onReportGenerated }: InspectionReportViewerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
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

  const handlePrint = () => {
    window.print()
  }

  const handleExportExcel = async () => {
    setExportingExcel(true)
    try {
      toast.loading('Generating Excel report...', { id: 'excel-export' })
      
      const response = await fetch(`/api/reports/${reportId}/export-excel?includeScope=true&includeEstimate=true`, {
        method: 'GET',
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to generate Excel report', { id: 'excel-export' })
        return
      }

      const blob = await response.blob()
      
      // Check if blob is valid
      if (!blob || blob.size === 0) {
        toast.error('Generated Excel file is empty', { id: 'excel-export' })
        return
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : `Report-${reportId}.xlsx`

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('Excel report downloaded successfully!', { id: 'excel-export' })
    } catch (error) {
      console.error('Error exporting Excel:', error)
      toast.error('Failed to generate Excel report', { id: 'excel-export' })
    } finally {
      setExportingExcel(false)
    }
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
            {reportContent || visualData || structuredReportData ? 'View and download your generated report' : 'Generate your comprehensive inspection report'}
          </p>
        </div>
        <div className="flex gap-2">
          {(reportContent || visualData || structuredReportData) && (
            <>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors print:hidden"
              >
                <Printer className="w-4 h-4" />
                Print Report
              </button>
              {reportContent && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors print:hidden"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              )}
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-colors print:hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingExcel ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Table className="w-4 h-4" />
                    Generate Excel Report
                  </>
                )}
              </button>
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
          <div className="flex gap-4 flex-wrap">
            {(() => {
              const reportDepthLevel = (report?.reportDepthLevel || '').toLowerCase()
              if (reportDepthLevel === 'basic') {
                return (
                  <button
                    onClick={() => handleGenerateReport('basic')}
                    disabled={generating}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : 'Generate Basic Report'}
                  </button>
                )
              } else if (reportDepthLevel === 'enhanced') {
                return (
                  <button
                    onClick={() => handleGenerateReport('enhanced')}
                    disabled={generating}
                    className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : 'Generate Enhanced Report'}
                  </button>
                )
              } else if (reportDepthLevel === 'optimised' || reportDepthLevel === 'optimized') {
                return (
                  <button
                    onClick={() => handleGenerateReport('enhanced')}
                    disabled={generating}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : 'Generate Optimised Report'}
                  </button>
                )
              } else {
                // No report type set yet - show basic as default
                return (
                  <button
                    onClick={() => handleGenerateReport('basic')}
                    disabled={generating}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {generating ? 'Generating...' : 'Generate Basic Report'}
                  </button>
                )
              }
            })()}
            {(reportContent || visualData || structuredReportData) && (
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {exportingExcel ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Excel...
                  </>
                ) : (
                  <>
                    <Table className="w-4 h-4" />
                    Generate Excel Report
                  </>
                )}
              </button>
            )}
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
              <p className="text-sm text-slate-400">Our AI expert system is analysing your data and generating a professional restoration inspection report based on IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000 standards. This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Report Content */}
      {(reportContent || visualData || structuredReportData) && (
        <>
          {/* Print Styles - EXACT COPY from Scope of Works */}
          <style dangerouslySetInnerHTML={{__html: `
        @media print {

  /* Force real A4 page */
  @page {
    size: A4 portrait;
    margin: 20mm;
    /* Disable browser headers and footers (URL, page numbers, etc.) */
    marks: none;
  }

  /* Hide any browser-added URLs or page info */
  body::after,
  body::before,
  html::after,
  html::before {
    display: none !important;
    content: none !important;
  }

  html, body {
    width: 210mm;
    height: auto;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }

  /* Kill everything except report */
  body * {
    visibility: hidden !important;
  }

  #inspection-report-print-content,
  #inspection-report-print-content * {
    visibility: visible !important;
  }

  /* Absolute positioning to top-left */
  #inspection-report-print-content {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 210mm !important;
    max-width: 210mm !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Remove screen layout limits */
  .max-w-8xl,
  .mx-auto,
  .p-8,
  .print\\:p-0 {
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Remove sticky headers */
  .sticky {
    position: static !important;
  }

  /* Clean typography */
  h1 {
    font-size: 24pt !important;
    line-height: 1.2 !important;
    margin-bottom: 10mm !important;
  }

  h2 {
    font-size: 16pt !important;
    margin-top: 8mm !important;
  }

  p, li, td {
    font-size: 10.5pt !important;
  }

  /* Tables behave professionally */
  table {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  thead {
    display: table-header-group !important;
  }

  tr {
    page-break-inside: avoid !important;
  }

  /* Page control */
  .print-break {
    page-break-after: always !important;
  }

  /* Remove shadows & UI fluff */
  * {
    box-shadow: none !important;
    background-image: none !important;
  }

}

          `}} />
          
          <div id="inspection-report-print-content" className="bg-white text-slate-900 print-content">
            <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10 print:hidden">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-green-400 font-medium">
                  {isBasicReport ? 'Basic Report Generated Successfully' : 'Report Generated Successfully'}
                </p>
              </div>
            </div>

            <div className="w-full p-0 px-4 space-y-8">
              {isBasicReport && structuredReportData ? (
                <RestorationInspectionReportViewer data={structuredReportData} />
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
          </div>
        </>
      )}

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

