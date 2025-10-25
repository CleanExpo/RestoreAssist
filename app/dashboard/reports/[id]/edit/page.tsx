"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, AlertTriangle } from "lucide-react"
import IICRCReportBuilder from "@/components/IICRCReportBuilder"

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      fetchReport(resolvedParams.id)
    }
    getParams()
  }, [params])

  const fetchReport = async (reportId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        setReport(data)
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

  const handleReportUpdate = async (updatedData: any) => {
    try {
      setSaving(true)
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedData),
      })

      if (response.ok) {
        const updatedReport = await response.json()
        setReport(updatedReport)
        // Optionally redirect to the report detail page
        router.push(`/dashboard/reports/${report.id}`)
      } else {
        console.error('Failed to update report')
      }
    } catch (error) {
      console.error('Error updating report:', error)
    } finally {
      setSaving(false)
    }
  }

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
            <h1 className="text-3xl font-semibold">Edit Report</h1>
            <p className="text-slate-400">{report.reportNumber || report.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            report.status === 'DRAFT' 
              ? 'bg-slate-500/20 text-slate-400' 
              : report.status === 'PENDING' 
              ? 'bg-amber-500/20 text-amber-400'
              : report.status === 'APPROVED'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {report.status}
          </span>
        </div>
      </div>

      {/* Report Builder with existing data */}
      <IICRCReportBuilder 
        onReportComplete={handleReportUpdate}
        initialData={report}
        isEditMode={true}
      />
    </div>
  )
}
