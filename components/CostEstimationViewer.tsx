"use client"

import { useState, useEffect } from "react"
import { DollarSign, Loader2, AlertCircle, CheckCircle, Printer } from "lucide-react"
import toast from "react-hot-toast"
import VisualCostEstimationViewer from "./VisualCostEstimationViewer"

interface CostEstimationViewerProps {
  reportId: string
  onEstimationGenerated?: () => void
}

export default function CostEstimationViewer({ reportId, onEstimationGenerated }: CostEstimationViewerProps) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [costDocument, setCostDocument] = useState<string>('')
  const [costData, setCostData] = useState<any>(null)
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

  const fetchReport = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, not wrapped in a 'report' object
        if (data && typeof data === 'object') {
          setReport(data)
          if (data.costEstimationDocument) {
            setCostDocument(data.costEstimationDocument)
          }
          if (data.costEstimationData) {
            // costEstimationData is already parsed by the API
            setCostData(data.costEstimationData)
          }
        } else {
          console.error('Unexpected response structure:', data)
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
      console.error('Error fetching report:', error)
      toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateEstimation = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-cost-estimation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.costEstimation && data.costEstimation.document) {
          setCostDocument(data.costEstimation.document)
          setCostData(data.costEstimation.data)
          toast.success('Cost Estimation generated successfully')
          if (onEstimationGenerated) {
            onEstimationGenerated()
          }
          fetchReport()
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse cost estimation response')
        }
      } else {
        let errorMessage = 'Failed to generate cost estimation'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error generating cost estimation:', error)
      toast.error('Failed to generate cost estimation')
    } finally {
      setGenerating(false)
    }
  }

  // Convert cost data to visual format
  const convertToVisualCostData = (data: any, businessInfoData: any, reportData?: any): any => {
    if (!data) return null

    // Extract disclaimers, assumptions, and exclusions from document or build defaults
    const disclaimers = data.disclaimers || [
      'This is a preliminary estimate based on available information at the time of assessment.',
      'Final costs may vary based on actual site conditions, material availability, and scope changes.',
      'All prices are subject to change without notice.',
      'GST is calculated at 10% as per Australian tax regulations.',
      'Specialist trades (plumbing, electrical, etc.) require separate quotes and are not included in this estimate.'
    ]

    const assumptions = data.assumptions || [
      'Standard business hours apply unless otherwise specified.',
      'Equipment availability is assumed.',
      'No unforeseen structural damage is present.',
      'Access to property is available during standard hours.'
    ]

    const exclusions = data.exclusions || [
      'Licensed trades (plumber, electrician, builder) - separate quotes required',
      'Asbestos abatement - specialist assessment and quote required',
      'Mould remediation beyond standard treatment - specialist quote required',
      'Structural repairs - builder assessment required',
      'Contents restoration - separate quote required',
      'Additional living expenses',
      'Any work outside the defined scope'
    ]

    return {
      header: {
        reportTitle: 'COST ESTIMATION — PRELIMINARY',
        businessName: businessInfoData?.businessName || null,
        businessAddress: businessInfoData?.businessAddress || null,
        businessLogo: businessInfoData?.businessLogo || null,
        businessABN: businessInfoData?.businessABN || null,
        businessPhone: businessInfoData?.businessPhone || null,
        businessEmail: businessInfoData?.businessEmail || null,
        reportNumber: reportData?.reportNumber || reportData?.claimReferenceNumber || data.claimReference || 'N/A',
        dateGenerated: data.date || new Date().toLocaleDateString('en-AU'),
        claimReference: data.claimReference || reportData?.claimReferenceNumber || 'Reference',
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
      categories: data.categories || {},
      totals: data.totals || {
        totalLabour: 0,
        totalEquipment: 0,
        totalChemicals: 0,
        totalAdmin: 0,
        subtotal: 0,
        gst: 0,
        totalIncGST: 0
      },
      industryComparison: data.industryComparison || null,
      costDrivers: data.costDrivers || [],
      flaggedItems: data.flaggedItems || [],
      assumptions,
      exclusions,
      disclaimers
    }
  }

  const handlePrint = () => {
    window.print()
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
            <DollarSign className="w-6 h-6" />
            Cost Estimation
          </h2>
          <p className="text-slate-400">
            {costDocument ? 'View your generated cost estimation document' : 'Generate your comprehensive cost estimation document'}
          </p>
        </div>
        <div className="flex gap-2">
          {costDocument && (
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

      {/* Generate Estimation Options */}
      {!costDocument && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Cost Estimation Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your comprehensive cost estimation document with detailed cost breakdowns by category, industry comparisons, and all necessary disclaimers.
          </p>
          <button
            onClick={handleGenerateEstimation}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Cost Estimation'}
          </button>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Processing cost estimation generation...</p>
              <p className="text-sm text-slate-400">Our AI expert system is analysing your data and generating a professional cost estimation document based on IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000 standards. This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Document Content */}
      {costDocument && costData && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">Cost Estimation Generated Successfully</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {costData ? (
              <VisualCostEstimationViewer data={convertToVisualCostData(costData, businessInfo, report)} />
            ) : (
              <div className="p-6 text-slate-400">No cost data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

