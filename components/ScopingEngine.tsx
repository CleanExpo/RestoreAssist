"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronLeft, ChevronRight, Save, FileText, Calculator, Settings, AlertCircle } from "lucide-react"
import toast from "react-hot-toast"

interface ScopingEngineProps {
  reportId: string
  reportData: any
  initialScopeData?: any
  onScopeComplete: (scopeData: any) => void
  onCancel: () => void
}

export default function ScopingEngine({ reportId, reportData, initialScopeData, onScopeComplete, onCancel }: ScopingEngineProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [scopeData, setScopeData] = useState({
    // Step 1: Input & Data Ingestion
    scopeType: "WATER",
    siteVariables: {
      structure: "",
      materials: "",
      floors: "",
      condition: "",
      notes: ""
    },
    
    // Step 2: Labour Parameters
    labourParameters: {
      roles: [
        { role: "Lead Tech", rate: 75, hours: 0, afterHours: false, modifiers: [] },
        { role: "Supervisor", rate: 90, hours: 0, afterHours: false, modifiers: [] },
        { role: "Labourer", rate: 65, hours: 0, afterHours: false, modifiers: [] },
        { role: "Admin", rate: 70, hours: 0, afterHours: false, modifiers: [] }
      ],
      modifiers: {
        afterHours: false,
        weekend: false,
        confinedSpace: false,
        ppe: false,
        heatStress: false,
        teamSize: "pair" // solo, pair, large
      }
    },
    
    // Step 3: Equipment Parameters
    equipmentParameters: {
      equipment: []
    },
    
    // Step 4: Chemical Application
    chemicalApplication: {
      chemicals: []
    },
    
    // Step 5: Time & Productivity
    timeCalculations: {
      baseProductivity: 20, // sqm/hr
      efficiencyFactors: {
        confinedSpace: 0.75,
        ppe: 0.85,
        heatStress: 0.80,
        teamCoordination: 0.90
      },
      totalManHours: 0,
      projectDuration: 0,
      notes: ""
    },
    
    // Step 6: Summary (calculated)
    summary: {
      labourCostTotal: 0,
      equipmentCostTotal: 0,
      chemicalCostTotal: 0,
      totalDuration: 0,
      anomalies: []
    },
    
    // Step 7: Compliance
    complianceNotes: "",
    assumptions: ""
  })

  // Equipment rate tiers
  const equipmentRates = {
    "Air Mover": { day: 40, week: 160, month: 500 },
    "Dehumidifier": { day: 110, week: 500, month: 2000 },
    "AFD": { day: 100, week: 500, month: 2000 },
    "Moisture Meter": { day: 25, week: 100, month: 300 },
    "Air Scrubber": { day: 80, week: 350, month: 1200 }
  }

  // Chemical rates
  const chemicalRates = {
    "Anti-microbial": 1.50,
    "Bio-decontamination": 2.50,
    "Mould Remediation": 1.50,
    "Odor Control": 1.00
  }

  // Load initial scope data if editing
  useEffect(() => {
    if (initialScopeData) {
      try {
        const parsedData = {
          scopeType: initialScopeData.scopeType || "WATER",
          siteVariables: typeof initialScopeData.siteVariables === 'string' 
            ? JSON.parse(initialScopeData.siteVariables) 
            : initialScopeData.siteVariables || {
                structure: "",
                materials: "",
                floors: "",
                condition: "",
                notes: ""
              },
          labourParameters: typeof initialScopeData.labourParameters === 'string'
            ? JSON.parse(initialScopeData.labourParameters)
            : initialScopeData.labourParameters || {
                roles: [
                  { role: "Lead Tech", rate: 75, hours: 0, afterHours: false, modifiers: [] },
                  { role: "Supervisor", rate: 90, hours: 0, afterHours: false, modifiers: [] },
                  { role: "Labourer", rate: 65, hours: 0, afterHours: false, modifiers: [] },
                  { role: "Admin", rate: 70, hours: 0, afterHours: false, modifiers: [] }
                ],
                modifiers: {
                  afterHours: false,
                  weekend: false,
                  confinedSpace: false,
                  ppe: false,
                  heatStress: false,
                  teamSize: "pair"
                }
              },
          equipmentParameters: typeof initialScopeData.equipmentParameters === 'string'
            ? JSON.parse(initialScopeData.equipmentParameters)
            : initialScopeData.equipmentParameters || { equipment: [] },
          chemicalApplication: typeof initialScopeData.chemicalApplication === 'string'
            ? JSON.parse(initialScopeData.chemicalApplication)
            : initialScopeData.chemicalApplication || { chemicals: [] },
          timeCalculations: typeof initialScopeData.timeCalculations === 'string'
            ? JSON.parse(initialScopeData.timeCalculations)
            : initialScopeData.timeCalculations || {
                baseProductivity: 20,
                efficiencyFactors: {
                  confinedSpace: 0.75,
                  ppe: 0.85,
                  heatStress: 0.80,
                  teamCoordination: 0.90
                },
                totalManHours: initialScopeData.timeCalculations?.totalManHours || 0,
                projectDuration: initialScopeData.totalDuration || 0,
                notes: ""
              },
          summary: {
            labourCostTotal: initialScopeData.labourCostTotal || 0,
            equipmentCostTotal: initialScopeData.equipmentCostTotal || 0,
            chemicalCostTotal: initialScopeData.chemicalCostTotal || 0,
            totalDuration: initialScopeData.totalDuration || 0,
            anomalies: []
          },
          complianceNotes: initialScopeData.complianceNotes || "",
          assumptions: initialScopeData.assumptions || ""
        }
        setScopeData(parsedData)
      } catch (error) {
        console.error("Error parsing initial scope data:", error)
        toast.error("Failed to load existing scope data")
      }
    }
  }, [initialScopeData])

  // Calculate totals whenever data changes
  useEffect(() => {
    calculateTotals()
  }, [scopeData.labourParameters, scopeData.equipmentParameters, scopeData.chemicalApplication, scopeData.timeCalculations])

  // Update project duration when calculations change
  useEffect(() => {
    if (reportData?.affectedArea && scopeData.timeCalculations.baseProductivity) {
      const affectedArea = reportData.affectedArea || 0
      let efficiency = 1
      if (scopeData.labourParameters.modifiers.confinedSpace) efficiency *= 0.75
      if (scopeData.labourParameters.modifiers.ppe) efficiency *= 0.85
      if (scopeData.labourParameters.modifiers.heatStress) efficiency *= 0.80
      if (scopeData.labourParameters.modifiers.teamSize === "large") efficiency *= 0.90
      
      const adjustedProductivity = scopeData.timeCalculations.baseProductivity * efficiency
      const estimatedManHours = affectedArea / adjustedProductivity
      const projectDuration = Math.ceil(estimatedManHours / 8)
      
      setScopeData(prev => ({
        ...prev,
        timeCalculations: {
          ...prev.timeCalculations,
          totalManHours: estimatedManHours,
          projectDuration: projectDuration
        }
      }))
    }
  }, [reportData?.affectedArea, scopeData.timeCalculations.baseProductivity, scopeData.labourParameters.modifiers])

  const calculateTotals = () => {
    // Calculate labour costs
    let labourTotal = 0
    scopeData.labourParameters.roles.forEach(role => {
      let rate = role.rate
      let hours = role.hours
      
      // Apply modifiers
      if (role.afterHours) rate *= 1.25
      if (scopeData.labourParameters.modifiers.weekend) rate *= 1.15
      if (scopeData.labourParameters.modifiers.confinedSpace) hours *= 1.1
      if (scopeData.labourParameters.modifiers.ppe) hours *= 1.15
      if (scopeData.labourParameters.modifiers.heatStress) hours *= 1.1
      
      labourTotal += rate * hours
    })

    // Calculate equipment costs
    let equipmentTotal = 0
    scopeData.equipmentParameters.equipment.forEach((eq: any) => {
      const tiers = equipmentRates[eq.type as keyof typeof equipmentRates]
      if (tiers) {
        let cost = 0
        if (eq.duration <= 7) {
          cost = tiers.day * eq.quantity * eq.duration
        } else if (eq.duration <= 30) {
          const weeks = Math.ceil(eq.duration / 7)
          cost = tiers.week * eq.quantity * weeks
        } else {
          const months = Math.ceil(eq.duration / 30)
          cost = tiers.month * eq.quantity * months
        }
        equipmentTotal += cost
      }
    })

    // Calculate chemical costs
    let chemicalTotal = 0
    scopeData.chemicalApplication.chemicals.forEach((chem: any) => {
      const rate = chemicalRates[chem.type as keyof typeof chemicalRates] || 0
      chemicalTotal += rate * chem.area
    })

    // Update summary
    setScopeData(prev => ({
      ...prev,
      summary: {
        labourCostTotal: labourTotal,
        equipmentCostTotal: equipmentTotal,
        chemicalCostTotal: chemicalTotal,
        totalDuration: scopeData.timeCalculations.projectDuration || 0,
        anomalies: []
      }
    }))
  }

  const handleNext = () => {
    if (currentStep < 8) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // POST endpoint handles both create and update
      const response = await fetch(`/api/scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          ...scopeData,
          summary: {
            ...scopeData.summary,
            labourCostTotal: scopeData.summary.labourCostTotal,
            equipmentCostTotal: scopeData.summary.equipmentCostTotal,
            chemicalCostTotal: scopeData.summary.chemicalCostTotal,
            totalDuration: scopeData.timeCalculations.projectDuration
          }
        })
      })

      if (response.ok) {
        const savedScope = await response.json()
        toast.success("Scope saved successfully!")
        onScopeComplete(savedScope)
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to save scope")
      }
    } catch (error) {
      console.error("Error saving scope:", error)
      toast.error("Failed to save scope")
    } finally {
      setLoading(false)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Project Information</h3>
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <p className="text-slate-300"><strong>Client:</strong> {reportData?.clientName}</p>
          <p className="text-slate-300"><strong>Address:</strong> {reportData?.propertyAddress}</p>
          <p className="text-slate-300"><strong>Category:</strong> {reportData?.waterCategory}</p>
          <p className="text-slate-300"><strong>Class:</strong> {reportData?.waterClass}</p>
          <p className="text-slate-300"><strong>Affected Area:</strong> {reportData?.affectedArea} sqm</p>
        </div>
      </div>

      <div>
        <Label htmlFor="scopeType" className="text-white mb-2">Scope Type *</Label>
        <Select
          value={scopeData.scopeType}
          onValueChange={(value) => setScopeData(prev => ({ ...prev, scopeType: value }))}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WATER">Water Damage</SelectItem>
            <SelectItem value="FIRE">Fire Damage</SelectItem>
            <SelectItem value="MOULD">Mould Remediation</SelectItem>
            <SelectItem value="MULTI_LOSS">Multi-Loss</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Site Variables</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="structure" className="text-white mb-2">Structure Type</Label>
            <Input
              id="structure"
              value={scopeData.siteVariables.structure}
              onChange={(e) => setScopeData(prev => ({
                ...prev,
                siteVariables: { ...prev.siteVariables, structure: e.target.value }
              }))}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="e.g., 2-storey dwelling, concrete slab"
            />
          </div>
          <div>
            <Label htmlFor="materials" className="text-white mb-2">Construction Materials</Label>
            <Input
              id="materials"
              value={scopeData.siteVariables.materials}
              onChange={(e) => setScopeData(prev => ({
                ...prev,
                siteVariables: { ...prev.siteVariables, materials: e.target.value }
              }))}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="e.g., timber frame, brick exterior"
            />
          </div>
          <div>
            <Label htmlFor="floors" className="text-white mb-2">Floors Affected</Label>
            <Input
              id="floors"
              value={scopeData.siteVariables.floors}
              onChange={(e) => setScopeData(prev => ({
                ...prev,
                siteVariables: { ...prev.siteVariables, floors: e.target.value }
              }))}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="e.g., Ground floor, Basement"
            />
          </div>
          <div>
            <Label htmlFor="condition" className="text-white mb-2">Site Condition</Label>
            <Input
              id="condition"
              value={scopeData.siteVariables.condition}
              onChange={(e) => setScopeData(prev => ({
                ...prev,
                siteVariables: { ...prev.siteVariables, condition: e.target.value }
              }))}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="e.g., Occupied, Vacant"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="notes" className="text-white mb-2">Additional Notes</Label>
          <Textarea
            id="notes"
            value={scopeData.siteVariables.notes}
            onChange={(e) => setScopeData(prev => ({
              ...prev,
              siteVariables: { ...prev.siteVariables, notes: e.target.value }
            }))}
            className="bg-slate-800 border-slate-700 text-white"
            rows={3}
            placeholder="Any additional site-specific information..."
          />
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Labour Roles & Rates</h3>
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-800">
                <TableHead className="text-white">Role</TableHead>
                <TableHead className="text-white">Rate ($/hr)</TableHead>
                <TableHead className="text-white">Hours</TableHead>
                <TableHead className="text-white">After Hours</TableHead>
                <TableHead className="text-white">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopeData.labourParameters.roles.map((role, index) => (
                <TableRow key={index} className="bg-slate-800/50">
                  <TableCell className="text-white font-medium">{role.role}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={role.rate}
                      onChange={(e) => {
                        const newRoles = [...scopeData.labourParameters.roles]
                        newRoles[index].rate = parseFloat(e.target.value) || 0
                        setScopeData(prev => ({
                          ...prev,
                          labourParameters: { ...prev.labourParameters, roles: newRoles }
                        }))
                      }}
                      className="bg-slate-700 border-slate-600 text-white w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={role.hours}
                      onChange={(e) => {
                        const newRoles = [...scopeData.labourParameters.roles]
                        newRoles[index].hours = parseFloat(e.target.value) || 0
                        setScopeData(prev => ({
                          ...prev,
                          labourParameters: { ...prev.labourParameters, roles: newRoles }
                        }))
                      }}
                      className="bg-slate-700 border-slate-600 text-white w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={role.afterHours}
                      onCheckedChange={(checked) => {
                        const newRoles = [...scopeData.labourParameters.roles]
                        newRoles[index].afterHours = checked as boolean
                        setScopeData(prev => ({
                          ...prev,
                          labourParameters: { ...prev.labourParameters, roles: newRoles }
                        }))
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-white">
                    ${(role.rate * (role.afterHours ? 1.25 : 1) * role.hours).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Modifiers</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="weekend"
              checked={scopeData.labourParameters.modifiers.weekend}
              onCheckedChange={(checked) => setScopeData(prev => ({
                ...prev,
                labourParameters: {
                  ...prev.labourParameters,
                  modifiers: { ...prev.labourParameters.modifiers, weekend: checked as boolean }
                }
              }))}
            />
            <Label htmlFor="weekend" className="text-white">Weekend Work (+15%)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="confinedSpace"
              checked={scopeData.labourParameters.modifiers.confinedSpace}
              onCheckedChange={(checked) => setScopeData(prev => ({
                ...prev,
                labourParameters: {
                  ...prev.labourParameters,
                  modifiers: { ...prev.labourParameters.modifiers, confinedSpace: checked as boolean }
                }
              }))}
            />
            <Label htmlFor="confinedSpace" className="text-white">Confined Space (+10%)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ppe"
              checked={scopeData.labourParameters.modifiers.ppe}
              onCheckedChange={(checked) => setScopeData(prev => ({
                ...prev,
                labourParameters: {
                  ...prev.labourParameters,
                  modifiers: { ...prev.labourParameters.modifiers, ppe: checked as boolean }
                }
              }))}
            />
            <Label htmlFor="ppe" className="text-white">PPE Required (+15%)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="heatStress"
              checked={scopeData.labourParameters.modifiers.heatStress}
              onCheckedChange={(checked) => setScopeData(prev => ({
                ...prev,
                labourParameters: {
                  ...prev.labourParameters,
                  modifiers: { ...prev.labourParameters.modifiers, heatStress: checked as boolean }
                }
              }))}
            />
            <Label htmlFor="heatStress" className="text-white">Heat Stress (+10%)</Label>
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="teamSize" className="text-white mb-2">Team Size</Label>
          <Select
            value={scopeData.labourParameters.modifiers.teamSize}
            onValueChange={(value) => setScopeData(prev => ({
              ...prev,
              labourParameters: {
                ...prev.labourParameters,
                modifiers: { ...prev.labourParameters.modifiers, teamSize: value }
              }
            }))}
          >
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">Solo</SelectItem>
              <SelectItem value="pair">Pair</SelectItem>
              <SelectItem value="large">Large Crew</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Equipment Parameters</h3>
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-800">
                <TableHead className="text-white">Equipment</TableHead>
                <TableHead className="text-white">Day Rate</TableHead>
                <TableHead className="text-white">Week Rate</TableHead>
                <TableHead className="text-white">Month Rate</TableHead>
                <TableHead className="text-white">Quantity</TableHead>
                <TableHead className="text-white">Duration (days)</TableHead>
                <TableHead className="text-white">Subtotal</TableHead>
                <TableHead className="text-white">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopeData.equipmentParameters.equipment.map((eq: any, index: number) => {
                const tiers = equipmentRates[eq.type as keyof typeof equipmentRates]
                let cost = 0
                if (tiers) {
                  if (eq.duration <= 7) {
                    cost = tiers.day * eq.quantity * eq.duration
                  } else if (eq.duration <= 30) {
                    const weeks = Math.ceil(eq.duration / 7)
                    cost = tiers.week * eq.quantity * weeks
                  } else {
                    const months = Math.ceil(eq.duration / 30)
                    cost = tiers.month * eq.quantity * months
                  }
                }
                return (
                  <TableRow key={index} className="bg-slate-800/50">
                    <TableCell>
                      <Select
                        value={eq.type}
                        onValueChange={(value) => {
                          const newEquip = [...scopeData.equipmentParameters.equipment]
                          newEquip[index].type = value
                          setScopeData(prev => ({
                            ...prev,
                            equipmentParameters: { equipment: newEquip }
                          }))
                        }}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(equipmentRates).map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-white">${tiers?.day || 0}</TableCell>
                    <TableCell className="text-white">${tiers?.week || 0}</TableCell>
                    <TableCell className="text-white">${tiers?.month || 0}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={eq.quantity}
                        onChange={(e) => {
                          const newEquip = [...scopeData.equipmentParameters.equipment]
                          newEquip[index].quantity = parseInt(e.target.value) || 1
                          setScopeData(prev => ({
                            ...prev,
                            equipmentParameters: { equipment: newEquip }
                          }))
                        }}
                        className="bg-slate-700 border-slate-600 text-white w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={eq.duration}
                        onChange={(e) => {
                          const newEquip = [...scopeData.equipmentParameters.equipment]
                          newEquip[index].duration = parseInt(e.target.value) || 1
                          setScopeData(prev => ({
                            ...prev,
                            equipmentParameters: { equipment: newEquip }
                          }))
                        }}
                        className="bg-slate-700 border-slate-600 text-white w-20"
                      />
                    </TableCell>
                    <TableCell className="text-white">${cost.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newEquip = scopeData.equipmentParameters.equipment.filter((_: any, i: number) => i !== index)
                          setScopeData(prev => ({
                            ...prev,
                            equipmentParameters: { equipment: newEquip }
                          }))
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {scopeData.equipmentParameters.equipment.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    No equipment added. Click "Add Equipment" to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Button
          onClick={() => {
            const newEquip = [...scopeData.equipmentParameters.equipment, { type: "Air Mover", quantity: 1, duration: 1 }]
            setScopeData(prev => ({
              ...prev,
              equipmentParameters: { equipment: newEquip }
            }))
          }}
          className="mt-4 bg-cyan-600 hover:bg-cyan-700"
        >
          Add Equipment
        </Button>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Chemical Application</h3>
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-800">
                <TableHead className="text-white">Chemical Type</TableHead>
                <TableHead className="text-white">Rate ($/sqm)</TableHead>
                <TableHead className="text-white">Area (sqm)</TableHead>
                <TableHead className="text-white">Total</TableHead>
                <TableHead className="text-white">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopeData.chemicalApplication.chemicals.map((chem: any, index: number) => {
                const rate = chemicalRates[chem.type as keyof typeof chemicalRates] || 0
                return (
                  <TableRow key={index} className="bg-slate-800/50">
                    <TableCell>
                      <Select
                        value={chem.type}
                        onValueChange={(value) => {
                          const newChems = [...scopeData.chemicalApplication.chemicals]
                          newChems[index].type = value
                          setScopeData(prev => ({
                            ...prev,
                            chemicalApplication: { chemicals: newChems }
                          }))
                        }}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(chemicalRates).map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-white">${rate.toFixed(2)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chem.area}
                        onChange={(e) => {
                          const newChems = [...scopeData.chemicalApplication.chemicals]
                          newChems[index].area = parseFloat(e.target.value) || 0
                          setScopeData(prev => ({
                            ...prev,
                            chemicalApplication: { chemicals: newChems }
                          }))
                        }}
                        className="bg-slate-700 border-slate-600 text-white w-24"
                      />
                    </TableCell>
                    <TableCell className="text-white">${(rate * chem.area).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newChems = scopeData.chemicalApplication.chemicals.filter((_: any, i: number) => i !== index)
                          setScopeData(prev => ({
                            ...prev,
                            chemicalApplication: { chemicals: newChems }
                          }))
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {scopeData.chemicalApplication.chemicals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    No chemicals added. Click "Add Chemical" to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Button
          onClick={() => {
            const newChems = [...scopeData.chemicalApplication.chemicals, { type: "Anti-microbial", area: 0 }]
            setScopeData(prev => ({
              ...prev,
              chemicalApplication: { chemicals: newChems }
            }))
          }}
          className="mt-4 bg-cyan-600 hover:bg-cyan-700"
        >
          Add Chemical
        </Button>
      </div>
      
      <div className="bg-slate-800/50 p-4 rounded-lg">
        <p className="text-slate-300 text-sm">
          <strong>Note:</strong> Areas are pulled from inspection data. You can modify room sizes or surface types manually above.
        </p>
      </div>
    </div>
  )

  const renderStep5 = () => {
    const totalHours = scopeData.labourParameters.roles.reduce((sum, role) => sum + role.hours, 0)
    const affectedArea = reportData?.affectedArea || 0
    
    // Calculate productivity with efficiency factors
    let efficiency = 1
    if (scopeData.labourParameters.modifiers.confinedSpace) efficiency *= 0.75
    if (scopeData.labourParameters.modifiers.ppe) efficiency *= 0.85
    if (scopeData.labourParameters.modifiers.heatStress) efficiency *= 0.80
    if (scopeData.labourParameters.modifiers.teamSize === "large") efficiency *= 0.90
    
    const adjustedProductivity = scopeData.timeCalculations.baseProductivity * efficiency
    const estimatedManHours = affectedArea / adjustedProductivity
    const projectDuration = Math.ceil(estimatedManHours / 8) // Assuming 8-hour days

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Time & Productivity Calculations</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Base Productivity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    value={scopeData.timeCalculations.baseProductivity}
                    onChange={(e) => setScopeData(prev => ({
                      ...prev,
                      timeCalculations: {
                        ...prev.timeCalculations,
                        baseProductivity: parseFloat(e.target.value) || 20
                      }
                    }))}
                    className="bg-slate-700 border-slate-600 text-white w-32"
                  />
                  <span className="text-slate-300">sqm/hr (per tech)</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Adjusted Productivity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-cyan-400">{adjustedProductivity.toFixed(2)} sqm/hr</p>
                <p className="text-sm text-slate-400 mt-1">After efficiency factors</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-white">Efficiency Factors Applied</Label>
              <div className="mt-2 space-y-2">
                {scopeData.labourParameters.modifiers.confinedSpace && (
                  <div className="flex justify-between text-slate-300">
                    <span>Confined Space:</span>
                    <span>-25%</span>
                  </div>
                )}
                {scopeData.labourParameters.modifiers.ppe && (
                  <div className="flex justify-between text-slate-300">
                    <span>PPE Required:</span>
                    <span>-15%</span>
                  </div>
                )}
                {scopeData.labourParameters.modifiers.heatStress && (
                  <div className="flex justify-between text-slate-300">
                    <span>Heat Stress:</span>
                    <span>-20%</span>
                  </div>
                )}
                {scopeData.labourParameters.modifiers.teamSize === "large" && (
                  <div className="flex justify-between text-slate-300">
                    <span>Team Coordination:</span>
                    <span>-10%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Total Man-Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-cyan-400">{estimatedManHours.toFixed(1)} hrs</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Project Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-cyan-400">{projectDuration} days</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Affected Area</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-cyan-400">{affectedArea} sqm</p>
                </CardContent>
              </Card>
            </div>

            <div>
              <Label htmlFor="timeNotes" className="text-white mb-2">Notes</Label>
              <Textarea
                id="timeNotes"
                value={scopeData.timeCalculations.notes}
                onChange={(e) => setScopeData(prev => ({
                  ...prev,
                  timeCalculations: {
                    ...prev.timeCalculations,
                    notes: e.target.value
                  }
                }))}
                className="bg-slate-800 border-slate-700 text-white"
                rows={3}
                placeholder="Additional notes about time calculations..."
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep6 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Scope Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Labour Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-cyan-400">${scopeData.summary.labourCostTotal.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Equipment Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-cyan-400">${scopeData.summary.equipmentCostTotal.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Chemicals & Consumables</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-cyan-400">${scopeData.summary.chemicalCostTotal.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Total Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-cyan-400">{scopeData.summary.totalDuration} days</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-xl">Grand Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-cyan-400">
                ${(scopeData.summary.labourCostTotal + scopeData.summary.equipmentCostTotal + scopeData.summary.chemicalCostTotal).toFixed(2)}
              </p>
              <p className="text-slate-400 mt-2">Excluding GST</p>
            </CardContent>
          </Card>
        </div>

        {scopeData.summary.anomalies.length > 0 && (
          <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="text-yellow-400" size={20} />
              <h4 className="text-yellow-400 font-semibold">Anomalies Detected</h4>
            </div>
            <ul className="list-disc list-inside text-yellow-300 space-y-1">
              {scopeData.summary.anomalies.map((anomaly: string, index: number) => (
                <li key={index}>{anomaly}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  const renderStep7 = () => (
    <div className="space-y-6">
      <div>
        <Label htmlFor="complianceNotes" className="text-white mb-2">Compliance Notes</Label>
        <Textarea
          id="complianceNotes"
          value={scopeData.complianceNotes}
          onChange={(e) => setScopeData(prev => ({ ...prev, complianceNotes: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={6}
          placeholder="Auto-insert reference block at the bottom of every scope..."
        />
        <p className="text-sm text-slate-400 mt-2">
          <strong>Standard Compliance Statement:</strong><br />
          "All scoping calculations are derived from the IICRC S500:2025 Standard and relevant Australian building, electrical, and HVAC regulations. Data cross-checked for accuracy and site conditions."
        </p>
      </div>

      <div>
        <Label htmlFor="assumptions" className="text-white mb-2">Assumptions</Label>
        <Textarea
          id="assumptions"
          value={scopeData.assumptions}
          onChange={(e) => setScopeData(prev => ({ ...prev, assumptions: e.target.value }))}
          className="bg-slate-800 border-slate-700 text-white"
          rows={6}
          placeholder="Document any assumptions made during scoping..."
        />
      </div>

      <div className="bg-slate-800/50 p-4 rounded-lg">
        <h4 className="text-white font-semibold mb-2">Validation Checklist</h4>
        <ul className="space-y-2 text-slate-300 text-sm">
          <li className="flex items-center space-x-2">
            <input type="checkbox" className="rounded" />
            <span>Required fields completed (location, category, technician rates)</span>
          </li>
          <li className="flex items-center space-x-2">
            <input type="checkbox" className="rounded" />
            <span>Rates within realistic bands</span>
          </li>
          <li className="flex items-center space-x-2">
            <input type="checkbox" className="rounded" />
            <span>Timestamp, author, and revision control recorded</span>
          </li>
        </ul>
      </div>
    </div>
  )

  const renderStep8 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Scope of Works Report</h3>
        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">1. Project Summary</h4>
            <div className="text-slate-300 text-sm space-y-1">
              <p><strong>Client:</strong> {reportData?.clientName}</p>
              <p><strong>Address:</strong> {reportData?.propertyAddress}</p>
              <p><strong>Scope Type:</strong> {scopeData.scopeType}</p>
              <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">2. Site & Environmental Details</h4>
            <div className="text-slate-300 text-sm space-y-1">
              <p><strong>Structure:</strong> {scopeData.siteVariables.structure || "—"}</p>
              <p><strong>Materials:</strong> {scopeData.siteVariables.materials || "—"}</p>
              <p><strong>Floors:</strong> {scopeData.siteVariables.floors || "—"}</p>
              <p><strong>Condition:</strong> {scopeData.siteVariables.condition || "—"}</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">3. Labour Scope</h4>
            <div className="text-slate-300 text-sm">
              <p className="mb-2"><strong>Total Labour Cost:</strong> ${scopeData.summary.labourCostTotal.toFixed(2)}</p>
              <ul className="list-disc list-inside space-y-1">
                {scopeData.labourParameters.roles.map((role, index) => (
                  <li key={index}>
                    {role.role}: {role.hours} hours @ ${role.rate}/hr
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">4. Equipment Scope</h4>
            <div className="text-slate-300 text-sm">
              <p className="mb-2"><strong>Total Equipment Cost:</strong> ${scopeData.summary.equipmentCostTotal.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">5. Chemicals / Consumables</h4>
            <div className="text-slate-300 text-sm">
              <p><strong>Total Chemical Cost:</strong> ${scopeData.summary.chemicalCostTotal.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">6. Time & Duration Estimates</h4>
            <div className="text-slate-300 text-sm">
              <p><strong>Total Duration:</strong> {scopeData.summary.totalDuration} days</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">7. Notes / Assumptions / Compliance References</h4>
            <div className="text-slate-300 text-sm">
              <p>{scopeData.complianceNotes || scopeData.assumptions || "—"}</p>
            </div>
          </div>

          <div>
            <h4 className="text-cyan-400 font-semibold mb-2">8. Cost Totals</h4>
            <div className="text-slate-300 text-sm space-y-1">
              <p><strong>Labour:</strong> ${scopeData.summary.labourCostTotal.toFixed(2)}</p>
              <p><strong>Equipment:</strong> ${scopeData.summary.equipmentCostTotal.toFixed(2)}</p>
              <p><strong>Chemicals:</strong> ${scopeData.summary.chemicalCostTotal.toFixed(2)}</p>
              <p className="text-lg font-semibold text-cyan-400 mt-2">
                <strong>Grand Total (Ex GST):</strong> ${(scopeData.summary.labourCostTotal + scopeData.summary.equipmentCostTotal + scopeData.summary.chemicalCostTotal).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

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
            const jsonData = JSON.stringify(scopeData, null, 2)
            const blob = new Blob([jsonData], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `scope-${reportId}.json`
            a.click()
          }}
          className="bg-slate-700 hover:bg-slate-600"
        >
          Export JSON
        </Button>
      </div>
    </div>
  )

  const steps = [
    { number: 1, title: "Input & Data Ingestion", icon: FileText },
    { number: 2, title: "Labour Parameters", icon: Settings },
    { number: 3, title: "Equipment Parameters", icon: Settings },
    { number: 4, title: "Chemical Application", icon: Settings },
    { number: 5, title: "Time & Productivity", icon: Calculator },
    { number: 6, title: "Scope Summary", icon: Calculator },
    { number: 7, title: "Compliance & Validation", icon: AlertCircle },
    { number: 8, title: "Output Report", icon: FileText }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Scoping Engine</h1>
          <p className="text-slate-400">Convert inspection data into structured scope of works</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-6 flex items-center justify-between overflow-x-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            
            return (
              <div key={step.number} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isActive ? 'bg-cyan-600 border-cyan-500 text-white' :
                    isCompleted ? 'bg-green-600 border-green-500 text-white' :
                    'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {isCompleted ? '✓' : <Icon size={20} />}
                  </div>
                  <span className={`text-xs mt-2 text-center ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {step.number}
                  </span>
                  <span className={`text-xs mt-1 text-center hidden md:block ${isActive ? 'text-white' : 'text-slate-500'}`}>
                    {step.title.split(' ')[0]}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`h-1 flex-1 mx-2 ${isCompleted ? 'bg-green-600' : 'bg-slate-700'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Main Content */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
            {currentStep === 6 && renderStep6()}
            {currentStep === 7 && renderStep7()}
            {currentStep === 8 && renderStep8()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            onClick={currentStep === 1 ? onCancel : handlePrevious}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <ChevronLeft className="mr-2" size={16} />
            {currentStep === 1 ? 'Cancel' : 'Previous'}
          </Button>

          <div className="flex space-x-2">
            {currentStep < 8 && (
              <Button
                onClick={handleNext}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                Next
                <ChevronRight className="ml-2" size={16} />
              </Button>
            )}
            {currentStep === 8 && (
              <Button
                onClick={handleSave}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="mr-2" size={16} />
                {loading ? 'Saving...' : 'Save & Complete'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

