"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import ScopingEngine from "@/components/ScopingEngine"
import EstimationEngine from "@/components/EstimationEngine"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import toast from "react-hot-toast"
import { FileText, Calculator, DollarSign, UserPlus, AlertCircle, ArrowRight, Upload, File, FileJson, Crown, XIcon } from "lucide-react"
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

type WorkflowStage = "inspection" | "scoping" | "estimation"

interface SubscriptionStatus {
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
}

export default function NewReportPage() {
  const router = useRouter()
  const [stage, setStage] = useState<WorkflowStage>("inspection")
  const [loading, setLoading] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [reportData, setReportData] = useState<any>(null)
  const [scopeData, setScopeData] = useState<any>(null)
  const [estimateData, setEstimateData] = useState<any>(null)
  const [uploadedJsonData, setUploadedJsonData] = useState<any>(null) // Store full JSON data for later use
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // Basic inspection report data
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
    inspectionDate: new Date().toISOString().slice(0, 16)
  })
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // Load clients and subscription status
  const [clients, setClients] = useState<any[]>([])
  useEffect(() => {
    fetch("/api/clients")
      .then(res => res.json())
      .then(data => setClients(data.clients || []))
      .catch(err => console.error("Error fetching clients:", err))
    
    // Fetch subscription status
    fetch("/api/user/profile")
      .then(res => res.json())
      .then(data => {
        setSubscription({
          subscriptionStatus: data.profile?.subscriptionStatus,
          subscriptionPlan: data.profile?.subscriptionPlan
        })
      })
      .catch(err => console.error("Error fetching subscription status:", err))
  }, [])

  const hasActiveSubscription = () => {
    return subscription?.subscriptionStatus === 'ACTIVE'
  }

  // Auto-generate report number
  useEffect(() => {
    const year = new Date().getFullYear()
    const timestamp = Date.now().toString().slice(-6)
    setInspectionData(prev => ({
      ...prev,
      title: `WD-${year}-${timestamp}`
    }))
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Only accept JSON files
    if (file.type !== "application/json" && !file.name.endsWith('.json')) {
      toast.error("Please upload a JSON file only")
      return
    }

    setUploadingPdf(true)
    try {
      const fileText = await file.text()
      const jsonData = JSON.parse(fileText)

      // Store full JSON data for later use (scoping and estimation)
      setUploadedJsonData(jsonData)

      // Populate inspection form with ALL report fields from JSON
      setInspectionData(prev => ({
        ...prev,
        title: jsonData.reportNumber || jsonData.title || prev.title,
        clientName: jsonData.clientName || (jsonData.client?.name) || prev.clientName,
        propertyAddress: jsonData.propertyAddress || prev.propertyAddress,
        inspectionDate: jsonData.inspectionDate ? new Date(jsonData.inspectionDate).toISOString().slice(0, 16) : prev.inspectionDate,
        waterCategory: jsonData.waterCategory || prev.waterCategory,
        waterClass: jsonData.waterClass || prev.waterClass,
        sourceOfWater: jsonData.sourceOfWater || prev.sourceOfWater,
        affectedArea: jsonData.affectedArea || prev.affectedArea,
        hazardType: jsonData.hazardType || prev.hazardType,
        insuranceType: jsonData.insuranceType || prev.insuranceType
      }))

      // Store scope data if exists
      if (jsonData.scope) {
        setScopeData(jsonData.scope)
      }

      // Store estimate data if exists
      if (jsonData.estimate) {
        setEstimateData(jsonData.estimate)
      }

      toast.success("JSON file loaded successfully! All data populated from JSON. Create report to proceed through all steps.")
    } catch (error: any) {
      console.error("Error uploading file:", error)
      if (error.message?.includes('JSON') || error.name === 'SyntaxError') {
        toast.error("Invalid JSON file. Please check the file format.")
      } else {
        toast.error("Failed to upload file")
      }
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleCreateInspection = async () => {
    // Check if user has active subscription before allowing report creation
    if (!hasActiveSubscription()) {
      setShowUpgradeModal(true)
      return
    }

    if (!inspectionData.clientName || !inspectionData.propertyAddress || !inspectionData.waterCategory || !inspectionData.waterClass) {
      toast.error("Please fill in all required fields")
      return
    }

    setLoading(true)
    try {
      // First, check if client exists, if not create it
      let clientId = null
      const existingClient = clients.find(c => c.name === inspectionData.clientName)
      
      if (!existingClient && inspectionData.clientName) {
        // Client doesn't exist, create it first
        try {
          // Get client data from JSON if available
          const clientData = uploadedJsonData?.client || {}
          const clientEmail = clientData.email || uploadedJsonData?.clientEmail || `${inspectionData.clientName.toLowerCase().replace(/\s+/g, '.')}@example.com`
          
          const clientResponse = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: inspectionData.clientName,
              email: clientEmail,
              phone: clientData.phone || uploadedJsonData?.clientPhone || null,
              address: clientData.address || uploadedJsonData?.clientAddress || null,
              company: clientData.company || uploadedJsonData?.clientCompany || null,
              contactPerson: clientData.contactPerson || null,
              notes: clientData.notes || null,
              status: "ACTIVE"
            })
          })

          if (clientResponse.ok) {
            const newClient = await clientResponse.json()
            clientId = newClient.id
            // Add to clients list
            setClients([newClient, ...clients])
            toast.success(`Client "${inspectionData.clientName}" created successfully`)
          } else {
            const clientError = await clientResponse.json()
            if (clientResponse.status === 402 && clientError.upgradeRequired) {
              toast.error("Upgrade required to create clients")
              setLoading(false)
              return
            }
            console.warn("Failed to create client, continuing with report creation:", clientError)
          }
        } catch (clientError) {
          console.warn("Error creating client, continuing with report creation:", clientError)
        }
      } else if (existingClient) {
        clientId = existingClient.id
      }

      // Now create the report with all fields from JSON
      const reportPayload: any = {
        ...inspectionData,
        title: inspectionData.title || `WD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        description: uploadedJsonData?.description || "Initial Inspection Report",
        status: uploadedJsonData?.status || "DRAFT",
        reportNumber: uploadedJsonData?.reportNumber || inspectionData.title,
        clientId: clientId || null
      }

      // Add all additional report fields from JSON if available
      if (uploadedJsonData) {
        // IICRC S500 Compliance Fields
        if (uploadedJsonData.safetyHazards) reportPayload.safetyHazards = uploadedJsonData.safetyHazards
        if (uploadedJsonData.equipmentUsed) reportPayload.equipmentUsed = uploadedJsonData.equipmentUsed
        if (uploadedJsonData.dryingPlan) reportPayload.dryingPlan = uploadedJsonData.dryingPlan
        if (uploadedJsonData.completionDate) reportPayload.completionDate = uploadedJsonData.completionDate
        
        // Detailed Assessment Fields
        if (uploadedJsonData.structuralDamage) reportPayload.structuralDamage = uploadedJsonData.structuralDamage
        if (uploadedJsonData.contentsDamage) reportPayload.contentsDamage = uploadedJsonData.contentsDamage
        if (uploadedJsonData.hvacAffected !== undefined) reportPayload.hvacAffected = uploadedJsonData.hvacAffected
        if (uploadedJsonData.electricalHazards) reportPayload.electricalHazards = uploadedJsonData.electricalHazards
        if (uploadedJsonData.microbialGrowth) reportPayload.microbialGrowth = uploadedJsonData.microbialGrowth
        
        // Drying Plan Details
        if (uploadedJsonData.dehumidificationCapacity) reportPayload.dehumidificationCapacity = uploadedJsonData.dehumidificationCapacity
        if (uploadedJsonData.airmoversCount) reportPayload.airmoversCount = uploadedJsonData.airmoversCount
        if (uploadedJsonData.targetHumidity) reportPayload.targetHumidity = uploadedJsonData.targetHumidity
        if (uploadedJsonData.targetTemperature) reportPayload.targetTemperature = uploadedJsonData.targetTemperature
        if (uploadedJsonData.estimatedDryingTime) reportPayload.estimatedDryingTime = uploadedJsonData.estimatedDryingTime
        
        // Monitoring Data
        if (uploadedJsonData.psychrometricReadings) reportPayload.psychrometricReadings = typeof uploadedJsonData.psychrometricReadings === 'string' ? uploadedJsonData.psychrometricReadings : JSON.stringify(uploadedJsonData.psychrometricReadings)
        if (uploadedJsonData.moistureReadings) reportPayload.moistureReadings = typeof uploadedJsonData.moistureReadings === 'string' ? uploadedJsonData.moistureReadings : JSON.stringify(uploadedJsonData.moistureReadings)
        if (uploadedJsonData.equipmentPlacement) reportPayload.equipmentPlacement = uploadedJsonData.equipmentPlacement
        
        // Compliance Documentation
        if (uploadedJsonData.safetyPlan) reportPayload.safetyPlan = uploadedJsonData.safetyPlan
        if (uploadedJsonData.containmentSetup) reportPayload.containmentSetup = uploadedJsonData.containmentSetup
        if (uploadedJsonData.decontaminationProcedures) reportPayload.decontaminationProcedures = uploadedJsonData.decontaminationProcedures
        if (uploadedJsonData.postRemediationVerification) reportPayload.postRemediationVerification = uploadedJsonData.postRemediationVerification
        
        // Insurance Information
        if (uploadedJsonData.propertyCover) reportPayload.propertyCover = typeof uploadedJsonData.propertyCover === 'string' ? uploadedJsonData.propertyCover : JSON.stringify(uploadedJsonData.propertyCover)
        if (uploadedJsonData.contentsCover) reportPayload.contentsCover = typeof uploadedJsonData.contentsCover === 'string' ? uploadedJsonData.contentsCover : JSON.stringify(uploadedJsonData.contentsCover)
        if (uploadedJsonData.liabilityCover) reportPayload.liabilityCover = typeof uploadedJsonData.liabilityCover === 'string' ? uploadedJsonData.liabilityCover : JSON.stringify(uploadedJsonData.liabilityCover)
        if (uploadedJsonData.businessInterruption) reportPayload.businessInterruption = typeof uploadedJsonData.businessInterruption === 'string' ? uploadedJsonData.businessInterruption : JSON.stringify(uploadedJsonData.businessInterruption)
        if (uploadedJsonData.additionalCover) reportPayload.additionalCover = typeof uploadedJsonData.additionalCover === 'string' ? uploadedJsonData.additionalCover : JSON.stringify(uploadedJsonData.additionalCover)
        
        // AI-Generated Detailed Report
        if (uploadedJsonData.detailedReport) reportPayload.detailedReport = uploadedJsonData.detailedReport
        
        // Total Cost
        if (uploadedJsonData.totalCost !== undefined) reportPayload.totalCost = uploadedJsonData.totalCost
      }

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportPayload)
      })

      if (response.ok) {
        const createdReport = await response.json()
        setReportId(createdReport.id)
        setReportData(createdReport)
        toast.success("Inspection report created!")
        setStage("scoping")
      } else {
        const error = await response.json()
        if (response.status === 402 && error.upgradeRequired) {
          toast.error(`Insufficient credits! You have ${error.creditsRemaining} credits remaining. Please upgrade your plan.`)
          setTimeout(() => router.push("/dashboard/pricing"), 2000)
          return
        }
        toast.error(error.error || "Failed to create inspection report")
      }
    } catch (error) {
      console.error("Error creating inspection:", error)
      toast.error("Failed to create inspection report")
    } finally {
      setLoading(false)
    }
  }

  const handleScopeComplete = (scope: any) => {
    setScopeId(scope.id)
    setScopeData(scope)
    toast.success("Scope created successfully!")
    setStage("estimation")
  }

  const handleEstimateComplete = (estimate: any) => {
    toast.success("Estimate created successfully!")
    router.push("/dashboard/reports")
  }

  if (stage === "scoping" && reportId) {
    return (
      <ScopingEngine
        reportId={reportId}
        reportData={reportData}
        initialScopeData={scopeData || uploadedJsonData?.scope}
        onScopeComplete={handleScopeComplete}
        onCancel={() => setStage("inspection")}
      />
    )
  }

  if (stage === "estimation" && reportId) {
    return (
      <EstimationEngine
        reportId={reportId}
        scopeId={scopeId || undefined}
        scopeData={scopeData}
        reportData={reportData}
        initialEstimateData={estimateData || uploadedJsonData?.estimate}
        onEstimateComplete={handleEstimateComplete}
        onCancel={() => setStage("scoping")}
      />
    )
  }

  // Check if clients exist
  if (clients.length === 0) {
  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
            <p className="text-slate-400">Step 1: Initial Inspection Report</p>
      </div>

          <Card className="bg-slate-900/50 border-slate-800 shadow-2xl">
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="text-amber-400" size={40} />
            </div>

                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-white">No Clients Found</h2>
                  <p className="text-slate-400 text-lg max-w-md">
                    You need to add at least one client before you can create a report. 
                    Clients help organize your reports and track project history.
                  </p>
            </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                  <Button
                    onClick={() => router.push("/dashboard/clients")}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-6 text-base font-semibold shadow-lg shadow-cyan-600/20"
                  >
                    <UserPlus className="mr-2" size={20} />
                    Go to Clients
                    <ArrowRight className="ml-2" size={18} />
                  </Button>
                  <Button
                    onClick={() => router.push("/dashboard/reports")}
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 px-8 py-6 text-base"
                  >
                    Back to Reports
                  </Button>
                </div>

                <div className="mt-8 p-6 bg-slate-800/50 rounded-lg border border-slate-700 max-w-lg">
                  <h3 className="text-white font-semibold mb-3 flex items-center">
                    <UserPlus className="mr-2 text-cyan-400" size={18} />
                    Quick Tip
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Create a client by clicking "Add Client" in the Clients section. 
                    You can add client details like name, email, phone, and address for better organization.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
          <p className="text-slate-400">Step 1: Initial Inspection Report</p>
            </div>

        {/* Progress Indicator */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-600 text-white shadow-lg shadow-cyan-600/30">
              <FileText size={20} />
            </div>
            <span className="text-white font-medium">Inspection</span>
          </div>
          <div className="w-16 h-1 bg-slate-700"></div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-700 text-slate-400">
              <Calculator size={20} />
            </div>
            <span className="text-slate-400">Scoping</span>
          </div>
          <div className="w-16 h-1 bg-slate-700"></div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-700 text-slate-400">
              <DollarSign size={20} />
            </div>
            <span className="text-slate-400">Estimation</span>
              </div>
            </div>

        <Card className="bg-slate-900/50 border-slate-800 shadow-2xl backdrop-blur-sm">
          <CardHeader className="pb-6 border-b border-slate-800">
            <CardTitle className="text-2xl font-bold text-white">Initial Inspection Information</CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              Enter the inspection details to begin creating your restoration report
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {/* File Upload Section */}
            <label htmlFor="file-upload" className="block cursor-pointer">
              <input
                id="file-upload"
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                disabled={uploadingPdf}
                className="hidden"
              />
              <div className="p-6 rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                      <Upload className="text-cyan-400" size={24} />
                    </div>
                    <div>
                      <div className="text-white font-semibold">
                        Click here to upload JSON Report
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Upload a JSON file to populate all fields from existing report
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingPdf}
                    className="border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white pointer-events-none"
                  >
                    {uploadingPdf ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-transparent mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <File className="mr-2" size={16} />
                        Choose File
                      </>
                    )}
                  </Button>
                </div>
                <div className="mt-3 flex gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <FileJson size={12} />
                    <span>JSON files only</span>
                  </div>
                </div>
              </div>
            </label>

            <div className="space-y-3">
              <Label htmlFor="title" className="text-white font-semibold text-sm">Report Number *</Label>
              <Input
                id="title"
                value={inspectionData.title}
                onChange={(e) => setInspectionData(prev => ({ ...prev, title: e.target.value }))}
                className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all not-pointer-coarse:cursor-not-allowed"
                placeholder="Auto-generated"
                readOnly
              />
              <p className="text-xs text-slate-500 mt-1">Report number is auto-generated but can be customized</p>
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
              {!clients.find(c => c.name === inspectionData.clientName) && inspectionData.clientName && (
                <div className="space-y-2">
                  <Input
                    value={inspectionData.clientName}
                    onChange={(e) => setInspectionData(prev => ({ ...prev, clientName: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white h-11 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    placeholder="Or type new client name"
                  />
                  <p className="text-xs text-amber-400 flex items-center">
                    <AlertCircle size={12} className="mr-1" />
                    Client will be created automatically when report is saved
                  </p>
                </div>
              )}
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
                <p className="text-xs text-slate-500 mt-1">Select the type of home insurance policy</p>
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
                onClick={() => router.push("/dashboard/reports")}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white h-11 px-6 font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateInspection}
                disabled={loading || !inspectionData.clientName || !inspectionData.propertyAddress || !inspectionData.waterCategory || !inspectionData.waterClass}
                className="bg-cyan-600 hover:bg-cyan-700 text-white h-11 px-8 font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {loading ? (
                  <span className="flex items-center">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span>
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center">
                    Create Inspection & Continue to Scoping
                    <ArrowRight className="ml-2" size={18} />
                  </span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold">Upgrade Required</h2>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-slate-300">
                To create reports, you need an active subscription (Monthly or Yearly plan).
              </p>
              <p className="text-sm text-slate-400">
                Upgrade now to unlock all features including unlimited reports, API integrations, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 transition-all"
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}