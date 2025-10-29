"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Save, FileText, Calculator, Settings, AlertCircle, CheckCircle, Lock, History, Plus, Trash2, Edit2, ChevronRight } from "lucide-react"
import toast from "react-hot-toast"

interface EstimationEngineProps {
  reportId: string
  scopeId?: string
  scopeData?: any
  reportData?: any
  initialEstimateData?: any
  onEstimateComplete: (estimateData: any) => void
  onCancel: () => void
}

const LINE_ITEM_CATEGORIES = [
  "Prelims & Site Setup",
  "Mitigation/Drying",
  "Demolition/Removal",
  "Restoration/Build-Back",
  "Specialist Services",
  "Contents",
  "Travel & Logistics",
  "Compliance & Testing",
  "Project Management/Admin"
]

export default function EstimationEngine({ 
  reportId, 
  scopeId, 
  scopeData, 
  reportData,
  initialEstimateData,
  onEstimateComplete, 
  onCancel 
}: EstimationEngineProps) {
  const [activeTab, setActiveTab] = useState("inputs")
  const [loading, setLoading] = useState(false)
  const [estimateData, setEstimateData] = useState({
    // Rate Tables
    rateTables: {
      labour: {
        leadTech: { normal: 75, afterHours: 93.75 },
        supervisor: { normal: 90, afterHours: 112.50 },
        tech: { normal: 65, afterHours: 81.25 },
        admin: { normal: 70, afterHours: 87.50 }
      },
      subcontractors: {
        electrician: 120,
        plumber: 110,
        hygienist: 150,
        asbestosAssessor: 200,
        carpenter: 95,
        roofer: 105
      },
      equipment: {
        airMover: { day: 40, week: 160, month: 500 },
        dehumidifier: { day: 110, week: 500, month: 2000 },
        afd: { day: 100, week: 500, month: 2000 }
      },
      chemicals: {
        antiMicrobial: 1.50,
        bioDecontamination: 2.50,
        mouldRemediation: 1.50
      }
    },
    
    // Commercial Parameters
    commercialParams: {
      overheadsPercent: 15,
      profitPercent: 20,
      overheadsAppliedTo: ["labour", "equipment", "subs", "materials"],
      profitAppliedAfter: true,
      contingencyPercent: 10,
      contingencyRationale: "",
      escalationPercent: 0,
      escalationNote: "",
      gstPercent: 10,
      roundTo: 5
    },
    
    // Line Items
    lineItems: [] as any[],
    
    // Assumptions & Compliance
    assumptions: "",
    inclusions: "",
    exclusions: "",
    allowances: "",
    complianceStatement: "",
    disclaimer: "",
    
    // Status
    status: "DRAFT",
    version: 1
  })

  // Refs to track previous values and prevent infinite loops
  const prevLineItemsRef = useRef<string>('')
  const prevParamsRef = useRef<string>('')
  const isInitialMount = useRef(true)

  // Load initial estimate data if editing
  useEffect(() => {
    if (initialEstimateData && isInitialMount.current) {
      try {
        const parsedData = {
          ...estimateData,
          rateTables: typeof initialEstimateData.rateTables === 'string'
            ? JSON.parse(initialEstimateData.rateTables)
            : initialEstimateData.rateTables || estimateData.rateTables,
          commercialParams: typeof initialEstimateData.commercialParams === 'string'
            ? JSON.parse(initialEstimateData.commercialParams)
            : initialEstimateData.commercialParams || estimateData.commercialParams,
          lineItems: initialEstimateData.lineItems || estimateData.lineItems,
          assumptions: initialEstimateData.assumptions || "",
          inclusions: initialEstimateData.inclusions || "",
          exclusions: initialEstimateData.exclusions || "",
          allowances: initialEstimateData.allowances || "",
          complianceStatement: initialEstimateData.complianceStatement || "",
          disclaimer: initialEstimateData.disclaimer || "",
          status: initialEstimateData.status || "DRAFT",
          version: initialEstimateData.version || 1,
          labourSubtotal: initialEstimateData.labourSubtotal || 0,
          equipmentSubtotal: initialEstimateData.equipmentSubtotal || 0,
          chemicalsSubtotal: initialEstimateData.chemicalsSubtotal || 0,
          subcontractorSubtotal: initialEstimateData.subcontractorSubtotal || 0,
          travelSubtotal: initialEstimateData.travelSubtotal || 0,
          wasteSubtotal: initialEstimateData.wasteSubtotal || 0,
          overheads: initialEstimateData.overheads || 0,
          profit: initialEstimateData.profit || 0,
          contingency: initialEstimateData.contingency || 0,
          escalation: initialEstimateData.escalation || 0,
          subtotalExGST: initialEstimateData.subtotalExGST || 0,
          gst: initialEstimateData.gst || 0,
          totalIncGST: initialEstimateData.totalIncGST || 0
        }
        setEstimateData(parsedData)
      } catch (error) {
        console.error("Error parsing initial estimate data:", error)
        toast.error("Failed to load existing estimate data")
      }
    }
  }, [initialEstimateData])

  // Auto-generate line items from scope if available (only once, and only if no initial data)
  useEffect(() => {
    if (scopeData && estimateData.lineItems.length === 0 && !isInitialMount.current && !initialEstimateData) {
      generateLineItemsFromScope()
    }
    isInitialMount.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeData?.id])

  // Calculate totals only when actual values change (using stringified comparison)
  useEffect(() => {
    // Stringify current values for comparison
    const currentLineItemsStr = JSON.stringify(estimateData.lineItems.map(item => ({
      qty: item.qty,
      rate: item.rate,
      code: item.code,
      equipmentData: item.equipmentData
    })))
    const currentParamsStr = JSON.stringify({
      overheadsPercent: estimateData.commercialParams.overheadsPercent,
      profitPercent: estimateData.commercialParams.profitPercent,
      profitAppliedAfter: estimateData.commercialParams.profitAppliedAfter,
      contingencyPercent: estimateData.commercialParams.contingencyPercent,
      escalationPercent: estimateData.commercialParams.escalationPercent,
      gstPercent: estimateData.commercialParams.gstPercent,
      roundTo: estimateData.commercialParams.roundTo
    })
    
    // Only calculate if values actually changed
    if (
      prevLineItemsRef.current === currentLineItemsStr && 
      prevParamsRef.current === currentParamsStr
    ) {
      return
    }
    
    prevLineItemsRef.current = currentLineItemsStr
    prevParamsRef.current = currentParamsStr
    
    // Calculate totals
    const categoryTotals: Record<string, number> = {}
    LINE_ITEM_CATEGORIES.forEach(cat => categoryTotals[cat] = 0)
    
    let labourSubtotal = 0
    let equipmentSubtotal = 0
    let chemicalsSubtotal = 0
    let subcontractorSubtotal = 0
    let travelSubtotal = 0
    let wasteSubtotal = 0
    
    // Process line items without mutation
    const updatedLineItems = estimateData.lineItems.map(item => {
      // Handle equipment items with rate calculation
      let itemSubtotal = item.qty * item.rate
      
      if (item.equipmentData) {
        const eq = item.equipmentData
        const equipmentKey = eq.type?.toLowerCase().replace(/\s+/g, '') || 'airMover'
        const rates = estimateData.rateTables.equipment[equipmentKey as keyof typeof estimateData.rateTables.equipment] || estimateData.rateTables.equipment.airMover
        
        let cost = 0
        if (eq.duration <= 7) {
          cost = rates.day * eq.quantity * eq.duration
        } else if (eq.duration <= 30) {
          const weeks = Math.ceil(eq.duration / 7)
          cost = rates.week * eq.quantity * weeks
        } else {
          const months = Math.ceil(eq.duration / 30)
          cost = rates.month * eq.quantity * months
        }
        
        itemSubtotal = cost
      }
      
      // Update category totals
      if (!categoryTotals[item.category]) categoryTotals[item.category] = 0
      categoryTotals[item.category] += itemSubtotal
      
      // Update type subtotals based on code prefixes first, then category and description
      const code = item.code?.toUpperCase() || ''
      const descLower = item.description?.toLowerCase() || ''
      
      // Labour: LAB-* codes OR descriptions with labour-related terms OR Project Management category
      if (code.startsWith('LAB-') || descLower.includes('tech') || descLower.includes('technician') || 
          descLower.includes('supervisor') || descLower.includes('labourer') || descLower.includes('admin') ||
          item.category === "Project Management/Admin") {
        labourSubtotal += itemSubtotal
      }
      // Equipment: EQ-* codes OR has equipmentData OR descriptions with equipment terms
      else if (code.startsWith('EQ-') || item.equipmentData || descLower.includes('equipment') || 
               descLower.includes('dehumidifier') || descLower.includes('air mover') || 
               descLower.includes('air scrubber') || descLower.includes('moisture meter')) {
        equipmentSubtotal += itemSubtotal
      }
      // Chemicals: CHEM-* codes OR descriptions with chemical terms
      else if (code.startsWith('CHEM-') || descLower.includes('chemical') || descLower.includes('anti-microbial') ||
               descLower.includes('bio-decontamination') || descLower.includes('mould remediation') ||
               descLower.includes('odor control')) {
        chemicalsSubtotal += itemSubtotal
      }
      // Subcontractors: Specialist Services category OR descriptions with subcontractor terms
      else if (item.category === "Specialist Services" || descLower.includes('electrician') || 
               descLower.includes('plumber') || descLower.includes('hygienist') || 
               descLower.includes('asbestos') || descLower.includes('carpenter') || 
               descLower.includes('roofer') || descLower.includes('subcontractor')) {
        subcontractorSubtotal += itemSubtotal
      }
      // Travel: Travel & Logistics category
      else if (item.category === "Travel & Logistics" || descLower.includes('travel') || 
               descLower.includes('parking') || descLower.includes('tolls') || descLower.includes('km')) {
        travelSubtotal += itemSubtotal
      }
      // Waste: Demolition/Removal category with waste OR descriptions with waste terms
      else if ((item.category === "Demolition/Removal" && descLower.includes('waste')) ||
               descLower.includes('disposal') || descLower.includes('tip fee')) {
        wasteSubtotal += itemSubtotal
      }
      // For items that don't match above, try to categorize by category name
      else if (item.category === "Prelims & Site Setup") {
        // Prelims usually include labour, so add to labour
        labourSubtotal += itemSubtotal
      }
      else if (item.category === "Restoration/Build-Back") {
        // Restoration might include both labour and materials - for now add to subcontractors
        subcontractorSubtotal += itemSubtotal
      }
      
      return {
        ...item,
        subtotal: itemSubtotal
      }
    })
    
    // Calculate total base cost (sum of all subtotals)
    const totalBaseCost = labourSubtotal + equipmentSubtotal + chemicalsSubtotal + 
                          subcontractorSubtotal + travelSubtotal + wasteSubtotal
    
    // Apply overheads and profit
    // Overheads base: labour + equipment + subcontractors (as per requirements)
    const overheadsBase = labourSubtotal + equipmentSubtotal + subcontractorSubtotal
    const overheads = overheadsBase * (estimateData.commercialParams.overheadsPercent / 100)
    
    const profitBase = estimateData.commercialParams.profitAppliedAfter 
      ? overheadsBase + overheads 
      : overheadsBase
    const profit = profitBase * (estimateData.commercialParams.profitPercent / 100)
    
    // Contingency (applied to labour + equipment as per requirements)
    const contingency = (labourSubtotal + equipmentSubtotal) * (estimateData.commercialParams.contingencyPercent / 100)
    
    // Escalation (applied to overheads base)
    const escalation = overheadsBase * (estimateData.commercialParams.escalationPercent / 100)
    
    // Subtotal ex-GST: total base cost + all adjustments
    const subtotalExGST = totalBaseCost + overheads + profit + contingency + escalation
    
    // GST
    const gst = subtotalExGST * (estimateData.commercialParams.gstPercent / 100)
    
    // Total inc-GST
    let totalIncGST = subtotalExGST + gst
    
    // Round to nearest $5 if enabled
    if (estimateData.commercialParams.roundTo === 5) {
      totalIncGST = Math.round(totalIncGST / 5) * 5
    }
    
    // Update state only if values changed
    setEstimateData(prev => {
      // Check if any totals actually changed
      const totalsChanged = 
        prev.labourSubtotal !== labourSubtotal ||
        prev.equipmentSubtotal !== equipmentSubtotal ||
        prev.chemicalsSubtotal !== chemicalsSubtotal ||
        prev.subtotalExGST !== subtotalExGST ||
        prev.totalIncGST !== totalIncGST
      
      if (!totalsChanged && JSON.stringify(prev.lineItems) === JSON.stringify(updatedLineItems)) {
        return prev // No change, return previous state
      }
      
      return {
        ...prev,
        lineItems: updatedLineItems,
        labourSubtotal,
        equipmentSubtotal,
        chemicalsSubtotal,
        subcontractorSubtotal,
        travelSubtotal,
        wasteSubtotal,
        overheads,
        profit,
        contingency,
        escalation,
        subtotalExGST,
        gst,
        totalIncGST
      }
    })
  }, [estimateData.lineItems, estimateData.commercialParams, estimateData.rateTables])

  const generateLineItemsFromScope = () => {
    const items: any[] = []
    
    // Labour items
    if (scopeData?.labourParameters?.roles) {
      scopeData.labourParameters.roles.forEach((role: any, index: number) => {
        if (role.hours > 0) {
          items.push({
            code: `LAB-${index + 1}`,
            category: "Mitigation/Drying",
            description: `${role.role} - ${role.hours} hours`,
            qty: role.hours,
            unit: "hours",
            rate: role.rate,
            formula: `${role.hours} hours × $${role.rate}/hr`,
            subtotal: role.hours * role.rate,
            isScopeLinked: true,
            isEstimatorAdded: false,
            displayOrder: items.length
          })
        }
      })
    }
    
    // Equipment items
    if (scopeData?.equipmentParameters?.equipment) {
      scopeData.equipmentParameters.equipment.forEach((eq: any, index: number) => {
        items.push({
          code: `EQ-${index + 1}`,
          category: "Mitigation/Drying",
          description: `${eq.type} - ${eq.quantity} units × ${eq.duration} days`,
          qty: eq.quantity * eq.duration,
          unit: "days",
          rate: 0, // Will be calculated based on duration
          formula: `${eq.quantity} units × ${eq.duration} days`,
          subtotal: 0,
          isScopeLinked: true,
          isEstimatorAdded: false,
          displayOrder: items.length,
          equipmentData: eq
        })
      })
    }
    
    // Chemical items
    if (scopeData?.chemicalApplication?.chemicals) {
      scopeData.chemicalApplication.chemicals.forEach((chem: any, index: number) => {
        const rate = scopeData.rateTables?.chemicals?.[chem.type] || 1.50
        items.push({
          code: `CHEM-${index + 1}`,
          category: "Mitigation/Drying",
          description: `${chem.type} - ${chem.area} sqm`,
          qty: chem.area,
          unit: "sqm",
          rate: rate,
          formula: `${chem.area} sqm × $${rate}/sqm`,
          subtotal: chem.area * rate,
          isScopeLinked: true,
          isEstimatorAdded: false,
          displayOrder: items.length
        })
      })
    }
    
    setEstimateData(prev => ({ ...prev, lineItems: items }))
  }


  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          scopeId,
          ...estimateData
        })
      })

      if (response.ok) {
        const savedEstimate = await response.json()
        toast.success("Estimate saved successfully!")
        onEstimateComplete(savedEstimate)
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to save estimate")
      }
    } catch (error) {
      console.error("Error saving estimate:", error)
      toast.error("Failed to save estimate")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAndNext = async () => {
    const tabs = ["inputs", "lineItems", "summary", "assumptions", "approvals", "export"]
    const currentIndex = tabs.indexOf(activeTab)
    const nextTab = currentIndex < tabs.length - 1 ? tabs[currentIndex + 1] : null

    setLoading(true)
    try {
      const response = await fetch(`/api/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          scopeId,
          ...estimateData
        })
      })

      if (response.ok) {
        const savedEstimate = await response.json()
        toast.success("Progress saved!")
        
        if (nextTab) {
          setActiveTab(nextTab)
        } else {
          toast.success("Estimate completed!")
          onEstimateComplete(savedEstimate)
        }
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to save estimate")
      }
    } catch (error) {
      console.error("Error saving estimate:", error)
      toast.error("Failed to save estimate")
    } finally {
      setLoading(false)
    }
  }

  const getNextTabName = () => {
    const tabs = ["inputs", "lineItems", "summary", "assumptions", "approvals", "export"]
    const currentIndex = tabs.indexOf(activeTab)
    if (currentIndex < tabs.length - 1) {
      const next = tabs[currentIndex + 1]
      return next.charAt(0).toUpperCase() + next.slice(1).replace(/([A-Z])/g, ' $1').trim()
    }
    return null
  }

  const renderInputsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Labour Rates</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(estimateData.rateTables.labour).map(([role, rates]: [string, any]) => (
            <Card key={role} className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white capitalize">{role.replace(/([A-Z])/g, ' $1').trim()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Normal Rate:</Label>
                  <Input
                    type="number"
                    value={rates.normal}
                    onChange={(e) => {
                      const newRateTables = { ...estimateData.rateTables }
                      newRateTables.labour[role as keyof typeof newRateTables.labour].normal = parseFloat(e.target.value) || 0
                      setEstimateData(prev => ({ ...prev, rateTables: newRateTables }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-24"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">After Hours:</Label>
                  <Input
                    type="number"
                    value={rates.afterHours}
                    onChange={(e) => {
                      const newRateTables = { ...estimateData.rateTables }
                      newRateTables.labour[role as keyof typeof newRateTables.labour].afterHours = parseFloat(e.target.value) || 0
                      setEstimateData(prev => ({ ...prev, rateTables: newRateTables }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-24"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Commercial Parameters</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Overheads & Profit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300 mb-2">Overheads %</Label>
                <Input
                  type="number"
                  value={estimateData.commercialParams.overheadsPercent}
                  onChange={(e) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      overheadsPercent: parseFloat(e.target.value) || 0
                    }
                  }))}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 mb-2">Profit %</Label>
                <Input
                  type="number"
                  value={estimateData.commercialParams.profitPercent}
                  onChange={(e) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      profitPercent: parseFloat(e.target.value) || 0
                    }
                  }))}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Contingency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300 mb-2">Contingency %</Label>
                <Input
                  type="number"
                  value={estimateData.commercialParams.contingencyPercent}
                  onChange={(e) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      contingencyPercent: parseFloat(e.target.value) || 0
                    }
                  }))}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 mb-2">Rationale</Label>
                <Select
                  value={estimateData.commercialParams.contingencyRationale}
                  onValueChange={(value) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      contingencyRationale: value
                    }
                  }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue placeholder="Select rationale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknowns">Unknowns</SelectItem>
                    <SelectItem value="hiddenMoisture">Hidden Moisture</SelectItem>
                    <SelectItem value="ceilingExposure">Ceiling Exposure</SelectItem>
                    <SelectItem value="structural">Structural Issues</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Tax & Rounding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300 mb-2">GST %</Label>
                <Input
                  type="number"
                  value={estimateData.commercialParams.gstPercent}
                  onChange={(e) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      gstPercent: parseFloat(e.target.value) || 10
                    }
                  }))}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 mb-2">Round Total To</Label>
                <Select
                  value={estimateData.commercialParams.roundTo.toString()}
                  onValueChange={(value) => setEstimateData(prev => ({
                    ...prev,
                    commercialParams: {
                      ...prev.commercialParams,
                      roundTo: parseInt(value) || 0
                    }
                  }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No rounding</SelectItem>
                    <SelectItem value="5">Nearest $5</SelectItem>
                    <SelectItem value="10">Nearest $10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save and Next Button */}
      <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
        <Button
          onClick={handleSaveAndNext}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Saving...' : `Save & Continue to ${getNextTabName()}`}
          <ChevronRight className="ml-2" size={16} />
        </Button>
      </div>
    </div>
  )

  const renderLineItemsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Line Items</h3>
        <Button
          onClick={() => {
            const newItem = {
              code: `CUST-${estimateData.lineItems.length + 1}`,
              category: LINE_ITEM_CATEGORIES[0],
              description: "",
              qty: 1,
              unit: "hours",
              rate: 0,
              formula: "",
              subtotal: 0,
              isScopeLinked: false,
              isEstimatorAdded: true,
              displayOrder: estimateData.lineItems.length
            }
            setEstimateData(prev => ({
              ...prev,
              lineItems: [...prev.lineItems, newItem]
            }))
          }}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <Plus className="mr-2" size={16} />
          Add Line Item
        </Button>
      </div>

      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-800">
              <TableHead className="text-white">Code</TableHead>
              <TableHead className="text-white">Category</TableHead>
              <TableHead className="text-white">Description</TableHead>
              <TableHead className="text-white">Qty</TableHead>
              <TableHead className="text-white">Unit</TableHead>
              <TableHead className="text-white">Rate</TableHead>
              <TableHead className="text-white">Subtotal</TableHead>
              <TableHead className="text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimateData.lineItems.map((item, index) => (
              <TableRow key={index} className="bg-slate-800/50">
                <TableCell>
                  <Input
                    value={item.code || ""}
                    onChange={(e) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].code = e.target.value
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-24"
                    disabled={item.isScopeLinked}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={item.category}
                    onValueChange={(value) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].category = value
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_ITEM_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    value={item.description}
                    onChange={(e) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].description = e.target.value
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white"
                    disabled={item.isScopeLinked}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.qty}
                    onChange={(e) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].qty = parseFloat(e.target.value) || 0
                      // Recalculate subtotal
                      let newSubtotal = newItems[index].qty * newItems[index].rate
                      // Handle equipment items with special calculation
                      if (newItems[index].equipmentData) {
                        const eq = newItems[index].equipmentData
                        const equipmentKey = eq.type?.toLowerCase().replace(/\s+/g, '') || 'airMover'
                        const rates = estimateData.rateTables.equipment[equipmentKey as keyof typeof estimateData.rateTables.equipment] || estimateData.rateTables.equipment.airMover
                        
                        if (eq.duration <= 7) {
                          newSubtotal = rates.day * eq.quantity * eq.duration
                        } else if (eq.duration <= 30) {
                          const weeks = Math.ceil(eq.duration / 7)
                          newSubtotal = rates.week * eq.quantity * weeks
                        } else {
                          const months = Math.ceil(eq.duration / 30)
                          newSubtotal = rates.month * eq.quantity * months
                        }
                      }
                      newItems[index].subtotal = newSubtotal
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-20"
                    disabled={item.isScopeLinked}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.unit}
                    onChange={(e) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].unit = e.target.value
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-20"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.rate}
                    onChange={(e) => {
                      const newItems = [...estimateData.lineItems]
                      newItems[index].rate = parseFloat(e.target.value) || 0
                      // Recalculate subtotal
                      let newSubtotal = newItems[index].qty * newItems[index].rate
                      // Handle equipment items with special calculation
                      if (newItems[index].equipmentData) {
                        const eq = newItems[index].equipmentData
                        const equipmentKey = eq.type?.toLowerCase().replace(/\s+/g, '') || 'airMover'
                        const rates = estimateData.rateTables.equipment[equipmentKey as keyof typeof estimateData.rateTables.equipment] || estimateData.rateTables.equipment.airMover
                        
                        if (eq.duration <= 7) {
                          newSubtotal = rates.day * eq.quantity * eq.duration
                        } else if (eq.duration <= 30) {
                          const weeks = Math.ceil(eq.duration / 7)
                          newSubtotal = rates.week * eq.quantity * weeks
                        } else {
                          const months = Math.ceil(eq.duration / 30)
                          newSubtotal = rates.month * eq.quantity * months
                        }
                      }
                      newItems[index].subtotal = newSubtotal
                      setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                    }}
                    className="bg-slate-700 border-slate-600 text-white w-24"
                  />
                </TableCell>
                <TableCell className="text-white font-medium">${(item.subtotal || (item.qty * item.rate)).toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newItems = estimateData.lineItems.filter((_, i) => i !== index)
                        setEstimateData(prev => ({ ...prev, lineItems: newItems }))
                      }}
                      className="text-red-400 hover:text-red-300"
                      disabled={item.isScopeLinked}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {estimateData.lineItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                  No line items. Click "Add Line Item" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Save and Next Button */}
      <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
        <Button
          onClick={handleSaveAndNext}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Saving...' : `Save & Continue to ${getNextTabName()}`}
          <ChevronRight className="ml-2" size={16} />
        </Button>
      </div>
    </div>
  )

  const renderSummaryTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Cost Summary</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Subtotals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Labour:</span>
                <span>${(estimateData.labourSubtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Equipment:</span>
                <span>${(estimateData.equipmentSubtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Chemicals:</span>
                <span>${(estimateData.chemicalsSubtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Subcontractors:</span>
                <span>${(estimateData.subcontractorSubtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Travel:</span>
                <span>${(estimateData.travelSubtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Waste:</span>
                <span>${(estimateData.wasteSubtotal || 0).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Adjustments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Overheads:</span>
                <span>${(estimateData.overheads || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Profit:</span>
                <span>${(estimateData.profit || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Contingency:</span>
                <span>${(estimateData.contingency || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Escalation:</span>
                <span>${(estimateData.escalation || 0).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-800 border-cyan-600">
          <CardHeader>
            <CardTitle className="text-white text-xl">Grand Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal Ex-GST:</span>
                <span>${(estimateData.subtotalExGST || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>GST ({estimateData.commercialParams.gstPercent}%):</span>
                <span>${(estimateData.gst || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white text-xl font-bold pt-2 border-t border-slate-700">
                <span>Total Inc-GST:</span>
                <span className="text-cyan-400">${(estimateData.totalIncGST || 0).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save and Next Button */}
      <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
        <Button
          onClick={handleSaveAndNext}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Saving...' : `Save & Continue to ${getNextTabName()}`}
          <ChevronRight className="ml-2" size={16} />
        </Button>
      </div>
    </div>
  )

  const renderAssumptionsTab = () => (
    <div className="space-y-6">
      <div>
        <Label htmlFor="assumptions" className="text-white mb-2">Assumptions</Label>
        <Textarea
          id="assumptions"
          value={estimateData.assumptions}
          onChange={(e) => setEstimateData(prev => ({ ...prev, assumptions: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={6}
          placeholder="Document all assumptions made during estimation..."
        />
      </div>

      <div>
        <Label htmlFor="inclusions" className="text-white mb-2">Inclusions</Label>
        <Textarea
          id="inclusions"
          value={estimateData.inclusions}
          onChange={(e) => setEstimateData(prev => ({ ...prev, inclusions: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={6}
          placeholder="Detailed list of included works..."
        />
      </div>

      <div>
        <Label htmlFor="exclusions" className="text-white mb-2">Exclusions</Label>
        <Textarea
          id="exclusions"
          value={estimateData.exclusions}
          onChange={(e) => setEstimateData(prev => ({ ...prev, exclusions: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={6}
          placeholder="Items not included in this estimate..."
        />
      </div>

      <div>
        <Label htmlFor="complianceStatement" className="text-white mb-2">Compliance Statement</Label>
        <Textarea
          id="complianceStatement"
          value={estimateData.complianceStatement}
          onChange={(e) => setEstimateData(prev => ({ ...prev, complianceStatement: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={4}
          placeholder="Reference to IICRC S500/S520, NCC, etc..."
        />
      </div>

      <div>
        <Label htmlFor="disclaimer" className="text-white mb-2">Disclaimer</Label>
        <Textarea
          id="disclaimer"
          value={estimateData.disclaimer}
          onChange={(e) => setEstimateData(prev => ({ ...prev, disclaimer: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={4}
          placeholder="All rates are user-defined and represent an evidence-based estimate..."
        />
      </div>

      {/* Save and Next Button */}
      <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
        <Button
          onClick={handleSaveAndNext}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Saving...' : `Save & Continue to ${getNextTabName()}`}
          <ChevronRight className="ml-2" size={16} />
        </Button>
      </div>
    </div>
  )

  const renderApprovalsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Workflow Status</h3>
        <Select
          value={estimateData.status}
          onValueChange={(value) => setEstimateData(prev => ({ ...prev, status: value }))}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="INTERNAL_REVIEW">Internal Review</SelectItem>
            <SelectItem value="CLIENT_REVIEW">Client/Insurer Review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="LOCKED">Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-slate-800/50 p-4 rounded-lg">
        <h4 className="text-white font-semibold mb-2">Version History</h4>
        <p className="text-slate-400 text-sm">Version: {estimateData.version}</p>
        <p className="text-slate-400 text-sm">Version history will be displayed here after saving.</p>
      </div>

      {/* Save and Next Button */}
      <div className="flex justify-end pt-6 border-t border-slate-700 mt-6">
        <Button
          onClick={handleSaveAndNext}
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Saving...' : getNextTabName() ? `Save & Continue to ${getNextTabName()}` : 'Save & Complete'}
          <ChevronRight className="ml-2" size={16} />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Estimation Engine</h1>
          <p className="text-slate-400">Convert scope of works into fully costed estimate</p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="inputs" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <Settings className="mr-2" size={16} />
              Inputs
            </TabsTrigger>
            <TabsTrigger value="lineItems" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <FileText className="mr-2" size={16} />
              Line Items
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <Calculator className="mr-2" size={16} />
              Summary
            </TabsTrigger>
            <TabsTrigger value="assumptions" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <AlertCircle className="mr-2" size={16} />
              Assumptions
            </TabsTrigger>
            <TabsTrigger value="approvals" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <CheckCircle className="mr-2" size={16} />
              Approvals
            </TabsTrigger>
            <TabsTrigger value="export" className="text-slate-300 data-[state=active]:text-black data-[state=active]:bg-white">
              <FileText className="mr-2" size={16} />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inputs" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">{renderInputsTab()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lineItems" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">{renderLineItemsTab()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">{renderSummaryTab()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assumptions" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">{renderAssumptionsTab()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">{renderApprovalsTab()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Export Options</h3>
                  <div className="flex space-x-4">
                    <Button
                      onClick={() => window.print()}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      <FileText className="mr-2" size={16} />
                      Export PDF
                    </Button>
                    <Button
                      onClick={() => {
                        const jsonData = JSON.stringify(estimateData, null, 2)
                        const blob = new Blob([jsonData], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `estimate-${reportId}.json`
                        a.click()
                      }}
                      className="bg-slate-700 hover:bg-slate-600"
                    >
                      Export JSON
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex justify-between mt-6">
          <Button
            onClick={onCancel}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="mr-2" size={16} />
            {loading ? 'Saving...' : 'Save Estimate'}
          </Button>
        </div>
      </div>
    </div>
  )
}

