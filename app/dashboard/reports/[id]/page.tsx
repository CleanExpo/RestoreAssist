"use client"

import { useState, useEffect } from "react"
import { Download, Share2, MoreVertical, ChevronDown, AlertTriangle, CheckCircle, Clock } from "lucide-react"
import { useRouter } from "next/navigation"
import DetailedReportViewer from "@/components/DetailedReportViewer"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
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

    const fetchReport = async () => {
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

    fetchReport()
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
      } else {
        console.error('Failed to download report')
      }
    } catch (error) {
      console.error('Error downloading report:', error)
    } finally {
      setDownloading(false)
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
          <p className="text-slate-400">{report.clientName}</p>
          <p className="text-sm text-slate-500">{report.propertyAddress}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={downloadReport}
            disabled={downloading}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50" 
            title="Download PDF"
          >
            {downloading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500"></div>
            ) : (
              <Download size={20} />
            )}
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors" title="Share">
            <Share2 size={20} />
          </button>
          <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors" title="More">
            <MoreVertical size={20} />
          </button>
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
                    <p className="font-medium">{report.clientName}</p>
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

          {/* Damage Assessment */}
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
              <div className="px-6 pb-6 border-t border-slate-700 space-y-3 pt-4">
                {/* Equipment Information */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                    <h4 className="font-medium text-cyan-400 mb-2">Dehumidification</h4>
                    <p className="text-sm text-slate-300">Capacity: {report.dehumidificationCapacity || 'N/A'} L/day</p>
                    <p className="text-sm text-slate-300">Count: {report.airmoversCount || 'N/A'} units</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                    <h4 className="font-medium text-cyan-400 mb-2">Drying Plan</h4>
                    <p className="text-sm text-slate-300">Target Humidity: {report.targetHumidity || 'N/A'}%</p>
                    <p className="text-sm text-slate-300">Target Temperature: {report.targetTemperature || 'N/A'}°C</p>
                    <p className="text-sm text-slate-300">Estimated Time: {report.estimatedDryingTime || 'N/A'} hours</p>
                  </div>
                </div>

                {/* Equipment Placement */}
                {report.equipmentPlacement && (
                  <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600">
                    <h4 className="font-medium text-cyan-400 mb-2">Equipment Placement</h4>
                    <p className="text-sm text-slate-300">{report.equipmentPlacement}</p>
                  </div>
                )}

                {/* Safety Plan */}
                {report.safetyPlan && (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <h4 className="font-medium text-amber-400 mb-2">Safety Plan</h4>
                    <p className="text-sm text-amber-300">{report.safetyPlan}</p>
                  </div>
                )}

                {/* Containment Setup */}
                {report.containmentSetup && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <h4 className="font-medium text-red-400 mb-2">Containment Setup</h4>
                    <p className="text-sm text-red-300">{report.containmentSetup}</p>
                  </div>
                )}

                {/* Decontamination Procedures */}
                {report.decontaminationProcedures && (
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <h4 className="font-medium text-blue-400 mb-2">Decontamination Procedures</h4>
                    <p className="text-sm text-blue-300">{report.decontaminationProcedures}</p>
                  </div>
                )}

                {/* Post-Remediation Verification */}
                {report.postRemediationVerification && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <h4 className="font-medium text-green-400 mb-2">Post-Remediation Verification</h4>
                    <p className="text-sm text-green-300">{report.postRemediationVerification}</p>
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
              <div className="px-6 pb-6 border-t border-slate-700">
                {/* Insurance Coverage Information */}
                {(report.propertyCover || report.contentsCover || report.liabilityCover || report.businessInterruption || report.additionalCover) && (
                  <div className="mb-6">
                    <h4 className="font-medium text-cyan-400 mb-3">Insurance Coverage</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      {report.propertyCover && (
                        <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-600">
                          <h5 className="font-medium text-white mb-2">Property Cover</h5>
                          <div className="space-y-1 text-sm">
                            {Object.entries(report.propertyCover).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                <span className={value ? 'text-green-400' : 'text-red-400'}>
                                  {value ? 'Covered' : 'Not Covered'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {report.contentsCover && (
                        <div className="p-3 rounded-lg bg-slate-700/20 border border-slate-600">
                          <h5 className="font-medium text-white mb-2">Contents Cover</h5>
                          <div className="space-y-1 text-sm">
                            {Object.entries(report.contentsCover).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                <span className={value ? 'text-green-400' : 'text-red-400'}>
                                  {value ? 'Covered' : 'Not Covered'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Cost Summary */}
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
                  {report.completionDate && (
                    <div className="flex justify-between text-sm">
                      <span>Completion Date:</span>
                      <span className="text-slate-300">{formatDate(report.completionDate)}</span>
                    </div>
                  )}
                </div>
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
