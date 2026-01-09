"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, ArrowLeft, FileText, ClipboardList, DollarSign, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import InspectionReportViewer from "@/components/InspectionReportViewer"
import ScopeOfWorksViewer from "@/components/ScopeOfWorksViewer"
import CostEstimationViewer from "@/components/CostEstimationViewer"
import EmailDeliveryModal from "@/components/reports/email-delivery-modal"
import ScheduledEmailsList from "@/components/reports/scheduled-emails-list"
import toast from "react-hot-toast"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'inspection' | 'scope' | 'cost'>('inspection')
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)

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

        {/* Email Report Button */}
        <button
          onClick={() => setIsEmailModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          title="Send report via email"
        >
          <Mail className="h-5 w-5" />
          <span>Email Report</span>
        </button>
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
      </div>

      {/* Scheduled Deliveries Section */}
      <div className="border-t border-slate-700 pt-8">
        <h3 className="text-lg font-semibold text-white mb-4">Scheduled Deliveries</h3>
        <ScheduledEmailsList
          reportId={reportId!}
          onEmailsCancelled={() => {
            // Optional: refresh or show notification
          }}
        />
      </div>

      {/* Email Delivery Modal */}
      <EmailDeliveryModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        reportId={reportId!}
        reportTitle={report.reportNumber || report.title || 'Report'}
        defaultRecipient={report.client?.email || report.clientEmail}
        onSuccess={() => {
          setIsEmailModalOpen(false)
          refreshReport()
        }}
      />
    </div>
  )
}
