"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, ArrowLeft, FileText, ClipboardList, DollarSign, FileSignature, MessageSquare, Receipt } from "lucide-react"
import { useRouter } from "next/navigation"
import InspectionReportViewer from "@/components/InspectionReportViewer"
import ScopeOfWorksViewer from "@/components/ScopeOfWorksViewer"
import CostEstimationViewer from "@/components/CostEstimationViewer"
import AuthorityFormsViewer from "@/components/AuthorityFormsViewer"
import toast from "react-hot-toast"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'inspection' | 'scope' | 'cost' | 'authority'>('inspection')

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setReportId(resolvedParams.id)
    }
    getParams()
  }, [params])

  useEffect(() => {
    if (!reportId) return

    const fetchReportData = async () => {
      try {
        setLoading(true)
        
        // Fetch report
        const reportResponse = await fetch(`/api/reports/${reportId}`)
        if (reportResponse.ok) {
          const reportData = await reportResponse.json()
          setReport(reportData)
        } else {
          setError("Report not found")
        }
      } catch (err) {
        setError("Failed to load report")
        console.error("Error fetching report:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchReportData()
  }, [reportId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
          <p className="text-slate-400 mb-4">{error || "The requested report could not be found."}</p>
          <button
            onClick={() => router.push('/dashboard/reports')}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Back to Reports
          </button>
        </div>
      </div>
    )
  }

  const refreshReport = async () => {
    if (!reportId) return
    try {
      const reportResponse = await fetch(`/api/reports/${reportId}`)
      if (reportResponse.ok) {
        const updatedReport = await reportResponse.json()
        setReport(updatedReport)
      }
    } catch (err) {
      console.error("Error refreshing report:", err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/reports')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            title="Back to Reports"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold mb-1">
              {report.reportNumber || report.title || 'Report Details'}
            </h1>
            <p className="text-slate-400 text-sm">
              {report.clientName && `${report.clientName} • `}
              {report.propertyAddress}
              {report.propertyPostcode && ` • ${report.propertyPostcode}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/restoration-documents/invoice/new?reportId=${reportId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
          >
            <Receipt size={18} />
            Restoration Invoice
          </button>
          <button
            onClick={() => {
              const jobType = report.hazardType === 'Fire' ? 'FIRE_DAMAGE'
                : report.hazardType === 'Storm' ? 'STORM_DAMAGE'
                : report.hazardType === 'Mould' ? 'MOULD_REMEDIATION'
                : 'WATER_DAMAGE'
              const params = new URLSearchParams({ reportId: reportId! })
              if (jobType) params.set('jobType', jobType)
              if (report.propertyPostcode) params.set('postcode', report.propertyPostcode)
              router.push(`/dashboard/interviews/new?${params.toString()}`)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <MessageSquare size={18} />
            Start Interview
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('inspection')}
            className={`px-4 py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'inspection'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <FileText size={18} />
            Inspection Report
          </button>
          <button
            onClick={() => setActiveTab('scope')}
            className={`px-4 py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'scope'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <ClipboardList size={18} />
            Scope of Works
          </button>
          <button
            onClick={() => setActiveTab('cost')}
            className={`px-4 py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'cost'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <DollarSign size={18} />
            Cost Estimation
          </button>
          <button
            onClick={() => setActiveTab('authority')}
            className={`px-4 py-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'authority'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <FileSignature size={18} />
            Authority Forms
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'inspection' && (
          <InspectionReportViewer 
            reportId={reportId!}
            onReportGenerated={refreshReport}
          />
        )}
        {activeTab === 'scope' && (
          <ScopeOfWorksViewer 
            reportId={reportId!}
            onScopeGenerated={refreshReport}
          />
        )}
        {activeTab === 'cost' && (
          <CostEstimationViewer 
            reportId={reportId!}
            onEstimationGenerated={refreshReport}
          />
        )}
        {activeTab === 'authority' && (
          <AuthorityFormsViewer 
            reportId={reportId!}
          />
        )}
      </div>
    </div>
  )
}
