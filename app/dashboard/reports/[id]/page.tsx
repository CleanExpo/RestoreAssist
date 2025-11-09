"use client"

import { useState, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import DetailedReportViewer from "@/components/DetailedReportViewer"
import TechnicianInputForm from "@/components/TechnicianInputForm"
import toast from "react-hot-toast"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)

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

  return (
    <div className="mx-auto h-full">
      {/* AI-Generated Detailed Report or Technician Input Form */}
      {report.detailedReport ? (
        <DetailedReportViewer 
          detailedReport={report.detailedReport} 
          reportId={report.id} 
        />
      ) : (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Generate Enhanced Professional Report</h3>
            <p className="text-sm text-slate-400">
              Enter your technician notes to generate a comprehensive professional report using AI.
            </p>
          </div>
          <TechnicianInputForm
            reportId={report.id}
            onReportGenerated={async (id) => {
              // Refresh report data
              const reportResponse = await fetch(`/api/reports/${id}`)
              if (reportResponse.ok) {
                const updatedReport = await reportResponse.json()
                setReport(updatedReport)
                toast.success("Enhanced report generated successfully!")
              }
            }}
            initialData={{
              technicianNotes: report.equipmentUsed ? (() => {
                try {
                  const equipmentData = JSON.parse(report.equipmentUsed)
                  return equipmentData.technicianNotes || ""
                } catch {
                  return ""
                }
              })() : "",
              dateOfAttendance: report.equipmentUsed ? (() => {
                try {
                  const equipmentData = JSON.parse(report.equipmentUsed)
                  return equipmentData.dateOfAttendance || ""
                } catch {
                  return ""
                }
              })() : "",
              clientContacted: report.equipmentUsed ? (() => {
                try {
                  const equipmentData = JSON.parse(report.equipmentUsed)
                  return equipmentData.clientContacted || ""
                } catch {
                  return ""
                }
              })() : ""
            }}
          />
        </div>
      )}
    </div>
  )
}
