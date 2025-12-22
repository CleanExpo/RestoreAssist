"use client"

import { useState, useEffect } from "react"
import { Info, Thermometer, Droplets, Zap, Box, Plus, Minus, Wrench, ArrowRight, ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"
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
  heatDrying,
  getAllEquipmentGroups,
  getEquipmentGroupById,
  calculateTotalAmps,
  calculateTotalDailyCost,
  calculateTotalCost,
  getEquipmentDailyRate,
  type EquipmentSelection,
  type EquipmentGroup
} from "@/lib/equipment-matrix"

interface EquipmentToolsSelectionProps {
  reportId: string
  onComplete?: (data: any) => void
  initialData?: {
    psychrometricAssessment?: any
    scopeAreas?: any[]
    equipmentSelection?: EquipmentSelection[]
  }
}

type Step = 1 | 2 | 3

interface ScopeArea {
  id: string
  name: string
  length: number
  width: number
  height: number
  wetPercentage: number
}

export default function EquipmentToolsSelection({ 
  reportId, 
  onComplete,
  initialData 
}: EquipmentToolsSelectionProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  
  // Step 1: Psychrometric Assessment
  const [waterClass, setWaterClass] = useState<1 | 2 | 3 | 4>(2)
  const [temperature, setTemperature] = useState(25)
  const [humidity, setHumidity] = useState(60)
  const [systemType, setSystemType] = useState<'open' | 'closed'>('closed')
  
  // Step 2: Scope Areas
  const [areas, setAreas] = useState<ScopeArea[]>(initialData?.scopeAreas || [])
  const [newArea, setNewArea] = useState<Omit<ScopeArea, 'id'>>({
    name: '',
    length: 4,
    width: 4,
    height: 2.7,
    wetPercentage: 100
  })
  
  // Step 3: Equipment Selection
  const [equipmentSelections, setEquipmentSelections] = useState<EquipmentSelection[]>(
    initialData?.equipmentSelection || []
  )
  const [durationDays, setDurationDays] = useState(4)

  // Fetch pricing config on mount
  useEffect(() => {
    const fetchPricingConfig = async () => {
      try {
        const response = await fetch('/api/pricing-config')
        if (response.ok) {
          const data = await response.json()
          // Extract pricingConfig from response (it might be nested)
          const config = data.pricingConfig || data
          
          if (config) {
              dehumidifierLGRDailyRate: config.dehumidifierLGRDailyRate,
              dehumidifierDesiccantDailyRate: config.dehumidifierDesiccantDailyRate,
              airMoverAxialDailyRate: config.airMoverAxialDailyRate,
              injectionDryingSystemDailyRate: config.injectionDryingSystemDailyRate
            })
          }
          
          setPricingConfig(config)
          
          // Update equipment selections with pricing config rates if they don't have rates
          if (config && equipmentSelections.length > 0) {
            setEquipmentSelections(prev => prev.map(sel => ({
              ...sel,
              // Only update if selection doesn't already have a rate
              dailyRate: sel.dailyRate || getEquipmentDailyRate(sel.groupId, config)
            })))
          }
        }
      } catch (error) {
        console.error('[Pricing Config] Error fetching pricing config:', error)
      }
    }
    fetchPricingConfig()
  }, [])
  
  // Calculate drying potential
  const dryingPotential = calculateDryingPotential({
    waterClass,
    temperature,
    humidity,
    systemType
  })
  
  // Calculate scope metrics
  const { totalVolume, totalAffectedArea } = calculateTotalVolume(areas)
  const waterRemovalTarget = calculateWaterRemovalTarget(totalVolume, waterClass, totalAffectedArea)
  const airMoversRequired = calculateAirMoversRequired(totalAffectedArea, waterClass)
  
  // Calculate equipment totals using pricing config
  const totalAmps = calculateTotalAmps(equipmentSelections)
  const totalDailyCost = calculateTotalDailyCost(equipmentSelections, pricingConfig)
  const totalCost = calculateTotalCost(equipmentSelections, durationDays, pricingConfig)
  
  // Calculate efficiency targets
  // Only count dehumidifiers (LGR/Desiccant) for water removal capacity, not air movers
  const totalEquipmentCapacity = equipmentSelections.reduce((total, sel) => {
    const group = getEquipmentGroupById(sel.groupId)
    // Only include LGR and Desiccant dehumidifiers (they have capacity in L/Day)
    // Exclude air movers (they have airflow, not water removal capacity)
    if (group && (sel.groupId.startsWith('lgr-') || sel.groupId.startsWith('desiccant-'))) {
      // Extract numeric capacity for LGR/Desiccant (e.g., "85L/Day Ave" -> 85)
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
        // Preserve the existing dailyRate when changing quantity
        return prev.map(s => 
          s.groupId === groupId 
            ? { ...s, quantity: newQuantity }
            : s
        )
      } else if (delta > 0) {
        const group = getEquipmentGroupById(groupId)
        // Use pricing config rate if available, otherwise use default from equipment matrix
        // This ensures we use the correct rate for each capacity group
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
    // Auto-select equipment based on targets
    const selections: EquipmentSelection[] = []
    
    // Select LGR dehumidifiers to meet water removal target
    let remainingCapacity = waterRemovalTarget
    const lgrGroups = [...lgrDehumidifiers].reverse() // Start with larger capacity
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
    
    // Select air movers to meet requirement
    let remainingAirMovers = airMoversRequired
    const airMoverGroups = [...airMovers].reverse()
    for (const group of airMoverGroups) {
      if (group.airflow) {
        // Estimate: 1 unit per 1500 CFM needed
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
  
  const handleSave = async () => {
    setLoading(true)
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
      
      const response = await fetch(`/api/reports/${reportId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(equipmentData)
      })
      
      if (response.ok) {
        toast.success('Equipment data saved successfully')
        if (onComplete) {
          onComplete(equipmentData)
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save equipment data')
      }
    } catch (error) {
      console.error('Error saving equipment data:', error)
      toast.error('Failed to save equipment data')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                currentStep === step
                  ? 'bg-cyan-500 text-white'
                  : currentStep > step
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {currentStep > step ? '✓' : step}
              </div>
              {step < 3 && (
                <div className={`w-16 h-1 ${
                  currentStep > step ? 'bg-green-500' : 'bg-slate-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Step 1: Drying Potential Assessment */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-400 mb-1">Why do we check this first?</h3>
                <p className="text-sm text-slate-300">
                  Before setting up equipment, we must understand the 'Energy' in the air. The combination of Temperature and Humidity determines if the air acts like a 'Thirsty Sponge' (Good) or a 'Saturated Sponge' (Bad). This sets the strategy for the whole job.
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Card: Inputs */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <h3 className="text-xl font-semibold mb-4">Water Loss Class</h3>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[1, 2, 3, 4].map((cls) => (
                  <button
                    key={cls}
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
              <p className="text-xs text-slate-400 mb-6">
                Class 1 (Least water) to Class 4 (Bound water/Deep saturation)
              </p>
              
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="w-5 h-5 text-orange-400" />
                    <label className="font-medium">Temperature</label>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={temperature}
                    onChange={(e) => setTemperature(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>1°C</span>
                    <span className="font-semibold text-white">{temperature}°C</span>
                    <span>40°C</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-5 h-5 text-blue-400" />
                    <label className="font-medium">Humidity</label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={humidity}
                    onChange={(e) => setHumidity(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>0%</span>
                    <span className="font-semibold text-white">{humidity}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Card: Drying Potential */}
            <div className="p-6 rounded-lg border border-pink-500/50 bg-pink-500/10">
              <div className="flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-2xl font-bold text-center mb-2">DRYING POTENTIAL</h3>
              <div className="text-6xl font-bold text-center mb-4">{dryingPotential.dryingIndex}</div>
              <div className={`inline-block px-4 py-1 rounded-full text-sm font-semibold mb-4 ${
                dryingPotential.status === 'POOR' ? 'bg-red-500 text-white' :
                dryingPotential.status === 'FAIR' ? 'bg-orange-500 text-white' :
                dryingPotential.status === 'GOOD' ? 'bg-green-500 text-white' :
                'bg-blue-500 text-white'
              }`}>
                {dryingPotential.status}
              </div>
              <p className="text-sm text-slate-300">{dryingPotential.recommendation}</p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
            >
              Next: Scope Areas
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Step 2: Scope Areas */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
            <div className="flex items-start gap-3">
              <Box className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-400 mb-1">Why measure individual rooms?</h3>
                <p className="text-sm text-slate-300">
                  Equipment needs are calculated based on the <strong>Volume of Air</strong> (for Dehumidifiers) and the <strong>Affected Floor Area</strong> (for Air Movers). Don't guess! Measure length, width, and estimate what % of the carpet/floor is actually wet.
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Box className="w-5 h-5" />
                Room Management
              </h3>
              <span className="px-3 py-1 bg-slate-700 rounded-full text-sm">
                {areas.length} Areas
              </span>
            </div>
            
            {/* New Area Input */}
            <div className="grid grid-cols-6 gap-4 mb-6 p-4 bg-slate-900/50 rounded-lg">
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
                  onClick={handleAddArea}
                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Existing Areas */}
            {areas.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {areas.map((area) => {
                  const volume = area.length * area.width * area.height
                  const wetArea = area.length * area.width * (area.wetPercentage / 100)
                  return (
                    <div key={area.id} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold">{area.name}</h4>
                        <button
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
          
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
            >
              Next: Select Equipment
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Step 3: Equipment Selection */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-start gap-3">
              <Wrench className="w-5 h-5 text-green-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-400 mb-1">How to pick the right gear?</h3>
                <p className="text-sm text-slate-300">
                  The system has calculated your targets based on the previous steps. Use the 'Auto-Select Best Fit' button to instantly load standard Australian equipment ('Ave' classes) that meet these targets, or manually pick items from your truck inventory.
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column: Job Manifest */}
            <div className="space-y-4">
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                  <Box className="w-5 h-5" />
                  Job Manifest
                </h3>
                <p className="text-sm text-slate-400 mb-4">Build equipment loadout</p>
                
                {/* Efficiency Targets */}
                <div className="p-4 bg-slate-900/50 rounded-lg mb-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    Efficiency Targets
                  </h4>
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
                
                {/* Estimated Consumption */}
                <div className="p-4 bg-slate-900/50 rounded-lg">
                  <h4 className="font-semibold mb-3">ESTIMATED CONSUMPTION</h4>
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
                  <div className="text-sm text-slate-400">
                    Total Draw: {totalAmps.toFixed(1)} Amps
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column: Equipment Selection */}
            <div className="space-y-4">
              <button
                onClick={handleAutoSelect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
              >
                <Wrench className="w-4 h-4" />
                Auto-Select Best Fit
              </button>
              
              {/* LGR Dehumidifiers */}
              <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <h4 className="font-semibold mb-3">LGR DEHUMIDIFIERS</h4>
                <div className="space-y-2">
                  {lgrDehumidifiers.map((group) => {
                    const selection = equipmentSelections.find(s => s.groupId === group.id)
                    const quantity = selection?.quantity || 0
                    return (
                      <div key={group.id} className={`p-3 rounded-lg border ${
                        quantity > 0 ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{group.capacity}</div>
                            <div className="text-xs text-slate-400">
                              {group.amps}A | {group.models.length} Models
                            </div>
                            <div className="text-xs text-cyan-400 mt-1">
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
                              onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
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
              
              {/* Desiccant Dehumidifiers */}
              <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <h4 className="font-semibold mb-3">DESICCANT DEHUMIDIFIERS</h4>
                <div className="space-y-2">
                  {desiccantDehumidifiers.map((group) => {
                    const selection = equipmentSelections.find(s => s.groupId === group.id)
                    const quantity = selection?.quantity || 0
                    return (
                      <div key={group.id} className={`p-3 rounded-lg border ${
                        quantity > 0 ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{group.capacity}</div>
                            <div className="text-xs text-slate-400">
                              {group.amps}A | {group.models.length} Models
                            </div>
                            <div className="text-xs text-cyan-400 mt-1">
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
                              onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
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
              
              {/* Air Movers */}
              <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <h4 className="font-semibold mb-3">AIR MOVERS (AXIAL/CENTRIFUGAL)</h4>
                <div className="space-y-2">
                  {airMovers.map((group) => {
                    const selection = equipmentSelections.find(s => s.groupId === group.id)
                    const quantity = selection?.quantity || 0
                    return (
                      <div key={group.id} className={`p-3 rounded-lg border ${
                        quantity > 0 ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{group.capacity}</div>
                            <div className="text-xs text-slate-400">
                              {group.amps}A | {group.models.length} Models
                            </div>
                            <div className="text-xs text-cyan-400 mt-1">
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
                              onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
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
          
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/50 transition-all disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save & Complete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

