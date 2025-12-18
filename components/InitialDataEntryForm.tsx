"use client"

import { useState, useEffect } from "react"
import { FileText, Calendar, MapPin, User, Phone, Mail, Save, ArrowRight, AlertTriangle, Clock, Info, Thermometer, Droplets, Zap, Box, Plus, Minus, Wrench, ArrowLeft, Sparkles, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"
import { 
  calculateDryingPotential, 
  calculateWaterRemovalTarget, 
  calculateAirMoversRequired,
  calculateTotalVolume,
  type PsychrometricData 
} from "@/lib/psychrometric-calculations"
import {
  lgrDehumidifiers,
  desiccantDehumidifiers,
  airMovers,
  getAllEquipmentGroups,
  getEquipmentGroupById,
  calculateTotalAmps,
  calculateTotalDailyCost,
  calculateTotalCost,
  getEquipmentDailyRate,
  type EquipmentSelection,
  type EquipmentGroup
} from "@/lib/equipment-matrix"

interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string, reportType?: 'basic' | 'enhanced') => void
  initialData?: {
    clientName?: string
    clientContactDetails?: string
    propertyAddress?: string
    propertyPostcode?: string
    claimReferenceNumber?: string
    incidentDate?: string
    technicianAttendanceDate?: string
    technicianName?: string
    technicianFieldReport?: string
    // Property Intelligence
    buildingAge?: string
    structureType?: string
    accessNotes?: string
    // Hazard Profile
    insurerName?: string
    methamphetamineScreen?: string
    methamphetamineTestCount?: string
    biologicalMouldDetected?: boolean
    biologicalMouldCategory?: string
    // Timeline Estimation
    phase1StartDate?: string
    phase1EndDate?: string
    phase2StartDate?: string
    phase2EndDate?: string
    phase3StartDate?: string
    phase3EndDate?: string
    // Equipment & Tools Selection
    psychrometricWaterClass?: number
    psychrometricTemperature?: number
    psychrometricHumidity?: number
    psychrometricSystemType?: 'open' | 'closed'
    scopeAreas?: Array<{
      name: string
      length: number
      width: number
      height: number
      wetPercentage: number
    }>
    equipmentMentioned?: string[]
    estimatedDryingDuration?: number
  }
}

// Helper function to normalize date strings to YYYY-MM-DD format
function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  
  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // Try to parse various date formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, // DD/MM/YY or DD-MM-YY
  ]
  
  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      let year, month, day
      
      if (match[3].length === 4) {
        // Full year
        if (format === formats[0]) {
          // DD/MM/YYYY
          day = match[1].padStart(2, '0')
          month = match[2].padStart(2, '0')
          year = match[3]
        } else {
          // YYYY/MM/DD
          year = match[1]
          month = match[2].padStart(2, '0')
          day = match[3].padStart(2, '0')
        }
      } else {
        // 2-digit year
        day = match[1].padStart(2, '0')
        month = match[2].padStart(2, '0')
        const twoDigitYear = parseInt(match[3])
        year = twoDigitYear > 50 ? `19${match[3]}` : `20${match[3]}`
      }
      
      return `${year}-${month}-${day}`
    }
  }
  
  // If we can't parse it, try using Date object
  try {
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return ''
}

export default function InitialDataEntryForm({ onSuccess, initialData }: InitialDataEntryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    clientName: initialData?.clientName || '',
    clientContactDetails: initialData?.clientContactDetails || '',
    propertyAddress: initialData?.propertyAddress || '',
    propertyPostcode: initialData?.propertyPostcode || '',
    claimReferenceNumber: initialData?.claimReferenceNumber || '',
    incidentDate: normalizeDate(initialData?.incidentDate || ''),
    technicianAttendanceDate: normalizeDate(initialData?.technicianAttendanceDate || ''),
    technicianName: initialData?.technicianName || '',
    technicianFieldReport: initialData?.technicianFieldReport || '',
    // Property Intelligence
    buildingAge: initialData?.buildingAge || '',
    structureType: initialData?.structureType || '',
    accessNotes: initialData?.accessNotes || '',
    // Hazard Profile
    insurerName: initialData?.insurerName || '',
    methamphetamineScreen: initialData?.methamphetamineScreen || 'NEGATIVE',
    methamphetamineTestCount: initialData?.methamphetamineTestCount || '',
    biologicalMouldDetected: initialData?.biologicalMouldDetected || false,
    biologicalMouldCategory: initialData?.biologicalMouldCategory || '',
    // Timeline Estimation
    phase1StartDate: normalizeDate(initialData?.phase1StartDate || ''),
    phase1EndDate: normalizeDate(initialData?.phase1EndDate || ''),
    phase2StartDate: normalizeDate(initialData?.phase2StartDate || ''),
    phase2EndDate: normalizeDate(initialData?.phase2EndDate || ''),
    phase3StartDate: normalizeDate(initialData?.phase3StartDate || ''),
    phase3EndDate: normalizeDate(initialData?.phase3EndDate || '')
  })

  // Equipment & Analysis State
  const [reportId, setReportId] = useState<string | null>(null)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  
  // Equipment: Psychrometric Assessment
  const [waterClass, setWaterClass] = useState<1 | 2 | 3 | 4>(
    (initialData?.psychrometricWaterClass as 1 | 2 | 3 | 4) || 2
  )
  const [temperature, setTemperature] = useState(initialData?.psychrometricTemperature || 25)
  const [humidity, setHumidity] = useState(initialData?.psychrometricHumidity || 60)
  const [systemType, setSystemType] = useState<'open' | 'closed'>(
    initialData?.psychrometricSystemType || 'closed'
  )
  
  // Equipment: Scope Areas
  interface ScopeArea {
    id: string
    name: string
    length: number
    width: number
    height: number
    wetPercentage: number
  }
  const [areas, setAreas] = useState<ScopeArea[]>(() => {
    if (initialData?.scopeAreas && initialData.scopeAreas.length > 0) {
      return initialData.scopeAreas.map((area, index) => ({
        id: `area-${Date.now()}-${index}`,
        name: area.name,
        length: area.length,
        width: area.width,
        height: area.height,
        wetPercentage: area.wetPercentage
      }))
    }
    return []
  })
  const [newArea, setNewArea] = useState<Omit<ScopeArea, 'id'>>({
    name: '',
    length: 4,
    width: 4,
    height: 2.7,
    wetPercentage: 100
  })
  
  // Equipment: Equipment Selection
  const [equipmentSelections, setEquipmentSelections] = useState<EquipmentSelection[]>([])
  const [durationDays, setDurationDays] = useState(initialData?.estimatedDryingDuration || 4)
  
  // Analysis State
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)
  const [showAnalysisChoice, setShowAnalysisChoice] = useState(false)
  const [selectedReportType, setSelectedReportType] = useState<'basic' | 'enhanced' | null>(null)

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        clientName: initialData.clientName || '',
        clientContactDetails: initialData.clientContactDetails || '',
        propertyAddress: initialData.propertyAddress || '',
        propertyPostcode: initialData.propertyPostcode || '',
        claimReferenceNumber: initialData.claimReferenceNumber || '',
        incidentDate: normalizeDate(initialData.incidentDate || ''),
        technicianAttendanceDate: normalizeDate(initialData.technicianAttendanceDate || ''),
        technicianName: initialData.technicianName || '',
        technicianFieldReport: initialData.technicianFieldReport || '',
        // Property Intelligence
        buildingAge: initialData.buildingAge || '',
        structureType: initialData.structureType || '',
        accessNotes: initialData.accessNotes || '',
        // Hazard Profile
        insurerName: initialData.insurerName || '',
        methamphetamineScreen: initialData.methamphetamineScreen || 'NEGATIVE',
        methamphetamineTestCount: initialData.methamphetamineTestCount || '',
        biologicalMouldDetected: initialData.biologicalMouldDetected || false,
        biologicalMouldCategory: initialData.biologicalMouldCategory || '',
        // Timeline Estimation
        phase1StartDate: normalizeDate(initialData.phase1StartDate || ''),
        phase1EndDate: normalizeDate(initialData.phase1EndDate || ''),
        phase2StartDate: normalizeDate(initialData.phase2StartDate || ''),
        phase2EndDate: normalizeDate(initialData.phase2EndDate || ''),
        phase3StartDate: normalizeDate(initialData.phase3StartDate || ''),
        phase3EndDate: normalizeDate(initialData.phase3EndDate || '')
      })
      
      // Update Equipment & Tools Selection data
      if (initialData.psychrometricWaterClass) {
        setWaterClass(initialData.psychrometricWaterClass as 1 | 2 | 3 | 4)
      }
      if (initialData.psychrometricTemperature !== undefined) {
        setTemperature(initialData.psychrometricTemperature)
      }
      if (initialData.psychrometricHumidity !== undefined) {
        setHumidity(initialData.psychrometricHumidity)
      }
      if (initialData.psychrometricSystemType) {
        setSystemType(initialData.psychrometricSystemType)
      }
      if (initialData.scopeAreas && initialData.scopeAreas.length > 0) {
        setAreas(initialData.scopeAreas.map((area, index) => ({
          id: `area-${Date.now()}-${index}`,
          name: area.name,
          length: area.length,
          width: area.width,
          height: area.height,
          wetPercentage: area.wetPercentage
        })))
      }
      if (initialData.estimatedDryingDuration) {
        setDurationDays(initialData.estimatedDryingDuration)
      }
    }
  }, [initialData])

  // Fetch pricing config on mount
  useEffect(() => {
    const fetchPricingConfig = async () => {
      try {
        const response = await fetch('/api/pricing-config')
        if (response.ok) {
          const data = await response.json()
          const config = data.pricingConfig || data
          if (config) {
            setPricingConfig(config)
          }
        }
      } catch (error) {
        console.error('Error fetching pricing config:', error)
      }
    }
    fetchPricingConfig()
  }, [])

  // Equipment Calculations
  const dryingPotential = calculateDryingPotential({
    waterClass,
    temperature,
    humidity,
    systemType
  })
  
  const { totalVolume, totalAffectedArea } = calculateTotalVolume(areas)
  const waterRemovalTarget = calculateWaterRemovalTarget(totalVolume, waterClass, totalAffectedArea)
  const airMoversRequired = calculateAirMoversRequired(totalAffectedArea, waterClass)
  
  const totalAmps = calculateTotalAmps(equipmentSelections)
  const totalDailyCost = calculateTotalDailyCost(equipmentSelections, pricingConfig)
  const totalCost = calculateTotalCost(equipmentSelections, durationDays, pricingConfig)
  
  const totalEquipmentCapacity = equipmentSelections.reduce((total, sel) => {
    const group = getEquipmentGroupById(sel.groupId)
    if (group && (sel.groupId.startsWith('lgr-') || sel.groupId.startsWith('desiccant-'))) {
      const capacityMatch = group.capacity.match(/(\d+)/)
      if (capacityMatch) {
        return total + (parseInt(capacityMatch[1]) * sel.quantity)
      }
    }
    return total
  }, 0)
  
  const totalAirflow = equipmentSelections.reduce((total, sel) => {
    const group = getEquipmentGroupById(sel.groupId)
    if (group && group.airflow) {
      return total + (group.airflow * sel.quantity)
    }
    return total
  }, 0)

  // Equipment Helper Functions
  const handleAddArea = () => {
    if (!newArea.name.trim()) {
      toast.error('Please enter an area name')
      return
    }
    const area: ScopeArea = {
      ...newArea,
      id: Date.now().toString()
    }
    setAreas([...areas, area])
    setNewArea({
      name: '',
      length: 4,
      width: 4,
      height: 2.7,
      wetPercentage: 100
    })
    toast.success('Area added')
  }
  
  const handleRemoveArea = (id: string) => {
    setAreas(areas.filter(a => a.id !== id))
    toast.success('Area removed')
  }
  
  const handleEquipmentQuantityChange = (groupId: string, delta: number) => {
    setEquipmentSelections(prev => {
      const existing = prev.find(s => s.groupId === groupId)
      if (existing) {
        const newQuantity = Math.max(0, existing.quantity + delta)
        if (newQuantity === 0) {
          return prev.filter(s => s.groupId !== groupId)
        }
        return prev.map(s => 
          s.groupId === groupId 
            ? { ...s, quantity: newQuantity }
            : s
        )
      } else if (delta > 0) {
        const group = getEquipmentGroupById(groupId)
        const rate = pricingConfig ? getEquipmentDailyRate(groupId, pricingConfig) : 0
        return [...prev, {
          groupId,
          quantity: 1,
          dailyRate: rate
        }]
      }
      return prev
    })
  }
  
  const handleAutoSelect = () => {
    const selections: EquipmentSelection[] = []
    let remainingCapacity = waterRemovalTarget
    const lgrGroups = [...lgrDehumidifiers].reverse()
    for (const group of lgrGroups) {
      const capacityMatch = group.capacity.match(/(\d+)/)
      if (capacityMatch) {
        const capacity = parseInt(capacityMatch[1])
        const needed = Math.ceil(remainingCapacity / capacity)
        if (needed > 0) {
          const rate = pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0
          selections.push({
            groupId: group.id,
            quantity: needed,
            dailyRate: rate
          })
          remainingCapacity -= capacity * needed
        }
      }
    }
    let remainingAirMovers = airMoversRequired
    const airMoverGroups = [...airMovers].reverse()
    for (const group of airMoverGroups) {
      if (group.airflow) {
        const needed = Math.ceil(remainingAirMovers / (group.airflow / 1500))
        if (needed > 0) {
          const existing = selections.find(s => s.groupId === group.id)
          if (existing) {
            existing.quantity += needed
          } else {
            const rate = pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0
            selections.push({
              groupId: group.id,
              quantity: needed,
              dailyRate: rate
            })
          }
          remainingAirMovers -= (group.airflow / 1500) * needed
        }
      }
    }
    setEquipmentSelections(selections)
    toast.success('Equipment auto-selected based on targets')
  }

  // Analysis Helper Functions
  const triggerAnalysis = async (reportId: string) => {
    setAnalyzing(true)
    try {
      const response = await fetch('/api/reports/analyze-technician-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.analysis) {
          setAnalysis(data.analysis)
          setShowAnalysisChoice(true)
          toast.success('Report analyzed successfully')
        } else {
          toast.error('Failed to parse analysis response')
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to analyze report')
      }
    } catch (error) {
      console.error('Error analyzing report:', error)
      toast.error('Failed to analyze report')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReportTypeChoice = async (choice: 'basic' | 'enhanced') => {
    if (!reportId) return
    
    setLoading(true)
    try {
      // Update report with reportDepthLevel
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDepthLevel: choice === 'basic' ? 'Basic' : 'Enhanced'
        })
      })

      if (response.ok) {
        setSelectedReportType(choice)
        toast.success(`Report type set to ${choice}`)
        if (onSuccess) {
          onSuccess(reportId, choice)
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update report type')
      }
    } catch (error) {
      console.error('Error updating report type:', error)
      toast.error('Failed to update report type')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Validate required fields
    if (!formData.clientName.trim()) {
      toast.error('Client name is required')
      setLoading(false)
      return
    }

    if (!formData.propertyAddress.trim()) {
      toast.error('Property address is required')
      setLoading(false)
      return
    }

    if (!formData.propertyPostcode.trim()) {
      toast.error('Property postcode is required')
      setLoading(false)
      return
    }

    if (!formData.technicianFieldReport.trim()) {
      toast.error('Technician field report is required')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/reports/initial-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          incidentDate: formData.incidentDate ? new Date(formData.incidentDate).toISOString() : null,
          technicianAttendanceDate: formData.technicianAttendanceDate ? new Date(formData.technicianAttendanceDate).toISOString() : null,
        })
      })

      if (response.ok) {
        const data = await response.json()
        const newReportId = data.report.id
        setReportId(newReportId)
        toast.success('Initial data saved successfully')
        
        // Save equipment data if provided
        if (areas.length > 0 || equipmentSelections.length > 0) {
          try {
            const psychrometricAssessment = {
              waterClass,
              temperature,
              humidity,
              systemType,
              dryingPotential
            }
            
            const equipmentData = {
              psychrometricAssessment,
              scopeAreas: areas,
              equipmentSelection: equipmentSelections,
              equipmentCostTotal: totalCost,
              estimatedDryingDuration: durationDays,
              metrics: {
                totalVolume,
                totalAffectedArea,
                waterRemovalTarget,
                airMoversRequired,
                totalAmps,
                totalDailyCost
              }
            }
            
            const equipmentResponse = await fetch(`/api/reports/${newReportId}/equipment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(equipmentData)
            })
            
            if (equipmentResponse.ok) {
              toast.success('Equipment data saved successfully')
            } else {
              console.error('Failed to save equipment data')
            }
          } catch (error) {
            console.error('Error saving equipment data:', error)
          }
        }
        
        // Trigger analysis
        await triggerAnalysis(newReportId)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save initial data')
      }
    } catch (error) {
      console.error('Error saving initial data:', error)
      toast.error('Failed to save initial data')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-full mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Initial Data Entry</h2>
        <p className="text-slate-400">
          Enter the basic information from the technician's field report. All fields marked with * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Client Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => handleInputChange('clientName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Enter client's full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Client Contact Details
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.clientContactDetails}
                  onChange={(e) => handleInputChange('clientContactDetails', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  placeholder="Phone number, email, etc."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Property Information Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Property Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Property Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.propertyAddress}
                onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Full property address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Postcode <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={4}
                value={formData.propertyPostcode}
                onChange={(e) => handleInputChange('propertyPostcode', e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="0000"
              />
              <p className="text-xs text-slate-400 mt-1">Required for state detection and regulatory compliance</p>
            </div>
          </div>
        </div>

        {/* Claim Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Claim Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Claim Reference Number
              </label>
              <input
                type="text"
                value={formData.claimReferenceNumber}
                onChange={(e) => handleInputChange('claimReferenceNumber', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Claim reference"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Insurer / Client Name
              </label>
              <input
                type="text"
                value={formData.insurerName}
                onChange={(e) => handleInputChange('insurerName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Insurance company"
              />
            </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Date of Incident
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => handleInputChange('incidentDate', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
                </div>
              </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Technician Attendance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.technicianAttendanceDate}
                    onChange={(e) => handleInputChange('technicianAttendanceDate', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">
                Technician Name
              </label>
              <input
                type="text"
                value={formData.technicianName}
                onChange={(e) => handleInputChange('technicianName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Name of technician who attended"
              />
            </div>
          </div>
        </div>

        {/* Technician Field Report Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Technician Field Report
          </h3>

          <div>
            <label className="block text-sm font-medium mb-1">
              Technician's Field Report <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={formData.technicianFieldReport}
              onChange={(e) => handleInputChange('technicianFieldReport', e.target.value)}
              rows={6}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm"
              placeholder="Paste or type the technician's field report here..."
            />
          </div>
        </div>

        {/* Hazard Profile Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Hazard Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Methamphetamine Screen
              </label>
              <select
                value={formData.methamphetamineScreen}
                onChange={(e) => handleInputChange('methamphetamineScreen', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
              >
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="POSITIVE">POSITIVE</option>
              </select>
            </div>

            {formData.methamphetamineScreen === 'POSITIVE' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Test Count
                </label>
                <input
                  type="number"
                  value={formData.methamphetamineTestCount}
                  onChange={(e) => handleInputChange('methamphetamineTestCount', e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  placeholder="Test count"
                  min="1"
                />
              </div>
            )}

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={formData.biologicalMouldDetected}
                  onChange={(e) => handleInputChange('biologicalMouldDetected', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                Bio/Mould Detected
              </label>
            </div>

            {formData.biologicalMouldDetected && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mould Category
                </label>
                <select
                  value={formData.biologicalMouldCategory}
                  onChange={(e) => handleInputChange('biologicalMouldCategory', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                >
                  <option value="">Select category</option>
                  <option value="CAT 3">CAT 3</option>
                  <option value="CAT 2">CAT 2</option>
                  <option value="CAT 1">CAT 1</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Estimation Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timeline Estimation (Optional)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Phase 1 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 1: Make-safe</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1StartDate}
                      onChange={(e) => handleInputChange('phase1StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
            />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1EndDate}
                      onChange={(e) => handleInputChange('phase1EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 2 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 2: Remediation/Drying</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2StartDate}
                      onChange={(e) => handleInputChange('phase2StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2EndDate}
                      onChange={(e) => handleInputChange('phase2EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 3 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 3: Verification</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3StartDate}
                      onChange={(e) => handleInputChange('phase3StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3EndDate}
                      onChange={(e) => handleInputChange('phase3EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Equipment Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Equipment & Tools Selection
          </h3>

          {/* Psychrometric Assessment */}
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-400 mb-1">Drying Potential Assessment</h4>
                  <p className="text-sm text-slate-300">
                    Understand the 'Energy' in the air. Temperature and Humidity determine if the air acts like a 'Thirsty Sponge' (Good) or a 'Saturated Sponge' (Bad).
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-900/30">
                <h4 className="text-lg font-semibold mb-4">Water Loss Class</h4>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[1, 2, 3, 4].map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setWaterClass(cls as 1 | 2 | 3 | 4)}
                      className={`px-4 py-2 rounded-lg border transition-colors ${
                        waterClass === cls
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                          : 'border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mb-6">Class 1 (Least water) to Class 4 (Bound water/Deep saturation)</p>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="w-5 h-5 text-orange-400" />
                      <label className="font-medium">Temperature: {temperature}°C</label>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="40"
                      value={temperature}
                      onChange={(e) => setTemperature(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Droplets className="w-5 h-5 text-blue-400" />
                      <label className="font-medium">Humidity: {humidity}%</label>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={humidity}
                      onChange={(e) => setHumidity(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-6 rounded-lg border border-pink-500/50 bg-pink-500/10">
                <div className="flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-red-400" />
                </div>
                <h4 className="text-2xl font-bold text-center mb-2">DRYING POTENTIAL</h4>
                <div className="text-6xl font-bold text-center mb-4">{dryingPotential.dryingIndex}</div>
                <div className={`inline-block px-4 py-1 rounded-full text-sm font-semibold mb-4 w-full text-center ${
                  dryingPotential.status === 'POOR' ? 'bg-red-500 text-white' :
                  dryingPotential.status === 'FAIR' ? 'bg-orange-500 text-white' :
                  dryingPotential.status === 'GOOD' ? 'bg-green-500 text-white' :
                  'bg-blue-500 text-white'
                }`}>
                  {dryingPotential.status}
                </div>
                <p className="text-sm text-slate-300 text-center">{dryingPotential.recommendation}</p>
              </div>
            </div>
          </div>

          {/* Scope Areas */}
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
              <div className="flex items-start gap-3">
                <Box className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-400 mb-1">Scope Areas</h4>
                  <p className="text-sm text-slate-300">
                    Equipment needs are calculated based on the <strong>Volume of Air</strong> (for Dehumidifiers) and the <strong>Affected Floor Area</strong> (for Air Movers).
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-900/30">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Room Management</h4>
                <span className="px-3 py-1 bg-slate-700 rounded-full text-sm">{areas.length} Areas</span>
              </div>
              
              <div className="grid grid-cols-6 gap-4 mb-6 p-4 bg-slate-800/50 rounded-lg">
                <div>
                  <label className="block text-xs font-medium mb-1">AREA NAME</label>
                  <input
                    type="text"
                    value={newArea.name}
                    onChange={(e) => setNewArea({ ...newArea, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                    placeholder="e.g. Master Bed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">L</label>
                  <input
                    type="number"
                    value={newArea.length}
                    onChange={(e) => setNewArea({ ...newArea, length: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">W</label>
                  <input
                    type="number"
                    value={newArea.width}
                    onChange={(e) => setNewArea({ ...newArea, width: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">H</label>
                  <input
                    type="number"
                    value={newArea.height}
                    onChange={(e) => setNewArea({ ...newArea, height: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">WET %</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newArea.wetPercentage}
                    onChange={(e) => setNewArea({ ...newArea, wetPercentage: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="text-xs text-center mt-1">{newArea.wetPercentage}%</div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddArea}
                    className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {areas.length > 0 && (
                <div className="grid md:grid-cols-2 gap-4">
                  {areas.map((area) => {
                    const volume = area.length * area.width * area.height
                    const wetArea = area.length * area.width * (area.wetPercentage / 100)
                    return (
                      <div key={area.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-semibold">{area.name}</h5>
                          <button
                            type="button"
                            onClick={() => handleRemoveArea(area.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs text-slate-400 mb-2">
                          {area.length}×{area.width}×{area.height} m
                        </div>
                        <div className="text-sm mb-1">
                          <span className="text-slate-400">VOL:</span> {volume.toFixed(1)}m³
                        </div>
                        <div className="text-sm mb-2">
                          <span className="text-slate-400">WET AREA:</span> {wetArea.toFixed(1)}m²
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-cyan-500 h-2 rounded-full"
                            style={{ width: `${area.wetPercentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Equipment Selection - Simplified for space */}
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
              <div className="flex items-start gap-3">
                <Wrench className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-400 mb-1">Equipment Selection</h4>
                  <p className="text-sm text-slate-300">
                    Use 'Auto-Select Best Fit' to instantly load standard equipment, or manually select items.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-900/30">
                <h4 className="text-lg font-semibold mb-2">Job Manifest</h4>
                <div className="p-4 bg-slate-800/50 rounded-lg mb-4">
                  <h5 className="font-semibold mb-3">Efficiency Targets</h5>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Water Removal</span>
                        <span>{totalEquipmentCapacity} / {waterRemovalTarget} L/Day</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (totalEquipmentCapacity / waterRemovalTarget) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Air Movement</span>
                        <span>{Math.round(totalAirflow / 1500)} / {airMoversRequired} Units</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full"
                          style={{ width: `${Math.min(100, ((totalAirflow / 1500) / airMoversRequired) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <h5 className="font-semibold mb-3">ESTIMATED CONSUMPTION</h5>
                  <div className="text-2xl font-bold mb-2">${totalCost.toFixed(2)}</div>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      min="1"
                      value={durationDays}
                      onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                      className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-sm"
                    />
                    <span className="text-sm">Days</span>
                  </div>
                  <div className="text-sm text-slate-400">Total Draw: {totalAmps.toFixed(1)} Amps</div>
                </div>
              </div>
              
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleAutoSelect}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  <Wrench className="w-4 h-4" />
                  Auto-Select Best Fit
                </button>
                
                <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-900/30 max-h-96 overflow-y-auto">
                  <h5 className="font-semibold mb-3">LGR DEHUMIDIFIERS</h5>
                  <div className="space-y-2">
                    {lgrDehumidifiers.map((group) => {
                      const selection = equipmentSelections.find(s => s.groupId === group.id)
                      const quantity = selection?.quantity || 0
                      return (
                        <div key={group.id} className={`p-3 rounded-lg border ${
                          quantity > 0 ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/50'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{group.capacity}</div>
                              <div className="text-xs text-slate-400">
                                ${(selection?.dailyRate || (pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0)).toFixed(2)}/day
                              </div>
                            </div>
                            {quantity > 0 && (
                              <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-semibold mr-2">
                                {quantity}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEquipmentQuantityChange(group.id, 1)}
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  <h5 className="font-semibold mb-3 mt-4">AIR MOVERS</h5>
                  <div className="space-y-2">
                    {airMovers.map((group) => {
                      const selection = equipmentSelections.find(s => s.groupId === group.id)
                      const quantity = selection?.quantity || 0
                      return (
                        <div key={group.id} className={`p-3 rounded-lg border ${
                          quantity > 0 ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/50'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{group.capacity}</div>
                              <div className="text-xs text-slate-400">
                                ${(selection?.dailyRate || (pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0)).toFixed(2)}/day
                              </div>
                            </div>
                            {quantity > 0 && (
                              <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-semibold mr-2">
                                {quantity}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEquipmentQuantityChange(group.id, 1)}
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analysis Section */}
        {showAnalysisChoice && analysis && (
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-6">
            <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              Report Analysis Summary
            </h3>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Affected Areas</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.affectedAreas?.length > 0 ? (
                    analysis.affectedAreas.map((area: string, idx: number) => (
                      <span key={idx} className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full text-sm">
                        {area}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">Not specified</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Water Source</h4>
                <p className="text-white">{analysis.waterSource || 'Not specified'}</p>
                {analysis.waterCategory && (
                  <span className="inline-block mt-2 px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                    Category {analysis.waterCategory}
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Affected Materials</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.affectedMaterials?.length > 0 ? (
                    analysis.affectedMaterials.map((material: string, idx: number) => (
                      <span key={idx} className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                        {material}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">Not specified</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Equipment Deployed</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.equipmentDeployed?.length > 0 ? (
                    analysis.equipmentDeployed.map((equipment: string, idx: number) => (
                      <span key={idx} className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm">
                        {equipment}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">Not specified</span>
                  )}
                </div>
              </div>
            </div>

            {analysis.hazardsIdentified?.length > 0 && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Hazards Identified
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.hazardsIdentified.map((hazard: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-sm">
                      {hazard}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.observations && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Key Observations</h4>
                <p className="text-slate-300 text-sm">{analysis.observations}</p>
              </div>
            )}

            {/* Report Type Choice */}
            <div className="grid md:grid-cols-2 gap-6 mt-6">
              <button
                type="button"
                onClick={() => handleReportTypeChoice('basic')}
                disabled={loading || analyzing}
                className="p-6 rounded-lg border-2 border-slate-600 hover:border-blue-500 bg-slate-800/30 hover:bg-slate-800/50 transition-all text-left group disabled:opacity-50"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                      <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-semibold text-white">Basic Report</h4>
                      <p className="text-sm text-slate-400">Quick Processing</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
                </div>
                <p className="text-slate-300 mb-4">Suitable for straightforward, simple claims</p>
                <div className="space-y-2">
                  {['Areas affected', 'Observations from technician', 'Equipment deployed', 'Reference to IICRC standards', 'Any obvious hazards flagged'].map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-400">
                      <CheckCircle className="w-4 h-4" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleReportTypeChoice('enhanced')}
                disabled={loading || analyzing}
                className="p-6 rounded-lg border-2 border-cyan-500 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all text-left group relative disabled:opacity-50"
              >
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-full">
                    RECOMMENDED
                  </span>
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                      <Sparkles className="w-6 h-6 text-cyan-300" />
                    </div>
                    <div>
                      <h4 className="text-xl font-semibold text-white">Enhanced Report</h4>
                      <p className="text-sm text-cyan-400">Depth Analysis</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                </div>
                <p className="text-slate-300 mb-4">Recommended for complex claims with detailed questioning system</p>
                <div className="space-y-2">
                  {['All Basic Report features', 'Detailed tiered questioning', 'Comprehensive scope of works', 'Detailed cost estimation', 'Richer, more comprehensive reports'].map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                      <CheckCircle className="w-4 h-4 text-cyan-400" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Loading/Analyzing State */}
        {analyzing && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            <p className="text-slate-400">Analyzing technician report...</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                Save & Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

