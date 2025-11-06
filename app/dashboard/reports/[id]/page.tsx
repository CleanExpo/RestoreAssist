"use client"

import { useState, useEffect } from "react"
import { Download, Share2, MoreVertical, ChevronDown, AlertTriangle, CheckCircle, Clock, Mail, MessageCircle, Edit2, Eye, FileJson, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import DetailedReportViewer from "@/components/DetailedReportViewer"
import EditableReportSection from "@/components/EditableReportSection"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import toast from "react-hot-toast"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [scope, setScope] = useState<any>(null)
  const [estimate, setEstimate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadingJson, setDownloadingJson] = useState(false)
  const [generatingDetailed, setGeneratingDetailed] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    claimDetails: true,
    assessment: true,
    scope: true,
    costs: true,
  })

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
          
          // Fetch scope if exists
          try {
            const scopeResponse = await fetch(`/api/scopes?reportId=${reportId}`)
            if (scopeResponse.ok) {
              const scopeData = await scopeResponse.json()
              if (scopeData.id) {
                setScope(scopeData)
              }
            }
          } catch (err) {
            console.log("No scope found for this report")
          }
          
          // Fetch estimate if exists
          try {
            const estimateResponse = await fetch(`/api/estimates?reportId=${reportId}`)
            if (estimateResponse.ok) {
              const estimateData = await estimateResponse.json()
              if (estimateData.id) {
                setEstimate(estimateData)
              }
            }
          } catch (err) {
            console.log("No estimate found for this report")
          }
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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section as keyof typeof prev]: !prev[section as keyof typeof prev],
    }))
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'pending':
        return 'bg-amber-500/20 text-amber-400'
      case 'draft':
        return 'bg-slate-500/20 text-slate-400'
      case 'completed':
        return 'bg-blue-500/20 text-blue-400'
      default:
        return 'bg-slate-500/20 text-slate-400'
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString()
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleString()
  }

  const downloadReport = async () => {
    if (!reportId) return
    
    try {
      setDownloading(true)
      toast.loading('Generating PDF report...', { id: 'download' })
      
      const response = await fetch(`/api/reports/${reportId}/download`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `water-damage-report-${report?.reportNumber || reportId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('PDF downloaded successfully!', { id: 'download' })
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to download report', { id: 'download' })
      }
    } catch (error) {
      console.error('Error downloading report:', error)
      toast.error('Failed to download report', { id: 'download' })
    } finally {
      setDownloading(false)
    }
  }

  const downloadReportJson = async () => {
    if (!reportId) return
    
    try {
      setDownloadingJson(true)
      toast.loading('Generating JSON report...', { id: 'download-json' })
      
      const response = await fetch(`/api/reports/${reportId}/download-json`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `report-${report?.reportNumber || reportId}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('JSON downloaded successfully!', { id: 'download-json' })
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to download JSON', { id: 'download-json' })
      }
    } catch (error) {
      console.error('Error downloading JSON:', error)
      toast.error('Failed to download JSON', { id: 'download-json' })
    } finally {
      setDownloadingJson(false)
    }
  }

  const generateDetailedReport = async () => {
    if (!reportId) return
    
    try {
      setGeneratingDetailed(true)
      toast.loading('Generating AI report...', { id: 'generate-detailed' })
      
      const response = await fetch(`/api/reports/${reportId}/generate-detailed`, {
        method: 'POST'
      })
      
      if (!response.ok) {
        try {
          const error = await response.json()
          toast.error(error.error || 'Failed to generate AI report', { id: 'generate-detailed' })
        } catch (e) {
          toast.error('Failed to generate AI report', { id: 'generate-detailed' })
        }
        return
      }

      // Get blob directly - API returns PDF when status is 200
      const blob = await response.blob()
      
      // Check if blob is valid and not empty
      if (!blob || blob.size === 0) {
        console.error('Blob is empty or invalid')
        toast.error('Generated PDF is empty', { id: 'generate-detailed' })
        return
      }

      // Verify it's actually a PDF by checking the first few bytes
      const firstBytes = await blob.slice(0, 4).text()
      if (!firstBytes.startsWith('%PDF')) {
        // Not a PDF, might be an error message
        try {
          const text = await blob.text()
          const error = JSON.parse(text)
          toast.error(error.error || 'Failed to generate AI report', { id: 'generate-detailed' })
        } catch (e) {
          toast.error('Invalid response format', { id: 'generate-detailed' })
        }
        return
      }

      try {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `initial-assessment-report-${report?.reportNumber || reportId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        console.log('PDF downloaded successfully')
        toast.success('AI report generated successfully!', { id: 'generate-detailed' })
      } catch (downloadError: any) {
        console.error('Error downloading PDF:', downloadError)
        toast.error('Failed to download PDF: ' + (downloadError.message || 'Unknown error'), { id: 'generate-detailed' })
      }
    } catch (error: any) {
      console.error('Error generating AI report:', error)
      console.error('Error stack:', error.stack)
      toast.error(error.message || 'Failed to generate AI report', { id: 'generate-detailed' })
    } finally {
      setGeneratingDetailed(false)
    }
  }

  const handleShareWhatsApp = () => {
    const reportUrl = window.location.href
    const message = `Water Damage Restoration Report\n\nReport Number: ${report?.reportNumber || reportId}\nClient: ${report?.client?.name || report?.clientName}\nProperty: ${report?.propertyAddress}\n\nView full report: ${reportUrl}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const handleShareEmail = () => {
    const reportUrl = window.location.href
    const subject = `Water Damage Restoration Report - ${report?.reportNumber || reportId}`
    const body = `Water Damage Restoration Report\n\nReport Number: ${report?.reportNumber || reportId}\nClient: ${report?.client?.name || report?.clientName}\nProperty: ${report?.propertyAddress}\n\nView full report: ${reportUrl}`
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoUrl
  }

  const handleSaveSection = async (section: string, data: Record<string, any>) => {
    if (!reportId) return

    try {
      const response = await fetch(`/api/reports/${reportId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, data })
      })

      if (response.ok) {
        // Refresh report data
        const reportResponse = await fetch(`/api/reports/${reportId}`)
        if (reportResponse.ok) {
          const updatedReport = await reportResponse.json()
          setReport(updatedReport)
        }
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to save section")
      }
    } catch (error) {
      console.error("Error saving section:", error)
      throw error
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
    <div className=" mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-semibold">{report.reportNumber || report.id}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(report.status)}`}>
              {report.status}
            </span>
          </div>
          <p className="text-slate-400">{report.client?.name || report.clientName}</p>
          <p className="text-sm text-slate-500">{report.propertyAddress}</p>
          {report.client && (
            <div className="mt-2 space-y-1 text-sm text-slate-500">
              {report.client.email && <p>Email: {report.client.email}</p>}
              {report.client.phone && <p>Phone: {report.client.phone}</p>}
              {report.client.company && <p>Company: {report.client.company}</p>}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setEditMode(!editMode)}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white px-6 py-2"
          >
            {editMode ? (
              <>
                <Eye className="mr-2" size={18} />
                View Mode
              </>
            ) : (
              <>
                <Edit2 className="mr-2" size={18} />
                Edit Mode
              </>
            )}
          </Button>

          <Button
            onClick={downloadReportJson}
            disabled={downloadingJson}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white px-6 py-2"
          >
            {downloadingJson ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-transparent mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <FileJson className="mr-2" size={18} />
                Download JSON
              </>
            )}
          </Button>

          <Button
            onClick={generateDetailedReport}
            disabled={generatingDetailed}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 font-semibold shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingDetailed ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2" size={18} />
                Generate AI Report
              </>
            )}
          </Button>

          <Button
            onClick={downloadReport}
            disabled={downloading}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2" size={18} />
                Download PDF
              </>
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white px-6 py-2"
              >
                <Share2 className="mr-2" size={18} />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-700 text-white w-48">
              <DropdownMenuItem 
                onClick={handleShareWhatsApp}
                className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Share via WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleShareEmail}
                className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
              >
                <Mail className="mr-2 h-4 w-4" />
                Share via Email
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-2 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <p className="text-xs font-semibold text-slate-400 uppercase">Sections</p>
            {[
              { id: "claimDetails", label: "Claim Details" },
              { id: "assessment", label: "Assessment" },
              { id: "scope", label: "Scope of Work" },
              { id: "costs", label: "Cost Estimate" },
              { id: "compliance", label: "Compliance" },
              { id: "authority", label: "Authority" },
              { id: "activity", label: "Activity Log" },
            ].map((section) => (
              <button
                key={section.id}
                onClick={() => toggleSection(section.id)}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Claim Details */}
          {editMode ? (
            <EditableReportSection
              section="Claim Details"
              fields={{
                clientName: {
                  label: "Client Name",
                  type: "text",
                  value: report.clientName || ""
                },
                propertyAddress: {
                  label: "Property Address",
                  type: "text",
                  value: report.propertyAddress || ""
                },
                hazardType: {
                  label: "Hazard Type",
                  type: "select",
                  value: report.hazardType || "",
                  options: ["Water", "Fire", "Mould", "Biohazard"]
                },
                insuranceType: {
                  label: "Insurance Type",
                  type: "text",
                  value: report.insuranceType || ""
                },
                inspectionDate: {
                  label: "Inspection Date",
                  type: "date",
                  value: report.inspectionDate ? new Date(report.inspectionDate).toISOString().slice(0, 16) : ""
                }
              }}
              onSave={handleSaveSection}
            />
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
              <button
                onClick={() => toggleSection("claimDetails")}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-700/20 transition-colors"
              >
                <h2 className="text-xl font-semibold">Claim Details</h2>
                <ChevronDown
                  size={20}
                  className={`transition-transform ${expandedSections.claimDetails ? "rotate-180" : ""}`}
                />
              </button>
              {expandedSections.claimDetails && (
                <div className="px-6 pb-6 border-t border-slate-700 space-y-4 pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Client</p>
                      <p className="font-medium">{report.client?.name || report.clientName}</p>
                      {report.client?.email && (
                        <p className="text-xs text-slate-500 mt-1">Email: {report.client.email}</p>
                      )}
                      {report.client?.phone && (
                        <p className="text-xs text-slate-500">Phone: {report.client.phone}</p>
                      )}
                      {report.client?.company && (
                        <p className="text-xs text-slate-500">Company: {report.client.company}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Report Number</p>
                      <p className="font-medium">{report.reportNumber}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Property Address</p>
                      <p className="font-medium">{report.propertyAddress}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Insurance Type</p>
                      <p className="font-medium">{report.insuranceType}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Hazard Type</p>
                      <p className="font-medium">{report.hazardType}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Inspection Date</p>
                      <p className="font-medium">{formatDate(report.inspectionDate)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Created</p>
                      <p className="font-medium">{formatDateTime(report.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Last Modified</p>
                      <p className="font-medium">{formatDateTime(report.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Damage Assessment */}
          {editMode ? (
            <EditableReportSection
              section="Assessment"
              fields={{
                waterCategory: {
                  label: "Water Category",
                  type: "select",
                  value: report.waterCategory || "",
                  options: ["Category 1", "Category 2", "Category 3"]
                },
                waterClass: {
                  label: "Water Class",
                  type: "select",
                  value: report.waterClass || "",
                  options: ["Class 1", "Class 2", "Class 3", "Class 4"]
                },
                sourceOfWater: {
                  label: "Source of Water",
                  type: "text",
                  value: report.sourceOfWater || ""
                },
                affectedArea: {
                  label: "Affected Area (sqm)",
                  type: "number",
                  value: report.affectedArea || 0
                },
                safetyHazards: {
                  label: "Safety Hazards",
                  type: "textarea",
                  value: report.safetyHazards || "",
                  multiline: true
                },
                structuralDamage: {
                  label: "Structural Damage",
                  type: "textarea",
                  value: report.structuralDamage || "",
                  multiline: true
                },
                contentsDamage: {
                  label: "Contents Damage",
                  type: "textarea",
                  value: report.contentsDamage || "",
                  multiline: true
                },
                hvacAffected: {
                  label: "HVAC Affected",
                  type: "boolean",
                  value: report.hvacAffected || false
                },
                electricalHazards: {
                  label: "Electrical Hazards",
                  type: "text",
                  value: report.electricalHazards || ""
                },
                microbialGrowth: {
                  label: "Microbial Growth",
                  type: "textarea",
                  value: report.microbialGrowth || "",
                  multiline: true
                }
              }}
              onSave={handleSaveSection}
            />
          ) : (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
              <button
                onClick={() => toggleSection("assessment")}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-700/20 transition-colors"
              >
                <h2 className="text-xl font-semibold">Damage Assessment</h2>
                <ChevronDown
                  size={20}
                  className={`transition-transform ${expandedSections.assessment ? "rotate-180" : ""}`}
                />
              </button>
              {expandedSections.assessment && (
                <div className="px-6 pb-6 border-t border-slate-700 space-y-4 pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Water Category</p>
                      <p className="font-medium">{report.waterCategory}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Water Class</p>
                      <p className="font-medium">{report.waterClass}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Affected Area</p>
                      <p className="font-medium">{report.affectedArea ? `${report.affectedArea} sqm` : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400 mb-1">Source of Water</p>
                      <p className="font-medium">{report.sourceOfWater || 'N/A'}</p>
                    </div>
                  </div>
                
                {report.safetyHazards && (
                <div>
                  <p className="text-sm text-slate-400 mb-2">Safety Hazards</p>
                    <p className="text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-300">
                      {report.safetyHazards}
                    </p>
                  </div>
                )}

                {report.structuralDamage && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Structural Damage</p>
                    <p className="text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300">
                      {report.structuralDamage}
                    </p>
                  </div>
                )}

                {report.contentsDamage && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Contents Damage</p>
                    <p className="text-sm bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-orange-300">
                      {report.contentsDamage}
                    </p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">HVAC Affected</p>
                    <p className="font-medium">{report.hvacAffected ? 'Yes' : 'No'}</p>
                </div>
                <div>
                    <p className="text-sm text-slate-400 mb-1">Electrical Hazards</p>
                    <p className="font-medium">{report.electricalHazards || 'None detected'}</p>
                  </div>
                </div>

                {report.microbialGrowth && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Microbial Growth</p>
                    <p className="text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300">
                      {report.microbialGrowth}
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* Scope of Work */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            <button
              onClick={() => toggleSection("scope")}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-700/20 transition-colors"
            >
              <h2 className="text-xl font-semibold">Scope of Work</h2>
              <ChevronDown size={20} className={`transition-transform ${expandedSections.scope ? "rotate-180" : ""}`} />
            </button>
            {expandedSections.scope && (
              <div className="px-6 pb-6 border-t border-slate-700 space-y-4 pt-4">
                {scope ? (
                  <>
                    {/* Scope Type & Summary */}
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-2">Scope Type</h4>
                        <p className="text-sm text-slate-300">{scope.scopeType}</p>
                        {scope.totalDuration && (
                          <p className="text-sm text-slate-300 mt-2">Duration: {scope.totalDuration} days</p>
                        )}
                      </div>
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-2">Cost Summary</h4>
                        <p className="text-sm text-slate-300">Labour: ${(scope.labourCostTotal || 0).toFixed(2)}</p>
                        <p className="text-sm text-slate-300">Equipment: ${(scope.equipmentCostTotal || 0).toFixed(2)}</p>
                        <p className="text-sm text-slate-300">Chemicals: ${(scope.chemicalCostTotal || 0).toFixed(2)}</p>
                        <p className="text-sm font-semibold text-cyan-400 mt-2">
                          Total: ${((scope.labourCostTotal || 0) + (scope.equipmentCostTotal || 0) + (scope.chemicalCostTotal || 0)).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Site Variables */}
                    {scope.siteVariables && (
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-2">Site Variables</h4>
                        <div className="grid md:grid-cols-2 gap-3 text-sm">
                          {scope.siteVariables.structure && (
                            <div>
                              <span className="text-slate-400">Structure: </span>
                              <span className="text-slate-300">{scope.siteVariables.structure}</span>
                            </div>
                          )}
                          {scope.siteVariables.materials && (
                            <div>
                              <span className="text-slate-400">Materials: </span>
                              <span className="text-slate-300">{scope.siteVariables.materials}</span>
                            </div>
                          )}
                          {scope.siteVariables.floors && (
                            <div>
                              <span className="text-slate-400">Floors: </span>
                              <span className="text-slate-300">{scope.siteVariables.floors}</span>
                            </div>
                          )}
                          {scope.siteVariables.condition && (
                            <div>
                              <span className="text-slate-400">Condition: </span>
                              <span className="text-slate-300">{scope.siteVariables.condition}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Labour Parameters */}
                    {scope.labourParameters?.roles && scope.labourParameters.roles.length > 0 && (
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-3">Labour Breakdown</h4>
                        <div className="space-y-2">
                          {scope.labourParameters.roles.map((role: any, index: number) => (
                            role.hours > 0 && (
                              <div key={index} className="flex justify-between text-sm">
                                <span className="text-slate-300">{role.role}:</span>
                                <span className="text-slate-300">
                                  {role.hours} hrs @ ${role.rate}/hr = ${(role.hours * role.rate).toFixed(2)}
                                </span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equipment Parameters */}
                    {scope.equipmentParameters?.equipment && scope.equipmentParameters.equipment.length > 0 && (
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-3">Equipment</h4>
                        <div className="space-y-2">
                          {scope.equipmentParameters.equipment.map((eq: any, index: number) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-slate-300">{eq.type}:</span>
                              <span className="text-slate-300">
                                {eq.quantity} units × {eq.duration} days
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chemical Application */}
                    {scope.chemicalApplication?.chemicals && scope.chemicalApplication.chemicals.length > 0 && (
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-3">Chemical Application</h4>
                        <div className="space-y-2">
                          {scope.chemicalApplication.chemicals.map((chem: any, index: number) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-slate-300">{chem.type}:</span>
                              <span className="text-slate-300">{chem.area} sqm</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Compliance Notes */}
                    {scope.complianceNotes && (
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                        <h4 className="font-medium text-green-400 mb-2">Compliance Notes</h4>
                        <p className="text-sm text-green-300 whitespace-pre-wrap">{scope.complianceNotes}</p>
                      </div>
                    )}

                    {/* Assumptions */}
                    {scope.assumptions && (
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <h4 className="font-medium text-blue-400 mb-2">Assumptions</h4>
                        <p className="text-sm text-blue-300 whitespace-pre-wrap">{scope.assumptions}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-400">No scope of work has been created for this report yet.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cost Estimate */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            <button
              onClick={() => toggleSection("costs")}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-700/20 transition-colors"
            >
              <h2 className="text-xl font-semibold">Cost Estimate</h2>
              <ChevronDown size={20} className={`transition-transform ${expandedSections.costs ? "rotate-180" : ""}`} />
            </button>
            {expandedSections.costs && (
              <div className="px-6 pb-6 border-t border-slate-700 space-y-4 pt-4">
                {estimate ? (
                  <>
                    {/* Estimate Status & Version */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          estimate.status === 'DRAFT' ? 'bg-slate-500/20 text-slate-400' :
                          estimate.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                          estimate.status === 'LOCKED' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {estimate.status}
                        </span>
                        <span className="ml-2 text-sm text-slate-400">Version {estimate.version}</span>
                      </div>
                    </div>

                    {/* Line Items */}
                    {estimate.lineItems && estimate.lineItems.length > 0 && (
                      <div className="mb-6">
                        <h4 className="font-medium text-cyan-400 mb-3">Line Items</h4>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {estimate.lineItems.map((item: any, index: number) => (
                            <div key={index} className="p-3 rounded-lg bg-slate-700/20 border border-slate-600">
                              <div className="flex justify-between items-start mb-1">
                                <div className="flex-1">
                                  <span className="text-xs text-slate-400 mr-2">{item.code}</span>
                                  <span className="text-sm font-medium text-white">{item.description}</span>
                                </div>
                                <span className="text-sm text-cyan-400 font-medium">
                                  ${(item.subtotal || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs text-slate-400 mt-1">
                                <span>{item.qty} {item.unit} × ${item.rate}/{item.unit}</span>
                                <span className="text-slate-500">{item.category}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cost Breakdown */}
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-3">Subtotals</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-300">Labour:</span>
                            <span className="text-slate-300">${(estimate.totals?.labourSubtotal || estimate.labourSubtotal || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Equipment:</span>
                            <span className="text-slate-300">${(estimate.totals?.equipmentSubtotal || estimate.equipmentSubtotal || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Chemicals:</span>
                            <span className="text-slate-300">${(estimate.totals?.chemicalsSubtotal || estimate.chemicalsSubtotal || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Subcontractors:</span>
                            <span className="text-slate-300">${(estimate.totals?.subcontractorSubtotal || estimate.subcontractorSubtotal || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                        <h4 className="font-medium text-cyan-400 mb-3">Adjustments</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-300">Overheads:</span>
                            <span className="text-slate-300">${(estimate.totals?.overheads || estimate.overheads || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Profit:</span>
                            <span className="text-slate-300">${(estimate.totals?.profit || estimate.profit || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Contingency:</span>
                            <span className="text-slate-300">${(estimate.totals?.contingency || estimate.contingency || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Escalation:</span>
                            <span className="text-slate-300">${(estimate.totals?.escalation || estimate.escalation || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grand Total */}
                    <div className="p-6 rounded-lg bg-gradient-to-r from-cyan-600/20 to-cyan-500/20 border border-cyan-500/30">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-white mb-1">Grand Total (Inc. GST)</h4>
                          <p className="text-xs text-slate-300">Subtotal Ex-GST: ${(estimate.totals?.subtotalExGST || estimate.subtotalExGST || 0).toFixed(2)}</p>
                          <p className="text-xs text-slate-300">GST (10%): ${(estimate.totals?.gst || estimate.gst || 0).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-cyan-400">
                            ${(estimate.totals?.totalIncGST || estimate.totalIncGST || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Assumptions & Compliance */}
                    {estimate.assumptions && (
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <h4 className="font-medium text-blue-400 mb-2">Assumptions</h4>
                        <p className="text-sm text-blue-300 whitespace-pre-wrap">{estimate.assumptions}</p>
                      </div>
                    )}

                    {estimate.inclusions && (
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                        <h4 className="font-medium text-green-400 mb-2">Inclusions</h4>
                        <p className="text-sm text-green-300 whitespace-pre-wrap">{estimate.inclusions}</p>
                      </div>
                    )}

                    {estimate.exclusions && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <h4 className="font-medium text-red-400 mb-2">Exclusions</h4>
                        <p className="text-sm text-red-300 whitespace-pre-wrap">{estimate.exclusions}</p>
                      </div>
                    )}

                    {estimate.complianceStatement && (
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <h4 className="font-medium text-amber-400 mb-2">Compliance Statement</h4>
                        <p className="text-sm text-amber-300 whitespace-pre-wrap">{estimate.complianceStatement}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {/* Fallback to old cost display if no estimate */}
                    {(report.propertyCover || report.contentsCover || report.liabilityCover || report.businessInterruption || report.additionalCover) && (
                      <div className="mb-6">
                        <h4 className="font-medium text-cyan-400 mb-3">Insurance Coverage</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                          {report.propertyCover && (
                            <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-600">
                              <h5 className="font-medium text-white mb-2">Property Cover</h5>
                              <div className="space-y-1 text-sm">
                                {typeof report.propertyCover === 'object' ? (
                                  Object.entries(report.propertyCover).map(([key, value]) => (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                      <span className={value ? 'text-green-400' : 'text-red-400'}>
                                        {value ? 'Covered' : 'Not Covered'}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-slate-300">{report.propertyCover}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                </div>
                    )}

                <div className="space-y-2 p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                  <div className="flex justify-between text-sm">
                        <span>Total Cost:</span>
                        <span className="text-cyan-400 font-medium">
                          {report.totalCost ? `$${report.totalCost.toLocaleString()}` : 'Not specified'}
                        </span>
                  </div>
                      {report.estimatedDryingTime && (
                  <div className="flex justify-between text-sm">
                          <span>Estimated Drying Time:</span>
                          <span className="text-slate-300">{report.estimatedDryingTime} hours</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-center py-4">
                      <p className="text-slate-400">No estimate has been created for this report yet.</p>
                  </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-6">
            <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
            <div className="space-y-4">
              <div className="flex gap-4 pb-4 border-b border-slate-700">
                <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 shrink-0"></div>
                <div className="flex-1">
                  <p className="font-medium">Report created</p>
                  <p className="text-xs text-slate-400">
                    {report.user?.name || 'System'} • {formatDateTime(report.createdAt)}
                  </p>
                </div>
              </div>
              
              {report.updatedAt && report.updatedAt !== report.createdAt && (
                <div className="flex gap-4 pb-4 border-b border-slate-700">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                  <div className="flex-1">
                    <p className="font-medium">Report updated</p>
                    <p className="text-xs text-slate-400">
                      {report.user?.name || 'System'} • {formatDateTime(report.updatedAt)}
                    </p>
                  </div>
                </div>
              )}

              {report.completionDate && (
                <div className="flex gap-4 pb-4 border-b border-slate-700">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0"></div>
                  <div className="flex-1">
                    <p className="font-medium">Report completed</p>
                    <p className="text-xs text-slate-400">
                      {report.user?.name || 'System'} • {formatDateTime(report.completionDate)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pb-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                <div className="flex-1">
                  <p className="font-medium">Status: {report.status}</p>
                  <p className="text-xs text-slate-400">
                    Current status as of {formatDateTime(report.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI-Generated Detailed Report */}
      <DetailedReportViewer 
        detailedReport={report.detailedReport} 
        reportId={report.id} 
      />
    </div>
  )
}
