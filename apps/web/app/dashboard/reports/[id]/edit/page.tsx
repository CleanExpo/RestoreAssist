"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, AlertTriangle, FileText, Calculator, DollarSign } from "lucide-react"
import ScopingEngine from "@/components/ScopingEngine"
import EstimationEngine from "@/components/EstimationEngine"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import toast from "react-hot-toast"

type EditStage = "inspection" | "scoping" | "estimation"

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [reportId, setReportId] = useState<string | null>(null)
  const [stage, setStage] = useState<EditStage>("inspection")
  const [report, setReport] = useState<any>(null)
  const [scope, setScope] = useState<any>(null)
  const [estimate, setEstimate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<any[]>([])

  // Inspection data
  const [inspectionData, setInspectionData] = useState({
    title: "",
    clientName: "",
    propertyAddress: "",
    hazardType: "Water",
    insuranceType: "Building and Contents Insurance",
    waterCategory: "",
    waterClass: "",
    sourceOfWater: "",
    affectedArea: 0,
    inspectionDate: ""
  })

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setReportId(resolvedParams.id)
      await fetchReportData(resolvedParams.id)
    }
    getParams()
  }, [params])

  // Load clients
  useEffect(() => {
    fetch("/api/clients")
      .then(res => res.json())
      .then(data => setClients(data.clients || []))
      .catch(err => console.error("Error fetching clients:", err))
  }, [])

  const fetchReportData = async (reportId: string) => {
    try {
      setLoading(true)
      
      // Fetch report
      const reportResponse = await fetch(`/api/reports/${reportId}`)
      if (reportResponse.ok) {
        const reportData = await reportResponse.json()
        setReport(reportData)
        
        // Populate inspection form
        setInspectionData({
          title: reportData.title || reportData.reportNumber || "",
          clientName: reportData.clientName || "",
          propertyAddress: reportData.propertyAddress || "",
          hazardType: reportData.hazardType || "Water",
          insuranceType: reportData.insuranceType || "Building and Contents Insurance",
          waterCategory: reportData.waterCategory || "",
          waterClass: reportData.waterClass || "",
          sourceOfWater: reportData.sourceOfWater || "",
          affectedArea: reportData.affectedArea || 0,
          inspectionDate: reportData.inspectionDate ? new Date(reportData.inspectionDate).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
        })
        
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

  const handleInspectionUpdate = async () => {
    if (!inspectionData.clientName || !inspectionData.propertyAddress || !inspectionData.waterCategory || !inspectionData.waterClass) {
      toast.error("Please fill in all required fields")
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inspectionData,
          title: inspectionData.title || report?.reportNumber,
          description: "Initial Inspection Report"
        })
      })

      if (response.ok) {
        const updatedReport = await response.json()
        setReport(updatedReport)
        toast.success("Inspection report updated!")
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to update inspection report")
      }
    } catch (error) {
      console.error("Error updating inspection:", error)
      toast.error("Failed to update inspection report")
    } finally {
      setSaving(false)
    }
  }

  const handleScopeComplete = (updatedScope: any) => {
    setScope(updatedScope)
    toast.success("Scope updated successfully!")
  }

  const handleEstimateComplete = (updatedEstimate: any) => {
    setEstimate(updatedEstimate)
    toast.success("Estimate updated successfully!")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2 text-white">Report Not Found</h2>
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

  // Show Scoping Engine
  if (stage === "scoping" && reportId) {
    return (
      <ScopingEngine
        reportId={reportId}
        reportData={report}
        initialScopeData={scope}
        onScopeComplete={handleScopeComplete}
        onCancel={() => setStage("inspection")}
      />
    )
  }

  // Show Estimation Engine
  if (stage === "estimation" && reportId) {
    return (
      <EstimationEngine
        reportId={reportId}
        scopeId={scope?.id}
        scopeData={scope}
        reportData={report}
        initialEstimateData={estimate}
        onEstimateComplete={handleEstimateComplete}
        onCancel={() => setStage("scoping")}
      />
    )
  }

  // Main edit interface with tabs
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/dashboard/reports/${reportId}`)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                title="Back to Report"
              >
                <ArrowLeft size={20} className="text-white" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Edit Report</h1>
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
                  : report.status === 'COMPLETED'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {report.status}
              </span>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${stage === "inspection" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30" : scope ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                <FileText size={20} />
              </div>
              <span className={`font-medium ${stage === "inspection" ? "text-white" : "text-slate-400"}`}>Inspection</span>
            </div>
            <div className="w-16 h-1 bg-slate-700"></div>
            <div className="flex items-center space-x-2">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${stage === "scoping" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30" : scope ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                <Calculator size={20} />
              </div>
              <span className={`font-medium ${stage === "scoping" ? "text-white" : "text-slate-400"}`}>Scoping</span>
            </div>
            <div className="w-16 h-1 bg-slate-700"></div>
            <div className="flex items-center space-x-2">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${stage === "estimation" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30" : estimate ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                <DollarSign size={20} />
              </div>
              <span className={`font-medium ${stage === "estimation" ? "text-white" : "text-slate-400"}`}>Estimation</span>
            </div>
          </div>
        </div>

        {/* Tabs for Navigation */}
        <Tabs defaultValue="inspection" value={stage} onValueChange={(value) => setStage(value as EditStage)} className="w-full">
          <TabsList className="bg-slate-800 border border-slate-700 mb-6">
            <TabsTrigger value="inspection" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <FileText className="mr-2" size={16} />
              Inspection Report
            </TabsTrigger>
            <TabsTrigger value="scoping" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <Calculator className="mr-2" size={16} />
              Scoping {scope && <span className="ml-1 text-xs">✓</span>}
            </TabsTrigger>
            <TabsTrigger value="estimation" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <DollarSign className="mr-2" size={16} />
              Estimation {estimate && <span className="ml-1 text-xs">✓</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inspection">
            <Card className="bg-slate-900/50 border-slate-800 shadow-2xl backdrop-blur-sm">
              <CardHeader className="pb-6 border-b border-slate-800">
                <CardTitle className="text-2xl font-bold text-white">Edit Inspection Information</CardTitle>
                <CardDescription className="text-slate-400 mt-2">
                  Update the initial inspection details for this report
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="space-y-3">
                  <Label htmlFor="title" className="text-white font-semibold text-sm">Report Number *</Label>
                  <Input
                    id="title"
                    value={inspectionData.title}
                    onChange={(e) => setInspectionData(prev => ({ ...prev, title: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                    placeholder="Auto-generated"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="clientName" className="text-white font-semibold text-sm">Client Name *</Label>
                  <Select
                    value={inspectionData.clientName}
                    onValueChange={(value) => setInspectionData(prev => ({ ...prev, clientName: value }))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
                      <SelectValue placeholder="Select a client from your list" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.name} className="text-white hover:bg-slate-700">
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="propertyAddress" className="text-white font-semibold text-sm">Property Address *</Label>
                  <Input
                    id="propertyAddress"
                    value={inspectionData.propertyAddress}
                    onChange={(e) => setInspectionData(prev => ({ ...prev, propertyAddress: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                    placeholder="Enter full property address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="hazardType" className="text-white font-semibold text-sm">Hazard Type</Label>
                    <Select
                      value={inspectionData.hazardType}
                      onValueChange={(value) => setInspectionData(prev => ({ ...prev, hazardType: value }))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="Water" className="text-white hover:bg-slate-700">Water</SelectItem>
                        <SelectItem value="Fire" className="text-white hover:bg-slate-700">Fire</SelectItem>
                        <SelectItem value="Mould" className="text-white hover:bg-slate-700">Mould</SelectItem>
                        <SelectItem value="Biohazard" className="text-white hover:bg-slate-700">Biohazard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="insuranceType" className="text-white font-semibold text-sm">Insurance Type</Label>
                    <Select
                      value={inspectionData.insuranceType}
                      onValueChange={(value) => setInspectionData(prev => ({ ...prev, insuranceType: value }))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
                        <SelectValue placeholder="Select insurance type" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="Building and Contents Insurance" className="text-white hover:bg-slate-700">
                          Building and Contents Insurance
                        </SelectItem>
                        <SelectItem value="Standalone Building Insurance" className="text-white hover:bg-slate-700">
                          Standalone Building Insurance
                        </SelectItem>
                        <SelectItem value="Standalone Contents Insurance" className="text-white hover:bg-slate-700">
                          Standalone Contents Insurance
                        </SelectItem>
                        <SelectItem value="Landlord Insurance" className="text-white hover:bg-slate-700">
                          Landlord Insurance
                        </SelectItem>
                        <SelectItem value="Portable Valuables Insurance" className="text-white hover:bg-slate-700">
                          Portable Valuables Insurance
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="waterCategory" className="text-white font-semibold text-sm">Water Category *</Label>
                    <Select
                      value={inspectionData.waterCategory}
                      onValueChange={(value) => setInspectionData(prev => ({ ...prev, waterCategory: value }))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="Category 1" className="text-white hover:bg-slate-700">Category 1 (Clean Water)</SelectItem>
                        <SelectItem value="Category 2" className="text-white hover:bg-slate-700">Category 2 (Grey Water)</SelectItem>
                        <SelectItem value="Category 3" className="text-white hover:bg-slate-700">Category 3 (Black Water)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="waterClass" className="text-white font-semibold text-sm">Water Class *</Label>
                    <Select
                      value={inspectionData.waterClass}
                      onValueChange={(value) => setInspectionData(prev => ({ ...prev, waterClass: value }))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="Class 1" className="text-white hover:bg-slate-700">Class 1</SelectItem>
                        <SelectItem value="Class 2" className="text-white hover:bg-slate-700">Class 2</SelectItem>
                        <SelectItem value="Class 3" className="text-white hover:bg-slate-700">Class 3</SelectItem>
                        <SelectItem value="Class 4" className="text-white hover:bg-slate-700">Class 4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="sourceOfWater" className="text-white font-semibold text-sm">Source of Water</Label>
                    <Input
                      id="sourceOfWater"
                      value={inspectionData.sourceOfWater}
                      onChange={(e) => setInspectionData(prev => ({ ...prev, sourceOfWater: e.target.value }))}
                      className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                      placeholder="e.g., Burst pipe, Roof leak"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="affectedArea" className="text-white font-semibold text-sm">Affected Area (sqm) *</Label>
                    <Input
                      id="affectedArea"
                      type="number"
                      value={inspectionData.affectedArea}
                      onChange={(e) => setInspectionData(prev => ({ ...prev, affectedArea: parseFloat(e.target.value) || 0 }))}
                      className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="inspectionDate" className="text-white font-semibold text-sm">Inspection Date & Time</Label>
                  <Input
                    id="inspectionDate"
                    type="datetime-local"
                    value={inspectionData.inspectionDate}
                    onChange={(e) => setInspectionData(prev => ({ ...prev, inspectionDate: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                </div>

                <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-end gap-4">
                  <Button
                    onClick={() => router.push(`/dashboard/reports/${reportId}`)}
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white h-11 px-6 font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInspectionUpdate}
                    disabled={saving || !inspectionData.clientName || !inspectionData.propertyAddress || !inspectionData.waterCategory || !inspectionData.waterClass}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white h-11 px-8 font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {saving ? "Saving..." : "Save Inspection"}
                  </Button>
                  {scope && (
                    <Button
                      onClick={() => setStage("scoping")}
                      className="bg-green-600 hover:bg-green-700 text-white h-11 px-6 font-semibold"
                    >
                      Edit Scoping →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scoping">
            <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-lg">
              <Calculator className="mx-auto h-12 w-12 text-cyan-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {scope ? "Edit Scope of Work" : "Create Scope of Work"}
              </h3>
              <p className="text-slate-400 mb-6">
                {scope ? "Click below to edit the existing scope" : "Create a scope based on the inspection report"}
              </p>
              <Button
                onClick={() => setStage("scoping")}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-6 text-base font-semibold"
              >
                {scope ? "Edit Scope" : "Create Scope"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="estimation">
            <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-lg">
              <DollarSign className="mx-auto h-12 w-12 text-cyan-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                {estimate ? "Edit Estimate" : "Create Estimate"}
              </h3>
              <p className="text-slate-400 mb-6">
                {estimate ? "Click below to edit the existing estimate" : scope ? "Create an estimate based on the scope" : "Create a scope first"}
              </p>
              <Button
                onClick={() => {
                  if (!scope) {
                    toast.error("Please create a scope first")
                    setStage("scoping")
                  } else {
                    setStage("estimation")
                  }
                }}
                disabled={!scope}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {estimate ? "Edit Estimate" : "Create Estimate"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
