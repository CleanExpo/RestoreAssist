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
  FileImage,
  Map,
  Shield,
  Zap,
  Eye
} from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface NIRTechnicianInputFormProps {
  reportId?: string
  /** Pre-fill form from guided interview (e.g. interviewData from URL) */
  initialData?: Record<string, unknown>
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

// Common room types for room picker
const ROOM_TYPES = [
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Ensuite",
  "Kitchen",
  "Living Room",
  "Family Room",
  "Dining Room",
  "Laundry",
  "Hallway",
  "Garage",
  "Attic",
  "Basement",
  "Office",
  "Study",
  "Other"
]

// Material types for affected areas
const MATERIAL_TYPES = [
  "Drywall",
  "Carpet",
  "Wood",
  "Tile",
  "Concrete",
  "Vinyl",
  "Hardwood",
  "Particle Board",
  "Plaster",
  "Insulation",
  "Ceiling",
  "Baseboards",
  "Other"
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

// Equipment types for scope items
const EQUIPMENT_TYPES = [
  "Air Mover",
  "LGR Dehumidifier",
  "Desiccant Dehumidifier",
  "Refrigerant Dehumidifier",
  "Air Scrubber",
  "Thermal Imaging Camera",
  "Moisture Meter",
  "Other"
]

// Water Category options for classification UI
const WATER_CATEGORIES = [
  { value: "1", label: "Category 1 - Clean Water", description: "Sanitary source, no contamination risk" },
  { value: "2", label: "Category 2 - Gray Water", description: "Significant contamination, may cause discomfort or sickness" },
  { value: "3", label: "Category 3 - Black Water", description: "Grossly contaminated, pathogenic agents present" }
]

// Water Class options for classification UI
const WATER_CLASSES = [
  { value: "1", label: "Class 1 - Slow Rate of Evaporation", description: "Minimal water absorption, low evaporation load" },
  { value: "2", label: "Class 2 - Fast Rate of Evaporation", description: "Water absorption into materials, moderate evaporation load" },
  { value: "3", label: "Class 3 - Fastest Rate of Evaporation", description: "Water absorption from overhead, high evaporation load" },
  { value: "4", label: "Class 4 - Specialty Drying Situations", description: "Deep water absorption, specialty drying required" }
]

export default function NIRTechnicianInputForm({ 
  reportId, 
  initialData,
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
  
  // Moisture Mapping (Visual Floor Plan)
  const [moistureMapPoints, setMoistureMapPoints] = useState<Array<{
    id: string
    x: number
    y: number
    reading: {
      id: string
      location: string
      surfaceType: string
      moistureLevel: number
      depth: string
      notes: string | null
    }
  }>>([])
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState<string | null>(null)
  
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
    roomType: string
    customRoomName?: string
    length: number
    width: number
    height: number
    affectedSquareFootage: number
    materials: string[]
    waterSource: string
    timeSinceLoss: number
  }>>([])
  
  const [newAffectedArea, setNewAffectedArea] = useState({
    roomType: ROOM_TYPES[0],
    customRoomName: "",
    length: 0,
    width: 0,
    height: 2.7, // Default ceiling height
    affectedSquareFootage: 0,
    materials: [] as string[],
    waterSource: WATER_SOURCES[0],
    timeSinceLoss: 0
  })
  
  // Scope Items (checklist)
  const [selectedScopeItems, setSelectedScopeItems] = useState<Set<string>>(new Set())
  const [scopeItemSpecs, setScopeItemSpecs] = useState<Record<string, string>>({})
  
  // Manual Classification (optional override)
  const [manualClassification, setManualClassification] = useState<{
    category: string
    class: string
  } | null>(null)
  
  // Equipment Selection
  const [equipmentSelection, setEquipmentSelection] = useState<Array<{
    id: string
    type: string
    quantity: number
  }>>([])
  
  const [newEquipment, setNewEquipment] = useState({
    type: "Air Mover",
    quantity: 1
  })
  
  // Drying Duration
  const [dryingDuration, setDryingDuration] = useState(4) // days
  
  // Photos - Store uploaded photo URLs from Cloudinary
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; file: File | null; uploading?: boolean }>>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  
  // Property Address (required)
  const [propertyAddress, setPropertyAddress] = useState("")
  const [propertyPostcode, setPropertyPostcode] = useState("")
  const [technicianName, setTechnicianName] = useState("")
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  // Review/Summary step
  const [showReview, setShowReview] = useState(false)
  
  // Quick Fill feature
  const [showQuickFillModal, setShowQuickFillModal] = useState(false)
  const [quickFillCredits, setQuickFillCredits] = useState<number | null>(null)
  const [hasUnlimitedQuickFill, setHasUnlimitedQuickFill] = useState(false)
  const [loadingCredits, setLoadingCredits] = useState(false)
  
  // Quick Fill Use Cases for NIR
  const nirUseCases = [
    {
      id: "residential-burst-pipe",
      name: "Residential Burst Pipe",
      description: "Standard residential water damage from burst pipe affecting master bedroom and ensuite"
    },
    {
      id: "commercial-hvac-failure",
      name: "Commercial HVAC Failure",
      description: "Large-scale commercial office water damage from HVAC system failure"
    },
    {
      id: "mould-remediation",
      name: "Mould Remediation",
      description: "Residential property with extensive mould growth due to long-term moisture"
    },
    {
      id: "storm-damage",
      name: "Storm Damage - Roof Leak",
      description: "Residential property with water damage from severe storm causing roof penetration"
    },
    {
      id: "flood-damage",
      name: "Flood Damage - Category 3",
      description: "Severe flood damage from overflowing river affecting ground floor"
    }
  ]
  
  const populateQuickFillData = (useCaseId: string) => {
    let useCaseData: any = {}
    
    switch (useCaseId) {
      case "residential-burst-pipe":
        useCaseData = {
          propertyAddress: "123 Main Street, Suburb, NSW 2000",
          propertyPostcode: "2000",
          technicianName: "Mark O'Connor",
          environmentalData: {
            ambientTemperature: 22,
            humidityLevel: 65,
            dewPoint: 15.2,
            airCirculation: true
          },
          moistureReadings: [
            { id: Date.now().toString(), location: "Master Bedroom - Floor", surfaceType: "Carpet", moistureLevel: 45.5, depth: "Surface" },
            { id: (Date.now() + 1).toString(), location: "Master Bedroom - Wall", surfaceType: "Drywall", moistureLevel: 38.2, depth: "Subsurface" },
            { id: (Date.now() + 2).toString(), location: "Ensuite - Floor", surfaceType: "Tile", moistureLevel: 52.1, depth: "Surface" },
            { id: (Date.now() + 3).toString(), location: "Ensuite - Wall", surfaceType: "Drywall", moistureLevel: 41.8, depth: "Subsurface" }
          ],
          affectedAreas: [
            {
              id: Date.now().toString(),
              roomZoneId: "Master Bedroom",
              roomType: "Master Bedroom",
              length: 5.5,
              width: 4.0,
              height: 2.7,
              affectedSquareFootage: 22.0,
              materials: ["Carpet", "Drywall"],
              waterSource: "Clean Water",
              timeSinceLoss: 24
            },
            {
              id: (Date.now() + 1).toString(),
              roomZoneId: "Ensuite",
              roomType: "Ensuite",
              length: 3.0,
              width: 2.5,
              height: 2.4,
              affectedSquareFootage: 7.5,
              materials: ["Tile", "Drywall"],
              waterSource: "Clean Water",
              timeSinceLoss: 24
            }
          ],
          selectedScopeItems: new Set(["remove_carpet", "extract_standing_water", "install_dehumidification", "install_air_movers", "demolish_drywall", "apply_antimicrobial", "dry_out_structure"]),
          equipmentSelection: [
            { id: Date.now().toString(), type: "LGR Dehumidifier", quantity: 2 },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 4 }
          ],
          dryingDuration: 4
        }
        break
      case "commercial-hvac-failure":
        useCaseData = {
          propertyAddress: "456 Business Park Drive, Melbourne VIC 3000",
          propertyPostcode: "3000",
          technicianName: "David Chen",
          environmentalData: {
            ambientTemperature: 24,
            humidityLevel: 70,
            dewPoint: 18.1,
            airCirculation: false
          },
          moistureReadings: [
            { id: Date.now().toString(), location: "3rd Floor - Office Area - Ceiling", surfaceType: "Drywall", moistureLevel: 58.3, depth: "Subsurface" },
            { id: (Date.now() + 1).toString(), location: "3rd Floor - Server Room - Floor", surfaceType: "Concrete", moistureLevel: 42.1, depth: "Surface" },
            { id: (Date.now() + 2).toString(), location: "2nd Floor - Office Area - Wall", surfaceType: "Drywall", moistureLevel: 35.7, depth: "Subsurface" }
          ],
          affectedAreas: [
            {
              id: Date.now().toString(),
              roomZoneId: "3rd Floor - Office Area",
              roomType: "Other",
              customRoomName: "3rd Floor - Office Area",
              length: 15.0,
              width: 10.0,
              height: 3.0,
              affectedSquareFootage: 150.0,
              materials: ["Drywall", "Carpet"],
              waterSource: "Clean Water",
              timeSinceLoss: 12
            }
          ],
          selectedScopeItems: new Set(["extract_standing_water", "install_dehumidification", "install_air_movers", "demolish_drywall", "containment_setup", "ppe_required"]),
          equipmentSelection: [
            { id: Date.now().toString(), type: "LGR Dehumidifier", quantity: 3 },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 8 }
          ],
          dryingDuration: 7
        }
        break
      case "mould-remediation":
        useCaseData = {
          propertyAddress: "789 Oak Street, Brisbane QLD 4000",
          propertyPostcode: "4000",
          technicianName: "Emma Thompson",
          environmentalData: {
            ambientTemperature: 26,
            humidityLevel: 75,
            dewPoint: 21.2,
            airCirculation: false
          },
          moistureReadings: [
            { id: Date.now().toString(), location: "Bathroom - Wall Behind Shower", surfaceType: "Drywall", moistureLevel: 62.4, depth: "Subsurface" },
            { id: (Date.now() + 1).toString(), location: "Bathroom - Ceiling", surfaceType: "Plaster", moistureLevel: 55.8, depth: "Subsurface" },
            { id: (Date.now() + 2).toString(), location: "Laundry - Wall", surfaceType: "Drywall", moistureLevel: 48.2, depth: "Subsurface" }
          ],
          affectedAreas: [
            {
              id: Date.now().toString(),
              roomZoneId: "Bathroom",
              roomType: "Bathroom",
              length: 3.5,
              width: 2.5,
              height: 2.4,
              affectedSquareFootage: 8.75,
              materials: ["Drywall", "Plaster"],
              waterSource: "Grey Water",
              timeSinceLoss: 720
            }
          ],
          selectedScopeItems: new Set(["demolish_drywall", "apply_antimicrobial", "containment_setup", "ppe_required", "sanitize_materials"]),
          equipmentSelection: [
            { id: Date.now().toString(), type: "Desiccant Dehumidifier", quantity: 2 },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 6 }
          ],
          dryingDuration: 10
        }
        break
      default:
        useCaseData = {}
    }
    
    // Populate form with use case data
    if (useCaseData.propertyAddress) setPropertyAddress(useCaseData.propertyAddress)
    if (useCaseData.propertyPostcode) setPropertyPostcode(useCaseData.propertyPostcode)
    if (useCaseData.technicianName) setTechnicianName(useCaseData.technicianName)
    if (useCaseData.environmentalData) setEnvironmentalData(useCaseData.environmentalData)
    if (useCaseData.moistureReadings) setMoistureReadings(useCaseData.moistureReadings)
    if (useCaseData.affectedAreas) setAffectedAreas(useCaseData.affectedAreas)
    if (useCaseData.selectedScopeItems) setSelectedScopeItems(useCaseData.selectedScopeItems)
    if (useCaseData.equipmentSelection) setEquipmentSelection(useCaseData.equipmentSelection)
    if (useCaseData.dryingDuration) setDryingDuration(useCaseData.dryingDuration)
    
    setShowQuickFillModal(false)
    toast.success("Quick Fill data populated successfully!")
  }
  
  // Pre-fill form from guided interview (e.g. inspections/new?interviewData=...)
  useEffect(() => {
    if (!initialData || Object.keys(initialData).length === 0) return
    if (typeof initialData.propertyAddress === "string") setPropertyAddress(initialData.propertyAddress)
    if (typeof initialData.propertyPostcode === "string") setPropertyPostcode(initialData.propertyPostcode)
    if (typeof initialData.technicianName === "string") setTechnicianName(initialData.technicianName)
    if (typeof initialData.ambientTemperature === "number" || typeof initialData.ambientTemperature === "string") {
      const t = typeof initialData.ambientTemperature === "string" ? parseFloat(initialData.ambientTemperature) : initialData.ambientTemperature
      if (!Number.isNaN(t)) setEnvironmentalData((prev) => ({ ...prev, ambientTemperature: t }))
    }
    if (typeof initialData.humidityLevel === "number" || typeof initialData.humidityLevel === "string") {
      const h = typeof initialData.humidityLevel === "string" ? parseFloat(initialData.humidityLevel) : initialData.humidityLevel
      if (!Number.isNaN(h)) setEnvironmentalData((prev) => ({ ...prev, humidityLevel: h }))
    }
    if (typeof initialData.dewPoint === "number" || typeof initialData.dewPoint === "string") {
      const d = typeof initialData.dewPoint === "string" ? parseFloat(initialData.dewPoint) : initialData.dewPoint
      if (!Number.isNaN(d)) setEnvironmentalData((prev) => ({ ...prev, dewPoint: d }))
    }
    if (typeof initialData.airCirculation === "boolean") setEnvironmentalData((prev) => ({ ...prev, airCirculation: initialData.airCirculation }))
    if (typeof initialData.weatherConditions === "string") setEnvironmentalData((prev) => ({ ...prev, weatherConditions: initialData.weatherConditions }))
    if ((typeof initialData.waterCategory === "string" || typeof initialData.waterCategory === "number") && (typeof initialData.waterClass === "string" || typeof initialData.waterClass === "number")) {
      setManualClassification({
        category: String(initialData.waterCategory),
        class: String(initialData.waterClass),
      })
    }
  }, [initialData])

  // Initialize inspection if reportId provided
  useEffect(() => {
    if (reportId && !inspectionId) {
      initializeInspection()
    }
  }, [reportId])
  
  // Fetch Quick Fill credits on mount
  useEffect(() => {
    const fetchQuickFillCredits = async () => {
      try {
        const response = await fetch("/api/user/quick-fill-credits")
        if (response.ok) {
          const data = await response.json()
          setQuickFillCredits(data.creditsRemaining)
          setHasUnlimitedQuickFill(data.hasUnlimited || false)
        }
      } catch (error) {
        console.error("Error fetching quick fill credits:", error)
      }
    }
    fetchQuickFillCredits()
  }, [])
  
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
            
            // Load moisture map points if coordinates exist
            const pointsWithCoords = data.inspection.moistureReadings
              .filter((r: any) => r.mapX !== null && r.mapY !== null)
              .map((r: any) => ({
                id: r.id,
                x: r.mapX,
                y: r.mapY,
                reading: {
                  id: r.id,
                  location: r.location,
                  surfaceType: r.surfaceType,
                  moistureLevel: r.moistureLevel,
                  depth: r.depth,
                  notes: r.notes || null
                }
              }))
            setMoistureMapPoints(pointsWithCoords)
          }
          
          if (data.inspection.floorPlanImageUrl) {
            setFloorPlanImageUrl(data.inspection.floorPlanImageUrl)
          }
          
          // Load photos
          if (data.inspection.photos && Array.isArray(data.inspection.photos)) {
            const loadedPhotos = data.inspection.photos.map((photo: any) => ({
              id: photo.id,
              url: photo.url,
              file: null,
              uploading: false
            }))
            setPhotos(loadedPhotos)
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
    } else {
      // Validate each area has materials
      const areasWithoutMaterials = affectedAreas.filter(a => !a.materials || a.materials.length === 0)
      if (areasWithoutMaterials.length > 0) {
        errors.affectedAreas = "All affected areas must have at least one material selected"
      }
    }
    
    // Photos are optional during initial save, but will be validated before final submission
    // Validate that all photos are uploaded (not still uploading) if any photos exist
    const stillUploading = photos.some(p => p.uploading)
    if (stillUploading) {
      errors.photos = "Please wait for all photos to finish uploading"
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
  
  // Calculate area from dimensions
  const calculateArea = (length: number, width: number): number => {
    return length * width
  }

  // Handle material toggle
  const handleMaterialToggle = (material: string) => {
    const currentMaterials = newAffectedArea.materials
    if (currentMaterials.includes(material)) {
      setNewAffectedArea({
        ...newAffectedArea,
        materials: currentMaterials.filter(m => m !== material)
      })
    } else {
      setNewAffectedArea({
        ...newAffectedArea,
        materials: [...currentMaterials, material]
      })
    }
  }

  // Update area when dimensions change
  useEffect(() => {
    if (newAffectedArea.length > 0 && newAffectedArea.width > 0) {
      const calculatedArea = calculateArea(newAffectedArea.length, newAffectedArea.width)
      setNewAffectedArea(prev => ({
        ...prev,
        affectedSquareFootage: calculatedArea
      }))
    }
  }, [newAffectedArea.length, newAffectedArea.width])

  const handleAddAffectedArea = () => {
    const roomName = newAffectedArea.roomType === "Other" 
      ? newAffectedArea.customRoomName.trim()
      : newAffectedArea.roomType
    
    if (!roomName) {
      toast.error("Please select or enter a room name")
      return
    }
    
    if (newAffectedArea.length <= 0 || newAffectedArea.width <= 0) {
      toast.error("Please enter valid length and width dimensions")
      return
    }
    
    if (newAffectedArea.materials.length === 0) {
      toast.error("Please select at least one affected material")
      return
    }
    
    const calculatedArea = calculateArea(newAffectedArea.length, newAffectedArea.width)
    
    setAffectedAreas([
      ...affectedAreas,
      {
        id: Date.now().toString(),
        roomZoneId: roomName,
        roomType: newAffectedArea.roomType,
        customRoomName: newAffectedArea.roomType === "Other" ? newAffectedArea.customRoomName : undefined,
        length: newAffectedArea.length,
        width: newAffectedArea.width,
        height: newAffectedArea.height,
        affectedSquareFootage: calculatedArea,
        materials: [...newAffectedArea.materials],
        waterSource: newAffectedArea.waterSource,
        timeSinceLoss: newAffectedArea.timeSinceLoss
      }
    ])
    
    setNewAffectedArea({
      roomType: ROOM_TYPES[0],
      customRoomName: "",
      length: 0,
      width: 0,
      height: 2.7,
      affectedSquareFootage: 0,
      materials: [],
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
  
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Auto-create inspection if it doesn't exist
    let currentInspectionId = inspectionId
    if (!currentInspectionId) {
      if (!propertyAddress.trim() || !propertyPostcode.trim()) {
        toast.error("Please enter property address and postcode first")
        return
      }
      
      currentInspectionId = await ensureInspectionExists(true) // Show toast
      if (!currentInspectionId) {
        return
      }
    }
    
    setUploadingPhotos(true)
    
    try {
      const uploadPromises = files.map(async (file) => {
        const tempId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        
        // Add to photos list with uploading state
        setPhotos(prev => [...prev, { id: tempId, url: "", file, uploading: true }])
        
        try {
          const formData = new FormData()
          formData.append("file", file)
          
          const response = await fetch(`/api/inspections/${currentInspectionId}/photos`, {
            method: "POST",
            body: formData
          })
          
          if (!response.ok) {
            throw new Error("Upload failed")
          }
          
          const data = await response.json()
          
          // Update photo with Cloudinary URL
          setPhotos(prev => prev.map(p => 
            p.id === tempId 
              ? { id: data.photo.id, url: data.photo.url, file: null, uploading: false }
              : p
          ))
          
          return data.photo
        } catch (error) {
          // Remove failed upload
          setPhotos(prev => prev.filter(p => p.id !== tempId))
          throw error
        }
      })
      
      await Promise.all(uploadPromises)
      toast.success(`${files.length} photo(s) uploaded successfully`)
    } catch (error) {
      console.error("Error uploading photos:", error)
      toast.error("Failed to upload some photos")
    } finally {
      setUploadingPhotos(false)
      // Reset file input
      if (e.target) {
        e.target.value = ""
      }
    }
  }
  
  const handleRemovePhoto = async (photoId: string, index: number) => {
    // Remove from local state
    setPhotos(photos.filter((_, i) => i !== index))
    toast.success("Photo removed")
    // Note: In production, you might want to delete from Cloudinary/DB via API
  }
  
  // Calculate expected classification preview
  const calculateClassificationPreview = () => {
    if (affectedAreas.length === 0 || moistureReadings.length === 0) {
      return null
    }
    
    // Get primary water source
    const primaryWaterSource = affectedAreas[0]?.waterSource || "Clean Water"
    const waterSourceLower = primaryWaterSource.toLowerCase()
    
    // Determine category
    let category = "1"
    if (waterSourceLower.includes("black") || waterSourceLower.includes("sewage") || waterSourceLower.includes("contaminated")) {
      category = "3"
    } else if (waterSourceLower.includes("grey") || waterSourceLower.includes("washing")) {
      category = "2"
    }
    
    // Calculate average moisture and affected area
    const avgMoisture = moistureReadings.reduce((sum, r) => sum + r.moistureLevel, 0) / moistureReadings.length
    const totalArea = affectedAreas.reduce((sum, a) => sum + a.affectedSquareFootage, 0) // Already in m²
    
    // Determine class based on area
    let classValue = "1"
    if (totalArea > 200) {
      classValue = "4"
    } else if (totalArea > 100) {
      classValue = "3"
    } else if (totalArea > 30) {
      classValue = "2"
    }
    
    return { category, class: classValue, avgMoisture, totalArea }
  }

  const handleReview = () => {
    // Additional validation for review - require photos
    const reviewErrors: Record<string, string> = {}
    
    if (photos.length === 0) {
      reviewErrors.photos = "At least one photo is required before submitting"
    }
    
    // Validate that all photos are uploaded (not still uploading)
    const stillUploading = photos.some(p => p.uploading)
    if (stillUploading) {
      reviewErrors.photos = "Please wait for all photos to finish uploading"
    }
    
    if (Object.keys(reviewErrors).length > 0) {
      setValidationErrors(reviewErrors)
      toast.error("Please fix validation errors before reviewing")
      return
    }
    
    if (!validateForm()) {
      toast.error("Please fix validation errors before reviewing")
      return
    }
    setShowReview(true)
  }
  
  // Auto-create inspection when property info is entered
  const ensureInspectionExists = async (showToast = false) => {
    if (inspectionId) {
      return inspectionId
    }
    
    if (!propertyAddress.trim() || !propertyPostcode.trim()) {
      return null
    }
    
    try {
      const response = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          propertyAddress,
          propertyPostcode,
          technicianName: technicianName || undefined
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setInspectionId(data.inspection.id)
        if (showToast) {
          toast.success("Inspection created. You can now upload photos and floor plan.")
        }
        return data.inspection.id
      } else {
        const error = await response.json()
        if (showToast) {
          toast.error(error.error || "Failed to create inspection")
        }
      }
    } catch (error) {
      console.error("Error creating inspection:", error)
      if (showToast) {
        toast.error("Failed to create inspection")
      }
    }
    
    return null
  }
  
  // Auto-create inspection when property info changes (silent, no toast)
  useEffect(() => {
    if (propertyAddress.trim() && propertyPostcode.trim() && !inspectionId && !loading) {
      const timer = setTimeout(() => {
        ensureInspectionExists(false) // Silent creation
      }, 1500) // Debounce: wait 1.5 seconds after user stops typing
      
      return () => clearTimeout(timer)
    }
  }, [propertyAddress, propertyPostcode, inspectionId, loading])

  const handleSubmit = async () => {
    // Validate photos are required for final submission
    if (photos.length === 0) {
      setValidationErrors({ photos: "At least one photo is required before submitting" })
      toast.error("Please upload at least one photo before submitting")
      return
    }
    
    const stillUploading = photos.some(p => p.uploading)
    if (stillUploading) {
      setValidationErrors({ photos: "Please wait for all photos to finish uploading" })
      toast.error("Please wait for all photos to finish uploading")
      return
    }
    
    if (!validateForm()) {
      toast.error("Please fix validation errors before submitting")
      return
    }
    
    setSaving(true)
    
    try {
      // Step 1: Ensure inspection exists (should already exist from auto-create)
      let currentInspectionId = inspectionId
      
      if (!currentInspectionId) {
        currentInspectionId = await ensureInspectionExists(true) // Show toast
        if (!currentInspectionId) {
          throw new Error("Failed to create inspection")
        }
      }
      
      // Step 2: Save environmental data
      await fetch(`/api/inspections/${currentInspectionId}/environmental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(environmentalData)
      })
      
      // Step 3: Save moisture readings with coordinates
      for (const reading of moistureReadings) {
        // Find corresponding point in map if exists
        const mapPoint = moistureMapPoints.find(p => p.id === reading.id)
        
        await fetch(`/api/inspections/${currentInspectionId}/moisture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: reading.location,
            surfaceType: reading.surfaceType,
            moistureLevel: reading.moistureLevel,
            depth: reading.depth,
            mapX: mapPoint?.x || null,
            mapY: mapPoint?.y || null
          })
        })
      }
      
      // Step 3.5: Save floor plan image URL if exists
      if (floorPlanImageUrl) {
        await fetch(`/api/inspections/${currentInspectionId}/floor-plan`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: floorPlanImageUrl
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
            timeSinceLoss: area.timeSinceLoss,
            length: area.length,
            width: area.width,
            height: area.height,
            materials: area.materials,
            description: `Dimensions: ${area.length}m × ${area.width}m × ${area.height}m. Materials: ${area.materials.join(", ")}`
          })
        })
      }
      
      // Step 5: Photos are already uploaded to Cloudinary via handlePhotoUpload
      // No need to upload again here - they're already saved in the database
      
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
  
  const classificationPreview = calculateClassificationPreview()

  // Review/Summary View
  if (showReview) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-2 text-white">Review & Submit Inspection</h2>
          <p className="text-slate-400">
            Review all entered data. The system will automatically classify and determine scope after submission.
          </p>
        </div>

        {/* Property Information Summary */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <MapPin className="w-5 h-5" />
            Property Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Address:</span>
              <p className="text-white font-medium">{propertyAddress}</p>
            </div>
            <div>
              <span className="text-slate-400">Postcode:</span>
              <p className="text-white font-medium">{propertyPostcode}</p>
            </div>
            {technicianName && (
              <div>
                <span className="text-slate-400">Technician:</span>
                <p className="text-white font-medium">{technicianName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Environmental Data Summary */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Thermometer className="w-5 h-5" />
            Environmental Data
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Temperature:</span>
              <p className="text-white font-medium">{environmentalData.ambientTemperature}°F</p>
            </div>
            <div>
              <span className="text-slate-400">Humidity:</span>
              <p className="text-white font-medium">{environmentalData.humidityLevel}%</p>
            </div>
            <div>
              <span className="text-slate-400">Dew Point:</span>
              <p className="text-white font-medium">{environmentalData.dewPoint.toFixed(1)}°F</p>
            </div>
            <div>
              <span className="text-slate-400">Air Circulation:</span>
              <p className="text-white font-medium">{environmentalData.airCirculation ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>

        {/* Moisture Readings Summary */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Droplets className="w-5 h-5" />
            Moisture Readings ({moistureReadings.length})
          </h3>
          <div className="space-y-2">
            {moistureReadings.map((reading) => (
              <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg text-sm">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-white">{reading.location}</span>
                  <span className="text-slate-400">{reading.surfaceType}</span>
                  <span className="text-cyan-400 font-semibold">{reading.moistureLevel}%</span>
                  <span className="text-slate-400">{reading.depth}</span>
                </div>
              </div>
            ))}
            {classificationPreview && (
              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p className="text-sm text-cyan-400">
                  <strong>Average Moisture:</strong> {classificationPreview.avgMoisture.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Affected Areas Summary */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <MapPin className="w-5 h-5" />
            Affected Areas ({affectedAreas.length})
          </h3>
          <div className="space-y-3">
            {affectedAreas.map((area) => (
              <div key={area.id} className="p-4 bg-slate-900/50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-white text-base">{area.roomZoneId}</span>
                      <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">
                        {area.affectedSquareFootage.toFixed(2)} m²
                      </span>
                      <span className="text-xs text-slate-400">
                        {area.length}m × {area.width}m × {area.height}m
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs text-slate-400">Materials:</span>
                      {area.materials.map((material, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                          {material}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Water Source: <span className="text-cyan-400">{area.waterSource}</span></span>
                      <span>Time Since Loss: {area.timeSinceLoss} hrs</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {classificationPreview && (
              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p className="text-sm text-cyan-400">
                  <strong>Total Affected Area:</strong> {classificationPreview.totalArea.toFixed(2)} m²
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Expected Classification Preview */}
        {classificationPreview && (
          <div className="p-6 rounded-lg border-2 border-cyan-500/50 bg-gradient-to-br from-cyan-500/10 to-blue-500/10">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Expected Auto-Classification Preview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400 text-sm">Water Category</span>
                <p className="text-2xl font-bold text-cyan-400 mt-1">
                  Category {classificationPreview.category}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {classificationPreview.category === "3" ? "Black Water (Contaminated)" :
                   classificationPreview.category === "2" ? "Grey Water (Significant Contamination)" :
                   "Clean Water (Sanitary Source)"}
                </p>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400 text-sm">Water Class</span>
                <p className="text-2xl font-bold text-cyan-400 mt-1">
                  Class {classificationPreview.class}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {classificationPreview.class === "4" ? "Bound Water / Deep Saturation" :
                   classificationPreview.class === "3" ? "Large Area Affected" :
                   classificationPreview.class === "2" ? "Medium Area Affected" :
                   "Least Water / Small Area"}
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-400">
                <strong>Note:</strong> This is a preview based on your entered data. The system will perform final classification after submission using IICRC S500 standards.
              </p>
            </div>
          </div>
        )}

        {/* Scope Items Summary */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <ClipboardCheck className="w-5 h-5 text-cyan-400" />
            Selected Scope Items ({selectedScopeItems.size})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from(selectedScopeItems).map((itemId) => {
              const item = SCOPE_ITEM_TYPES.find(i => i.id === itemId)
              return item ? (
                <div key={itemId} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg text-sm">
                  <CheckCircle className="w-4 h-4 text-cyan-400" />
                  <span className="text-white">{item.label}</span>
                </div>
              ) : null
            })}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Additional scope items will be automatically determined by the system based on the final classification.
          </p>
        </div>

        {/* Visual Moisture Mapping Summary */}
        {moistureReadings.length > 0 && moistureMapPoints.length > 0 && (
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
              <Map className="w-5 h-5 text-cyan-400" />
              Visual Moisture Mapping
            </h3>
            <MoistureMappingCanvas
              readings={moistureReadings.map(r => ({
                id: r.id,
                location: r.location,
                surfaceType: r.surfaceType,
                moistureLevel: r.moistureLevel,
                depth: r.depth,
                notes: null
              }))}
              initialPoints={moistureMapPoints}
              initialBackgroundImage={floorPlanImageUrl}
              readonly={true}
            />
          </div>
        )}
        
        {/* Photos Summary */}
        {photos.length > 0 && (
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
              <Camera className="w-5 h-5" />
              Photos ({photos.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div key={photo.id || index} className="relative">
                  {photo.uploading ? (
                    <div className="w-full h-32 rounded-lg border-2 border-slate-600 bg-slate-900/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                    </div>
                  ) : (
                    <img
                      src={photo.url || (photo.file ? URL.createObjectURL(photo.file) : "")}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border-2 border-slate-600"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-4 border-t border-slate-700">
          <button
            type="button"
            onClick={() => setShowReview(false)}
            className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 text-white hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md"
          >
            Back to Edit
          </button>
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
                <span>Submit for Auto-Classification</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2 text-white">NIR Technician Input Form</h2>
          <p className="text-slate-400">
            Measure and observe only. The system will automatically interpret and classify.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0)) {
              toast.error("No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.")
              return
            }
            
            if (!hasUnlimitedQuickFill) {
              setLoadingCredits(true)
              try {
                const response = await fetch("/api/user/quick-fill-credits", {
                  method: "POST"
                })
                
                if (response.ok) {
                  const data = await response.json()
                  setQuickFillCredits(data.creditsRemaining)
                  setShowQuickFillModal(true)
                } else {
                  const error = await response.json()
                  if (error.requiresUpgrade) {
                    toast.error("No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.")
                  } else {
                    toast.error(error.error || "Failed to use Quick Fill credit")
                  }
                }
              } catch (error) {
                toast.error("Failed to check Quick Fill credits")
              } finally {
                setLoadingCredits(false)
              }
            } else {
              setShowQuickFillModal(true)
            }
          }}
          disabled={loadingCredits || (!hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0))}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
            "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
            "text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed",
            "hover:scale-[1.02] active:scale-[0.98]"
          )}
        >
          {loadingCredits ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          <span>
            {hasUnlimitedQuickFill 
              ? "Quick Fill" 
              : quickFillCredits !== null && quickFillCredits > 0
              ? `Quick Fill (${quickFillCredits})`
              : "No Credits"}
          </span>
        </button>
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
      
      {/* Visual Moisture Mapping (Floor Plan Overlay) */}
      {moistureReadings.length > 0 && (
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Map className="w-5 h-5 text-cyan-400" />
            Visual Moisture Mapping (Floor Plan Overlay)
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Upload a floor plan image and place your moisture readings on the map to visualize the affected areas.
            {!inspectionId && (!propertyAddress.trim() || !propertyPostcode.trim()) && (
              <span className="block mt-2 text-amber-400 text-xs">
                ⚠️ Enter property address and postcode first. Inspection will be created automatically, then you can upload floor plan.
              </span>
            )}
            {inspectionId && (
              <span className="block mt-2 text-green-400 text-xs">
                ✓ Inspection ready. You can upload floor plan and photos.
              </span>
            )}
          </p>
          
          <MoistureMappingCanvas
            readings={moistureReadings.map(r => ({
              id: r.id,
              location: r.location,
              surfaceType: r.surfaceType,
              moistureLevel: r.moistureLevel,
              depth: r.depth,
              notes: null
            }))}
            initialPoints={moistureMapPoints}
            initialBackgroundImage={floorPlanImageUrl}
            onPointsChange={(points) => {
              setMoistureMapPoints(points)
            }}
            onBackgroundImageChange={(url) => {
              setFloorPlanImageUrl(url)
            }}
            onImageUpload={async (file) => {
              // Auto-create inspection if it doesn't exist
              let currentInspectionId = inspectionId
              if (!currentInspectionId) {
                if (!propertyAddress.trim() || !propertyPostcode.trim()) {
                  toast.error("Please enter property address and postcode first")
                  throw new Error("Property info required")
                }
                
                currentInspectionId = await ensureInspectionExists(true) // Show toast
                if (!currentInspectionId) {
                  throw new Error("No inspection ID")
                }
              }
              
              const formData = new FormData()
              formData.append("file", file)
              formData.append("type", "floor-plan")
              
              const response = await fetch(`/api/inspections/${currentInspectionId}/floor-plan`, {
                method: "POST",
                body: formData
              })
              
              if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to upload floor plan")
              }
              
              const data = await response.json()
              setFloorPlanImageUrl(data.imageUrl)
              return data.imageUrl
            }}
          />
        </div>
      )}
      
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
        <div className="space-y-4 mb-4 p-4 bg-slate-900/50 rounded-lg">
          {/* Room Picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Room Type <span className="text-red-400">*</span></label>
              <select
                value={newAffectedArea.roomType}
                onChange={(e) => setNewAffectedArea(prev => ({ ...prev, roomType: e.target.value, customRoomName: "" }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              >
                {ROOM_TYPES.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>
            
            {newAffectedArea.roomType === "Other" && (
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">Custom Room Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={newAffectedArea.customRoomName}
                  onChange={(e) => setNewAffectedArea(prev => ({ ...prev, customRoomName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
                  placeholder="Enter room name"
                />
              </div>
            )}
          </div>

          {/* Dimensions for Area Calculation */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Length (m) <span className="text-red-400">*</span></label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.length}
                onChange={(e) => setNewAffectedArea(prev => ({ ...prev, length: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
                placeholder="0.0"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Width (m) <span className="text-red-400">*</span></label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.width}
                onChange={(e) => setNewAffectedArea(prev => ({ ...prev, width: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
                placeholder="0.0"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Height (m)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.height}
                onChange={(e) => setNewAffectedArea(prev => ({ ...prev, height: parseFloat(e.target.value) || 2.7 }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
                placeholder="2.7"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Calculated Area (m²)</label>
              <input
                type="number"
                value={newAffectedArea.affectedSquareFootage.toFixed(2)}
                disabled
                className="w-full px-3 py-2 bg-slate-700/30 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Auto-calculated: Length × Width</p>
            </div>
          </div>

          {/* Materials Selection */}
          <div>
            <label className="block text-xs font-medium mb-2 text-slate-400">Affected Materials <span className="text-red-400">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MATERIAL_TYPES.map((material) => (
                <label
                  key={material}
                  className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={newAffectedArea.materials.includes(material)}
                    onChange={() => handleMaterialToggle(material)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-xs text-white">{material}</span>
                </label>
              ))}
            </div>
            {newAffectedArea.materials.length > 0 && (
              <p className="text-xs text-cyan-400 mt-2">
                Selected: {newAffectedArea.materials.join(", ")}
              </p>
            )}
          </div>

          {/* Water Source and Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
        
        {/* Existing Affected Areas */}
        {affectedAreas.length > 0 && (
          <div className="space-y-2">
            {affectedAreas.map((area) => (
              <div key={area.id} className="p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-white">{area.roomZoneId}</span>
                      <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">
                        {area.affectedSquareFootage.toFixed(2)} m²
                      </span>
                      <span className="text-xs text-slate-400">
                        {area.length}m × {area.width}m × {area.height}m
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-slate-400">Materials:</span>
                      {area.materials.map((material, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                          {material}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span>Source: {area.waterSource}</span>
                      <span>Time: {area.timeSinceLoss} hrs</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAffectedArea(area.id)}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group ml-4"
                    title="Remove area"
                  >
                    <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Classification UI (Manual Override) */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
          <Shield className="w-5 h-5 text-cyan-400" />
          IICRC Classification (Optional Manual Override)
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          The system will automatically classify based on your data. You can manually override the classification if needed.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Water Category Selector */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Water Category (IICRC S500)</label>
            <div className="space-y-2">
              {WATER_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-600 rounded-lg hover:bg-slate-900/70 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="waterCategory"
                    value={category.value}
                    checked={manualClassification?.category === category.value}
                    onChange={(e) => setManualClassification(prev => ({
                      ...prev,
                      category: e.target.value,
                      class: prev?.class || ""
                    }))}
                    className="mt-1 w-4 h-4 border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white text-sm">{category.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{category.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          
          {/* Water Class Selector */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Water Class (IICRC S500)</label>
            <div className="space-y-2">
              {WATER_CLASSES.map((waterClass) => (
                <label
                  key={waterClass.value}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-600 rounded-lg hover:bg-slate-900/70 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="waterClass"
                    value={waterClass.value}
                    checked={manualClassification?.class === waterClass.value}
                    onChange={(e) => setManualClassification(prev => ({
                      category: prev?.category || "",
                      class: e.target.value
                    }))}
                    className="mt-1 w-4 h-4 border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white text-sm">{waterClass.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{waterClass.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        
        {manualClassification && (
          <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <p className="text-sm text-cyan-400">
              <strong>Manual Override Active:</strong> Category {manualClassification.category}, Class {manualClassification.class}
            </p>
            <button
              type="button"
              onClick={() => setManualClassification(null)}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              Clear manual override (use auto-classification)
            </button>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
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

        {/* Equipment Selection */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-3 text-slate-300">Equipment Required</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 bg-slate-900/50 rounded-lg">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Equipment Type</label>
              <select
                value={newEquipment.type}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, type: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              >
                {EQUIPMENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-400">Quantity</label>
              <input
                type="number"
                min="1"
                value={newEquipment.quantity}
                onChange={(e) => setNewEquipment(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  if (newEquipment.quantity < 1) {
                    toast.error("Quantity must be at least 1")
                    return
                  }
                  setEquipmentSelection([
                    ...equipmentSelection,
                    {
                      id: Date.now().toString(),
                      ...newEquipment
                    }
                  ])
                  setNewEquipment({ type: EQUIPMENT_TYPES[0], quantity: 1 })
                  toast.success("Equipment added")
                }}
                className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add</span>
              </button>
            </div>
          </div>
          
          {equipmentSelection.length > 0 && (
            <div className="space-y-2">
              {equipmentSelection.map((eq) => (
                <div key={eq.id} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg text-sm">
                  <span className="text-white">
                    {eq.quantity}x {eq.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEquipmentSelection(equipmentSelection.filter(e => e.id !== eq.id))
                      toast.success("Equipment removed")
                    }}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drying Duration */}
        <div>
          <h4 className="text-sm font-semibold mb-3 text-slate-300">Drying Duration</h4>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1 text-slate-400">Estimated Drying Duration (Days)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={dryingDuration}
                onChange={(e) => setDryingDuration(parseInt(e.target.value) || 4)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-white text-sm"
              />
            </div>
            <div className="pt-6">
              <span className="text-sm text-slate-400">
                {dryingDuration === 1 ? "1 day" : `${dryingDuration} days`}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Estimated duration for complete drying based on affected area and classification
          </p>
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
            <div key={photo.id || index} className="relative">
              {photo.uploading ? (
                <div className="w-full h-32 rounded-lg border-2 border-slate-600 bg-slate-900/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                </div>
              ) : (
                <>
                  <img
                    src={photo.url || (photo.file ? URL.createObjectURL(photo.file) : "")}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg border-2 border-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id, index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 hover:scale-110 active:scale-95 transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-red-500/30 group"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
                  </button>
                </>
              )}
            </div>
          ))}
          
          <label className={cn(
            "w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 group bg-slate-900/50",
            uploadingPhotos 
              ? "border-slate-500 cursor-wait opacity-50" 
              : "border-slate-600 hover:border-cyan-500 hover:bg-slate-800/50 hover:scale-[1.02] active:scale-[0.98]"
          )}>
            <div className="text-center">
              {uploadingPhotos ? (
                <Loader2 className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 mx-auto mb-2 transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1" />
              )}
              <span className={cn(
                "text-xs transition-colors duration-200 font-medium",
                uploadingPhotos ? "text-slate-500" : "text-slate-400 group-hover:text-cyan-400"
              )}>
                {uploadingPhotos ? "Uploading..." : "Add Photo"}
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              disabled={uploadingPhotos || (!propertyAddress.trim() || !propertyPostcode.trim())}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {!inspectionId && (!propertyAddress.trim() || !propertyPostcode.trim())
            ? "Enter property address and postcode first. Inspection will be created automatically, then you can upload photos."
            : inspectionId
            ? "Upload photos of each affected area. Photos are automatically uploaded to Cloudinary and timestamps are added."
            : "Enter property address and postcode to enable photo uploads. Photos are automatically uploaded to Cloudinary."}
        </p>
      </div>
      
      {/* Action Buttons */}
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
          onClick={async () => {
            // Save draft (auto-create inspection and save data without requiring photos)
            try {
              setSaving(true)
              if (!propertyAddress.trim() || !propertyPostcode.trim()) {
                toast.error("Please enter property address and postcode first")
                setSaving(false)
                return
              }
              
              let currentInspectionId = inspectionId || await ensureInspectionExists(true) // Show toast
              
              if (!currentInspectionId) {
                toast.error("Failed to create inspection. Please try again.")
                setSaving(false)
                return
              }
              
              if (currentInspectionId) {
                // Save environmental data
                await fetch(`/api/inspections/${currentInspectionId}/environmental`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(environmentalData)
                })
                
                // Save moisture readings
                for (const reading of moistureReadings) {
                  const mapPoint = moistureMapPoints.find(p => p.id === reading.id)
                  await fetch(`/api/inspections/${currentInspectionId}/moisture`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      location: reading.location,
                      surfaceType: reading.surfaceType,
                      moistureLevel: reading.moistureLevel,
                      depth: reading.depth,
                      mapX: mapPoint?.x || null,
                      mapY: mapPoint?.y || null
                    })
                  })
                }
                
                // Save affected areas
                for (const area of affectedAreas) {
                  await fetch(`/api/inspections/${currentInspectionId}/affected-areas`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      roomZoneId: area.roomZoneId,
                      affectedSquareFootage: area.affectedSquareFootage,
                      waterSource: area.waterSource,
                      timeSinceLoss: area.timeSinceLoss,
                      length: area.length,
                      width: area.width,
                      height: area.height,
                      materials: area.materials,
                      description: `Dimensions: ${area.length}m × ${area.width}m × ${area.height}m. Materials: ${area.materials.join(", ")}`
                    })
                  })
                }
                
                toast.success("Draft saved successfully! You can now upload photos and floor plan.")
              } else {
                toast.error("Failed to save draft")
              }
            } catch (error: any) {
              console.error("Error saving draft:", error)
              toast.error(error.message || "Failed to save draft")
            } finally {
              setSaving(false)
            }
          }}
          disabled={saving || !propertyAddress.trim() || !propertyPostcode.trim()}
          className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 text-white hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={handleReview}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-white group"
        >
          <ClipboardCheck className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
          <span>Review & Submit</span>
          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </div>
      
      {/* Quick Fill Modal */}
      <Dialog open={showQuickFillModal} onOpenChange={setShowQuickFillModal}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-white flex items-center gap-2">
              <Zap className="w-6 h-6 text-purple-400" />
              Quick Fill Test Data
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose a use case to populate the form with sample NIR inspection data for testing
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
            {nirUseCases.map((useCase) => (
              <button
                key={useCase.id}
                type="button"
                onClick={() => populateQuickFillData(useCase.id)}
                className="w-full p-4 rounded-lg border-2 border-slate-700 bg-slate-800 hover:border-purple-500 hover:bg-slate-800/80 transition-all text-left group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-white group-hover:text-purple-300 transition-colors">
                      {useCase.name}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {useCase.description}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-purple-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

