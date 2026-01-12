"use client"

import { useState, useEffect } from "react"
import { 
  Thermometer, 
  Droplets, 
  MapPin, 
  Camera, 
  CheckCircle, 
  AlertCircle,
  Plus,
  X,
  Save,
  ArrowRight,
  Loader2,
  Sparkles,
  ClipboardCheck,
  Trash2,
  Upload,
  FileImage
} from "lucide-react"
import toast from "react-hot-toast"

interface NIRTechnicianInputFormProps {
  reportId?: string
  onComplete?: (inspectionId: string) => void
  onCancel?: () => void
}

// Surface types for moisture readings (dropdown only)
const SURFACE_TYPES = [
  "Drywall",
  "Wood",
  "Carpet",
  "Concrete",
  "Tile",
  "Vinyl",
  "Hardwood",
  "Particle Board",
  "Plaster",
  "Other"
]

// Water source types (dropdown only)
const WATER_SOURCES = [
  "Clean Water",
  "Grey Water",
  "Black Water"
]

// Scope item types (checklist/dropdown only)
const SCOPE_ITEM_TYPES = [
  { id: "remove_carpet", label: "Remove Carpet" },
  { id: "sanitize_materials", label: "Sanitize Materials" },
  { id: "install_dehumidification", label: "Install Dehumidification" },
  { id: "install_air_movers", label: "Install Air Movers" },
  { id: "extract_standing_water", label: "Extract Standing Water" },
  { id: "demolish_drywall", label: "Demolish Drywall" },
  { id: "apply_antimicrobial", label: "Apply Antimicrobial Treatment" },
  { id: "dry_out_structure", label: "Dry Out Structure" },
  { id: "containment_setup", label: "Containment Setup" },
  { id: "ppe_required", label: "PPE Required" }
]

export default function NIRTechnicianInputForm({ 
  reportId, 
  onComplete,
  onCancel 
}: NIRTechnicianInputFormProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  
  // Environmental Data
  const [environmentalData, setEnvironmentalData] = useState({
    ambientTemperature: 25,
    humidityLevel: 60,
    dewPoint: 0,
    airCirculation: false,
    weatherConditions: ""
  })
  
  // Moisture Readings
  const [moistureReadings, setMoistureReadings] = useState<Array<{
    id: string
    location: string
    surfaceType: string
    moistureLevel: number
    depth: "Surface" | "Subsurface"
  }>>([])
  
  const [newMoistureReading, setNewMoistureReading] = useState({
    location: "",
    surfaceType: SURFACE_TYPES[0],
    moistureLevel: 0,
    depth: "Surface" as "Surface" | "Subsurface"
  })
  
  // Affected Areas
  const [affectedAreas, setAffectedAreas] = useState<Array<{
    id: string
    roomZoneId: string
    affectedSquareFootage: number
    waterSource: string
    timeSinceLoss: number
  }>>([])
  
  const [newAffectedArea, setNewAffectedArea] = useState({
    roomZoneId: "",
    affectedSquareFootage: 0,
    waterSource: WATER_SOURCES[0],
    timeSinceLoss: 0
  })
  
  // Scope Items (checklist)
  const [selectedScopeItems, setSelectedScopeItems] = useState<Set<string>>(new Set())
  const [scopeItemSpecs, setScopeItemSpecs] = useState<Record<string, string>>({})
  
  // Photos
  const [photos, setPhotos] = useState<File[]>([])
  
  // Property Address (required)
  const [propertyAddress, setPropertyAddress] = useState("")
  const [propertyPostcode, setPropertyPostcode] = useState("")
  const [technicianName, setTechnicianName] = useState("")
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  // Initialize inspection if reportId provided
  useEffect(() => {
    if (reportId && !inspectionId) {
      initializeInspection()
    }
  }, [reportId])
  
  const initializeInspection = async () => {
    if (!reportId) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/inspections?reportId=${reportId}`, {
        method: "GET"
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.inspection) {
          setInspectionId(data.inspection.id)
          // Load existing data
          if (data.inspection.environmentalData) {
            setEnvironmentalData(data.inspection.environmentalData)
          }
          if (data.inspection.moistureReadings) {
            setMoistureReadings(data.inspection.moistureReadings)
          }
          if (data.inspection.affectedAreas) {
            setAffectedAreas(data.inspection.affectedAreas)
          }
          if (data.inspection.scopeItems) {
            const selected = new Set(data.inspection.scopeItems.map((item: any) => item.itemType))
            setSelectedScopeItems(selected)
          }
          if (data.inspection.propertyAddress) {
            setPropertyAddress(data.inspection.propertyAddress)
          }
          if (data.inspection.propertyPostcode) {
            setPropertyPostcode(data.inspection.propertyPostcode)
          }
          if (data.inspection.technicianName) {
            setTechnicianName(data.inspection.technicianName)
          }
        }
      }
    } catch (error) {
      console.error("Error initializing inspection:", error)
    } finally {
      setLoading(false)
    }
  }
  
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    
    if (!propertyAddress.trim()) {
      errors.propertyAddress = "Property address is required"
    }
    
    if (!propertyPostcode.trim()) {
      errors.propertyPostcode = "Property postcode is required"
    }
    
    if (moistureReadings.length === 0) {
      errors.moistureReadings = "At least one moisture reading is required"
    }
    
    if (affectedAreas.length === 0) {
      errors.affectedAreas = "At least one affected area is required"
    }
    
    if (photos.length === 0) {
      errors.photos = "At least one photo is required"
    }
    
    // Validate environmental data ranges
    if (environmentalData.ambientTemperature < -20 || environmentalData.ambientTemperature > 130) {
      errors.temperature = "Temperature must be between -20°F and 130°F"
    }
    
    if (environmentalData.humidityLevel < 0 || environmentalData.humidityLevel > 100) {
      errors.humidity = "Humidity must be between 0% and 100%"
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }
  
  const handleAddMoistureReading = () => {
    if (!newMoistureReading.location.trim()) {
      toast.error("Please enter a location")
      return
    }
    
    if (newMoistureReading.moistureLevel < 0 || newMoistureReading.moistureLevel > 100) {
      toast.error("Moisture level must be between 0% and 100%")
      return
    }
    
    setMoistureReadings([
      ...moistureReadings,
      {
        id: Date.now().toString(),
        ...newMoistureReading
      }
    ])
    
    setNewMoistureReading({
      location: "",
      surfaceType: SURFACE_TYPES[0],
      moistureLevel: 0,
      depth: "Surface"
    })
    
    toast.success("Moisture reading added")
  }
  
  const handleRemoveMoistureReading = (id: string) => {
    setMoistureReadings(moistureReadings.filter(r => r.id !== id))
    toast.success("Moisture reading removed")
  }
  
  const handleAddAffectedArea = () => {
    if (!newAffectedArea.roomZoneId.trim()) {
      toast.error("Please enter a room/zone ID")
      return
    }
    
    if (newAffectedArea.affectedSquareFootage <= 0) {
      toast.error("Affected square footage must be greater than 0")
      return
    }
    
    setAffectedAreas([
      ...affectedAreas,
      {
        id: Date.now().toString(),
        ...newAffectedArea
      }
    ])
    
    setNewAffectedArea({
      roomZoneId: "",
      affectedSquareFootage: 0,
      waterSource: WATER_SOURCES[0],
      timeSinceLoss: 0
    })
    
    toast.success("Affected area added")
  }
  
  const handleRemoveAffectedArea = (id: string) => {
    setAffectedAreas(affectedAreas.filter(a => a.id !== id))
    toast.success("Affected area removed")
  }
  
  const handleScopeItemToggle = (itemId: string) => {
    const newSelected = new Set(selectedScopeItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
      // Remove spec if deselecting
      const newSpecs = { ...scopeItemSpecs }
      delete newSpecs[itemId]
      setScopeItemSpecs(newSpecs)
    } else {
      newSelected.add(itemId)
    }
    setSelectedScopeItems(newSelected)
  }
  
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setPhotos([...photos, ...files])
      toast.success(`${files.length} photo(s) added`)
    }
  }
  
  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index))
    toast.success("Photo removed")
  }
  
  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fix validation errors before submitting")
      return
    }
    
    setSaving(true)
    
    try {
      // Step 1: Create or update inspection
      let currentInspectionId = inspectionId
      
      if (!currentInspectionId) {
        const createResponse = await fetch("/api/inspections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId,
            propertyAddress,
            propertyPostcode,
            technicianName: technicianName || undefined
          })
        })
        
        if (!createResponse.ok) {
          const error = await createResponse.json()
          throw new Error(error.error || "Failed to create inspection")
        }
        
        const createData = await createResponse.json()
        currentInspectionId = createData.inspection.id
        setInspectionId(currentInspectionId)
      }
      
      // Step 2: Save environmental data
      await fetch(`/api/inspections/${currentInspectionId}/environmental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(environmentalData)
      })
      
      // Step 3: Save moisture readings
      for (const reading of moistureReadings) {
        await fetch(`/api/inspections/${currentInspectionId}/moisture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: reading.location,
            surfaceType: reading.surfaceType,
            moistureLevel: reading.moistureLevel,
            depth: reading.depth
          })
        })
      }
      
      // Step 4: Save affected areas
      for (const area of affectedAreas) {
        await fetch(`/api/inspections/${currentInspectionId}/affected-areas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomZoneId: area.roomZoneId,
            affectedSquareFootage: area.affectedSquareFootage,
            waterSource: area.waterSource,
            timeSinceLoss: area.timeSinceLoss
          })
        })
      }
      
      // Step 5: Upload photos
      for (const photo of photos) {
        const formData = new FormData()
        formData.append("file", photo)
        formData.append("inspectionId", currentInspectionId)
        
        await fetch(`/api/inspections/${currentInspectionId}/photos`, {
          method: "POST",
          body: formData
        })
      }
      
      // Step 6: Save scope items
      for (const itemId of selectedScopeItems) {
        const item = SCOPE_ITEM_TYPES.find(i => i.id === itemId)
        if (item) {
          await fetch(`/api/inspections/${currentInspectionId}/scope-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemType: itemId,
              description: item.label,
              specification: scopeItemSpecs[itemId] || undefined
            })
          })
        }
      }
      
      // Step 7: Submit for processing
      const submitResponse = await fetch(`/api/inspections/${currentInspectionId}/submit`, {
        method: "POST"
      })
      
      if (!submitResponse.ok) {
        const error = await submitResponse.json()
        throw new Error(error.error || "Failed to submit inspection")
      }
      
      toast.success("Inspection submitted successfully! Processing classification and scope determination...")
      
      if (onComplete && currentInspectionId) {
        onComplete(currentInspectionId)
      }
    } catch (error: any) {
      console.error("Error submitting inspection:", error)
      toast.error(error.message || "Failed to submit inspection")
    } finally {
      setSaving(false)
    }
  }
  
  // Calculate dew point (simplified)
  useEffect(() => {
    const temp = environmentalData.ambientTemperature
    const humidity = environmentalData.humidityLevel
    // Simplified dew point calculation (Magnus formula approximation)
    const dewPoint = temp - ((100 - humidity) / 5)
    setEnvironmentalData(prev => ({ ...prev, dewPoint: Math.round(dewPoint * 10) / 10 }))
  }, [environmentalData.ambientTemperature, environmentalData.humidityLevel])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }
  
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2 text-white">NIR Technician Input Form</h2>
        <p className="text-slate-400">
          Measure and observe only. The system will automatically interpret and classify.
        </p>
      </div>
      
      {/* Property Information */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <MapPin className="w-5 h-5" />
          Property Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Property Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
              placeholder="Full property address"
            />
            {validationErrors.propertyAddress && (
              <p className="text-red-400 text-xs mt-1">{validationErrors.propertyAddress}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Postcode <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={4}
              value={propertyPostcode}
              onChange={(e) => setPropertyPostcode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
              placeholder="0000"
            />
            {validationErrors.propertyPostcode && (
              <p className="text-red-400 text-xs mt-1">{validationErrors.propertyPostcode}</p>
            )}
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Technician Name
            </label>
            <input
              type="text"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
              placeholder="Your name"
            />
          </div>
        </div>
      </div>
      
      {/* Environmental Data */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <Thermometer className="w-5 h-5" />
          Environmental Data
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Ambient Temperature (°F)
            </label>
            <input
              type="number"
              min="-20"
              max="130"
              value={environmentalData.ambientTemperature}
              onChange={(e) => setEnvironmentalData(prev => ({
                ...prev,
                ambientTemperature: parseFloat(e.target.value) || 0
              }))}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
            />
            {validationErrors.temperature && (
              <p className="text-red-400 text-xs mt-1">{validationErrors.temperature}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Humidity Level (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={environmentalData.humidityLevel}
              onChange={(e) => setEnvironmentalData(prev => ({
                ...prev,
                humidityLevel: parseFloat(e.target.value) || 0
              }))}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
            />
            {validationErrors.humidity && (
              <p className="text-red-400 text-xs mt-1">{validationErrors.humidity}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">
              Dew Point (°F)
            </label>
            <input
              type="number"
              value={environmentalData.dewPoint.toFixed(1)}
              disabled
              className="w-full px-4 py-2 bg-slate-700/30 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Auto-calculated</p>
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={environmentalData.airCirculation}
                onChange={(e) => setEnvironmentalData(prev => ({
                  ...prev,
                  airCirculation: e.target.checked
                }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              Air Circulation
            </label>
          </div>
        </div>
      </div>
      
      {/* Moisture Readings */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <Droplets className="w-5 h-5" />
          Moisture Readings <span className="text-red-400">*</span>
        </h3>
        
        {validationErrors.moistureReadings && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{validationErrors.moistureReadings}</p>
          </div>
        )}
        
        {/* Add New Moisture Reading */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 bg-slate-900/50 rounded-lg">
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Location</label>
            <input
              type="text"
              value={newMoistureReading.location}
              onChange={(e) => setNewMoistureReading(prev => ({ ...prev, location: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              placeholder="Room/Zone"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Surface Type</label>
            <select
              value={newMoistureReading.surfaceType}
              onChange={(e) => setNewMoistureReading(prev => ({ ...prev, surfaceType: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            >
              {SURFACE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Moisture (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={newMoistureReading.moistureLevel}
              onChange={(e) => setNewMoistureReading(prev => ({ ...prev, moistureLevel: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Depth</label>
            <select
              value={newMoistureReading.depth}
              onChange={(e) => setNewMoistureReading(prev => ({ ...prev, depth: e.target.value as "Surface" | "Subsurface" }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            >
              <option value="Surface">Surface</option>
              <option value="Subsurface">Subsurface</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddMoistureReading}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
              <span className="font-medium">Add Reading</span>
            </button>
          </div>
        </div>
        
        {/* Existing Moisture Readings */}
        {moistureReadings.length > 0 && (
          <div className="space-y-2">
            {moistureReadings.map((reading) => (
              <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-white">{reading.location}</span>
                  <span className="text-slate-400">{reading.surfaceType}</span>
                  <span className="text-cyan-400 font-semibold">{reading.moistureLevel}%</span>
                  <span className="text-slate-400">{reading.depth}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMoistureReading(reading.id)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group"
                  title="Remove reading"
                >
                  <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Affected Areas */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <MapPin className="w-5 h-5" />
          Affected Areas <span className="text-red-400">*</span>
        </h3>
        
        {validationErrors.affectedAreas && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{validationErrors.affectedAreas}</p>
          </div>
        )}
        
        {/* Add New Affected Area */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 bg-slate-900/50 rounded-lg">
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Room/Zone ID</label>
            <input
              type="text"
              value={newAffectedArea.roomZoneId}
              onChange={(e) => setNewAffectedArea(prev => ({ ...prev, roomZoneId: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              placeholder="e.g., Master Bedroom"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Square Footage</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={newAffectedArea.affectedSquareFootage}
              onChange={(e) => setNewAffectedArea(prev => ({ ...prev, affectedSquareFootage: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Water Source</label>
            <select
              value={newAffectedArea.waterSource}
              onChange={(e) => setNewAffectedArea(prev => ({ ...prev, waterSource: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            >
              {WATER_SOURCES.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-400">Time Since Loss (hrs)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={newAffectedArea.timeSinceLoss}
              onChange={(e) => setNewAffectedArea(prev => ({ ...prev, timeSinceLoss: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
            />
          </div>
          
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddAffectedArea}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
              <span className="font-medium">Add Area</span>
            </button>
          </div>
        </div>
        
        {/* Existing Affected Areas */}
        {affectedAreas.length > 0 && (
          <div className="space-y-2">
            {affectedAreas.map((area) => (
              <div key={area.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-white">{area.roomZoneId}</span>
                  <span className="text-slate-400">{area.affectedSquareFootage} sq ft</span>
                  <span className="text-cyan-400">{area.waterSource}</span>
                  <span className="text-slate-400">{area.timeSinceLoss} hrs</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAffectedArea(area.id)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group"
                  title="Remove area"
                >
                  <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Scope Items (Checklist) */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <ClipboardCheck className="w-5 h-5 text-cyan-400" />
          Scope Items
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Select all applicable scope items. The system will automatically determine required items based on classification.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SCOPE_ITEM_TYPES.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
              <input
                type="checkbox"
                checked={selectedScopeItems.has(item.id)}
                onChange={() => handleScopeItemToggle(item.id)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <label className="text-sm text-white flex-1">{item.label}</label>
              {item.id === "demolish_drywall" && selectedScopeItems.has(item.id) && (
                <input
                  type="text"
                  placeholder="Height (e.g., 2ft)"
                  value={scopeItemSpecs[item.id] || ""}
                  onChange={(e) => setScopeItemSpecs(prev => ({ ...prev, [item.id]: e.target.value }))}
                  className="w-24 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Photos */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <Camera className="w-5 h-5" />
          Photos <span className="text-red-400">*</span>
        </h3>
        
        {validationErrors.photos && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{validationErrors.photos}</p>
          </div>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={index} className="relative">
              <img
                src={URL.createObjectURL(photo)}
                alt={`Photo ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg border-2 border-slate-600"
              />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 hover:scale-110 active:scale-95 transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-red-500/30 group"
                title="Remove photo"
              >
                <X className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
              </button>
            </div>
          ))}
          
          <label className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-cyan-500 hover:bg-slate-800/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group bg-slate-900/50">
            <div className="text-center">
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 mx-auto mb-2 transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1" />
              <span className="text-xs text-slate-400 group-hover:text-cyan-400 transition-colors duration-200 font-medium">Add Photo</span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-2">Upload photos of each affected area. Timestamps are automatically added.</p>
      </div>
      
      {/* Submit Button */}
      <div className="flex justify-end gap-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 text-white hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-white group"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
              <span>Submit for Processing</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

