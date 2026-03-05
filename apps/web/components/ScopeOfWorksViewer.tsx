"use client"

import { useState, useEffect } from "react"
import { FileText, Loader2, AlertCircle, CheckCircle, Printer } from "lucide-react"
import toast from "react-hot-toast"
import VisualScopeOfWorksViewer from "./VisualScopeOfWorksViewer"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"

interface ScopeOfWorksViewerProps {
  reportId: string
  onScopeGenerated?: () => void
}

export default function ScopeOfWorksViewer({ reportId, onScopeGenerated }: ScopeOfWorksViewerProps) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [scopeDocument, setScopeDocument] = useState<string>('')
  const [scopeData, setScopeData] = useState<any>(null)
  const [businessInfo, setBusinessInfo] = useState<any>(null)

  useEffect(() => {
    fetchReport()
    fetchBusinessInfo()
  }, [reportId])

  const fetchBusinessInfo = async () => {
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setBusinessInfo({
          businessName: data.profile?.businessName || null,
          businessAddress: data.profile?.businessAddress || null,
          businessLogo: data.profile?.businessLogo || null,
          businessABN: data.profile?.businessABN || null,
          businessPhone: data.profile?.businessPhone || null,
          businessEmail: data.profile?.businessEmail || null
        })
      }
    } catch (error) {
      console.error('Error fetching business info:', error)
    }
  }

  const fetchReport = async (skipDocumentUpdate = false) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        cache: 'no-store' // Prevent caching
      })
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, not wrapped in a 'report' object
        if (data && typeof data === 'object') {
          setReport(data)
          // Only update document if we're not skipping (to avoid overwriting fresh data)
          if (!skipDocumentUpdate && data.scopeOfWorksDocument) {
            setScopeDocument(data.scopeOfWorksDocument)
          }
          if (data.scopeOfWorksData) {
            // scopeOfWorksData is already parsed by the API
            setScopeData(data.scopeOfWorksData)
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

  const handleGenerateScope = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-scope-of-works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
        cache: 'no-store' // Prevent caching
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.scopeOfWorks && data.scopeOfWorks.document) {
          // Use the document directly from the response
          const freshDocument = data.scopeOfWorks.document
          setScopeDocument(freshDocument)
          setScopeData(data.scopeOfWorks.data)
          
          // Also update report state with fresh data
          if (data.report) {
            setReport(data.report)
          }
          
          toast.success('Scope of Works generated successfully')
          if (onScopeGenerated) {
            onScopeGenerated()
          }
          
          // Force a fresh fetch after a short delay, but skip document update to keep fresh data
          setTimeout(() => {
            fetchReport(true) // Skip document update to keep the fresh one we just set
          }, 500)
        } else {
          toast.error('Failed to parse scope of works response')
        }
      } else {
        let errorMessage = 'Failed to generate scope of works'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      toast.error('Failed to generate scope of works')
    } finally {
      setGenerating(false)
    }
  }

  // Convert scope data to visual format
  const convertToVisualScopeData = (data: any, businessInfoData: any, reportData?: any): any => {
    if (!data) return null

    // Parse phases from document or build from data
    const phases = [
      {
        name: 'PHASE 1: Emergency Response & Stabilisation',
        duration: 'Day 0–1',
        activities: [
          'Site assessment',
          'Standing water extraction',
          'Initial equipment deployment',
          'Moisture/thermal imaging',
          'Site signage',
          'Client notification',
          'Authority notifications'
        ],
        deliverable: 'Equipment operational; standing water removed'
      },
      {
        name: `PHASE 2: Drying & Monitoring`,
        duration: `Days 1–${data.dryingDuration || 7} (${data.hasClass4Drying ? 'Class 4' : 'standard'})`,
        activities: [
          'Continuous equipment operation',
          'Daily moisture monitoring',
          'Thermal imaging',
          'Client check-ins',
          'Containment management',
          'Air quality monitoring'
        ],
        deliverable: 'Moisture levels approaching acceptable'
      },
      {
        name: `PHASE 3: Validation & Equipment Removal`,
        duration: `Day ${data.dryingDuration || 7}–${(data.dryingDuration || 7) + 1}`,
        activities: [
          'Final moisture testing',
          'Visual inspection',
          'Certification',
          'Equipment collection',
          'Site cleanup',
          'Documentation'
        ],
        deliverable: 'Restoration works complete'
      },
      {
        name: 'PHASE 4: Licensed Trades & Building Repairs (Outside Restoration Scope)',
        duration: 'Variable',
        activities: data.licensedTrades?.map((t: any) => t.trade) || ['None required'],
        deliverable: 'Building code compliance; structural integrity restored'
      },
      {
        name: 'PHASE 5: Contents Restoration (If Applicable)',
        duration: 'Variable',
        activities: [
          'Carpet cleaning/replacement',
          'Furniture restoration',
          'Appliance testing',
          'Contents itemisation'
        ],
        deliverable: 'Contents restored to pre-loss condition'
      }
    ]

    // Format line items
    const formattedLineItems = (data.lineItems || []).map((item: any) => ({
      code: item.id || '',
      description: item.description || '',
      quantity: item.qty || 0,
      unit: item.unit || '',
      rate: item.rate || (item.subtotal && item.qty ? item.subtotal / item.qty : 0),
      subtotal: item.subtotal || 0,
      labourBreakdown: item.labour,
      equipmentBreakdown: item.equipment
    }))

    // Format licensed trades
    const formattedLicensedTrades = (data.licensedTrades || []).map((trade: any) => ({
      trade: trade.trade || trade.name || '',
      triggerCondition: trade.trigger || trade.triggerCondition || '',
      scopeOfWork: trade.scope || trade.scopeOfWork || '',
      costStatus: trade.costStatus || 'Specialist quote required',
      timeline: trade.timeline || '',
      notes: trade.notes || ''
    }))

    // Build insurance breakdown
    const insuranceBreakdown = {
      buildingClaim: [
        'Water damage to structure',
        'Restoration services',
        ...(data.licensedTrades || [])
          .filter((t: any) => ['Plumbing', 'Electrical', 'Builder/Carpenter'].includes(t.trade || t.name))
          .map((t: any) => `${t.trade || t.name} repair/replacement`)
      ],
      contentsClaim: [
        'Carpets and flooring coverings',
        'Furniture and textiles',
        'Electrical appliances',
        'Personal items'
      ],
      additionalLivingExpenses: [
        'Temporary accommodation',
        'Meals and personal care',
        'Storage for displaced contents'
      ]
    }

    // Build coordination notes
    const coordinationNotes = []
    if (data.licensedTrades?.some((t: any) => (t.trade || t.name) === 'Plumbing')) {
      coordinationNotes.push('Plumbing must be completed BEFORE drying begins')
    }
    if (data.licensedTrades?.some((t: any) => (t.trade || t.name) === 'Electrical')) {
      coordinationNotes.push('Electrical clearance required BEFORE equipment activation')
    }
    if (data.hasClass4Drying) {
      coordinationNotes.push('Class 4 drying: Specialist assessment takes priority')
    }
    if (data.licensedTrades?.some((t: any) => (t.trade || t.name)?.includes('Mould'))) {
      coordinationNotes.push('Mould remediation: Work stops immediately; restoration resumes post-clearance')
    }
    if (data.licensedTrades?.some((t: any) => (t.trade || t.name)?.includes('Asbestos'))) {
      coordinationNotes.push('Asbestos abatement: All work suspended; WorkSafe clearance mandatory')
    }
    coordinationNotes.push('Building repairs: May occur concurrently with final drying phase')
    coordinationNotes.push('Contents restoration: Final phase after building is dry')
    
    return {
      header: {
        reportTitle: 'PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE',
        businessName: businessInfoData?.businessName || null,
        businessAddress: businessInfoData?.businessAddress || null,
        businessLogo: businessInfoData?.businessLogo || null,
        businessABN: businessInfoData?.businessABN || null,
        businessPhone: businessInfoData?.businessPhone || null,
        businessEmail: businessInfoData?.businessEmail || null,
        reportNumber: report?.reportNumber || report?.claimReferenceNumber || data.claimReference || 'N/A',
        dateGenerated: data.date || new Date().toLocaleDateString('en-AU'),
        claimReference: data.claimReference || report?.claimReferenceNumber || 'Reference',
        version: data.version || '1.0'
      },
      property: {
        clientName: reportData?.clientName || null,
        clientCompany: reportData?.client?.company || null,
        propertyAddress: reportData?.propertyAddress || null,
        propertyPostcode: reportData?.propertyPostcode || null,
        propertyId: reportData?.propertyId || null,
        jobNumber: reportData?.jobNumber || null
      },
      incident: {
        technicianName: reportData?.technicianName || null,
        technicianAttendanceDate: reportData?.technicianAttendanceDate || null,
        claimReferenceNumber: reportData?.claimReferenceNumber || null
      },
      phases,
      lineItems: formattedLineItems,
      licensedTrades: formattedLicensedTrades,
      insuranceBreakdown,
      coordinationNotes,
      totalCost: formattedLineItems.reduce((sum: number, item: any) => sum + item.subtotal, 0),
      dryingDuration: data.dryingDuration,
      affectedAreaSqm: data.affectedAreaSqm,
      waterCategory: data.waterCategory,
      hasClass4Drying: data.hasClass4Drying
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Scope of Works
          </h2>
          <p className="text-slate-400">
            {scopeDocument ? 'View your generated scope of works document' : 'Generate your comprehensive scope of works document'}
          </p>
        </div>
        <div className="flex gap-2">
          {scopeDocument && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors print:hidden"
            >
              <Printer className="w-4 h-4" />
              Print Report
            </button>
          )}
        </div>
      </div>

      {/* Generate Scope Options */}
      {!scopeDocument && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Scope of Works Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your comprehensive scope of works document with all remediation phases, restoration works line items, licensed trades requirements, and coordination notes.
          </p>
          <button
            onClick={handleGenerateScope}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Scope of Works'}
          </button>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Processing scope of works generation...</p>
              <p className="text-sm text-slate-400">Our AI expert system is analysing your data and generating a professional scope of works document based on IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000 standards. This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Scope Document Content */}
      {scopeDocument && (
        <>
          {/* Print Styles - EXACT COPY from InspectionReportViewer */}
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

  #scope-of-works-print-content,
  #scope-of-works-print-content * {
    visibility: visible !important;
  }

  /* Absolute positioning to top-left */
  #scope-of-works-print-content {
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
          
          <div id="scope-of-works-print-content" className="bg-white text-slate-900 print-content">
            <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10 print:hidden">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-green-400 font-medium">Scope of Works Generated Successfully</p>
              </div>
            </div>

            <div className="w-full p-0 px-4 space-y-8">
              {scopeData ? (
                <VisualScopeOfWorksViewer data={convertToVisualScopeData(scopeData, businessInfo, report)} />
              ) : scopeDocument ? (
                <ProfessionalDocumentViewer content={scopeDocument} />
              ) : (
                <div className="p-6 text-slate-400">No scope data available</div>
              )}
            </div>
          </div>

          {/* Scope Data Summary */}
          {scopeData && (
            <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 print:hidden">
              <h3 className="text-sm font-semibold mb-2">Scope Summary</h3>
              <div className="grid md:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-slate-400">Line Items:</span>
                  <span className="text-slate-300 ml-2">{scopeData.lineItems?.length || 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">Licensed Trades:</span>
                  <span className="text-slate-300 ml-2">{scopeData.licensedTrades?.length || 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">Drying Duration:</span>
                  <span className="text-slate-300 ml-2">{scopeData.dryingDuration || 7} days</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

