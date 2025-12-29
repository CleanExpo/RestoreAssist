"use client"

import { useState, useEffect } from "react"
import { FileText, Download, Loader2, AlertCircle, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"
import VisualScopeOfWorksViewer from "./VisualScopeOfWorksViewer"

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
  const convertToVisualScopeData = (data: any, businessInfoData: any): any => {
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

  const handleDownload = async () => {
    if (!scopeDocument) {
      toast.error('No scope document to download')
      return
    }

    try {
      const response = await fetch(`/api/reports/${reportId}/download-scope`)
      
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
      const filename = filenameMatch ? filenameMatch[1] : `Scope-of-Works-${reportId}.pdf`
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Scope of Works PDF downloaded')
    } catch (error) {
      toast.error('Failed to download PDF')
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
            Scope of Works
          </h2>
          <p className="text-slate-400">
            {scopeDocument ? 'View and download your generated scope of works document' : 'Generate your comprehensive scope of works document'}
          </p>
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
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">Scope of Works Generated Successfully</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {scopeData ? (
              <VisualScopeOfWorksViewer data={convertToVisualScopeData(scopeData, businessInfo)} />
            ) : (
              <div className="p-6 text-slate-400">No scope data available</div>
            )}
          </div>

          {/* Scope Data Summary */}
          {scopeData && (
            <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
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
        </div>
      )}
    </div>
  )
}

