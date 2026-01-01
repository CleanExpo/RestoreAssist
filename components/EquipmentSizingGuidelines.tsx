"use client"

import { motion } from "framer-motion"
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Droplets,
  Settings,
  Thermometer,
  Wind,
  Zap
} from "lucide-react"
import { useEffect, useState } from "react"

interface EquipmentSizingGuidelinesProps {
  waterClass: string
  affectedArea: number
  waterCategory: string
  onSizingUpdate: (sizing: any) => void
  initialData?: any
}

export default function EquipmentSizingGuidelines({ 
  waterClass, 
  affectedArea, 
  waterCategory,
  onSizingUpdate,
  initialData 
}: EquipmentSizingGuidelinesProps) {
  const [sizingData, setSizingData] = useState({
    airmovers: {
      count: 0,
      type: "standard",
      placement: "",
      airflow: 0
    },
    dehumidifiers: {
      count: 0,
      capacity: 0,
      type: "refrigerant",
      placement: ""
    },
    monitoring: {
      psychrometers: 0,
      moistureMeters: 0,
      placement: ""
    },
    specialEquipment: {
      hepaVacuums: 0,
      airScrubbers: 0,
      negativePressure: false
    }
  })

  // Update component when initialData changes
  useEffect(() => {
    if (initialData) {
      setSizingData(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const airmoverTypes = [
    {
      id: "standard",
      name: "Standard Airmovers",
      description: "General purpose air circulation",
      cfm: 2000,
      coverage: 50
    },
    {
      id: "high_velocity",
      name: "High Velocity Airmovers",
      description: "Enhanced airflow for difficult areas",
      cfm: 3000,
      coverage: 40
    },
    {
      id: "low_profile",
      name: "Low Profile Airmovers",
      description: "For confined spaces and under furniture",
      cfm: 1500,
      coverage: 30
    }
  ]

  const dehumidifierTypes = [
    {
      id: "refrigerant",
      name: "Refrigerant Dehumidifiers",
      description: "Standard dehumidification for most applications",
      efficiency: "High",
      capacity: "20-150L/day"
    },
    {
      id: "desiccant",
      name: "Desiccant Dehumidifiers",
      description: "Low temperature and humidity applications",
      efficiency: "Very High",
      capacity: "50-300L/day"
    },
    {
      id: "lgr",
      name: "Low Grain Refrigerant (LGR)",
      description: "Enhanced refrigerant for difficult conditions",
      efficiency: "Very High",
      capacity: "30-200L/day"
    }
  ]

  const calculateAirmoverRequirements = () => {
    if (!affectedArea || !waterClass) return { count: 0, totalCFM: 0 }

    const area = parseFloat(affectedArea.toString())
    let count = 0
    let totalCFM = 0

    // IICRC S500 Airmover Sizing Guidelines
    switch (waterClass) {
      case "Class 1":
        count = Math.ceil(area / 60) // 1 per 50-70 sq ft
        totalCFM = count * 2000 // Standard 2000 CFM per unit
        break
      case "Class 2":
        count = Math.ceil(area / 50) // 1 per 50 sq ft
        totalCFM = count * 2000
        break
      case "Class 3":
        count = Math.ceil(area / 40) // 1 per 40 sq ft
        totalCFM = count * 2000
        break
      case "Class 4":
        count = Math.ceil(area / 30) // 1 per 30 sq ft
        totalCFM = count * 2000
        break
      default:
        count = Math.ceil(area / 50)
        totalCFM = count * 2000
    }

    return { count, totalCFM }
  }

  const calculateDehumidificationRequirements = () => {
    if (!affectedArea || !waterClass) return { capacity: 0, count: 0 }

    const area = parseFloat(affectedArea.toString())
    let capacity = 0
    let count = 0

    // IICRC S500 Dehumidification Sizing Guidelines
    switch (waterClass) {
      case "Class 1":
        capacity = Math.ceil(area / 100) * 20 // 20L per 100 sq ft
        count = Math.ceil(capacity / 50) // 50L units
        break
      case "Class 2":
        capacity = Math.ceil(area / 80) * 30 // 30L per 80 sq ft
        count = Math.ceil(capacity / 50)
        break
      case "Class 3":
        capacity = Math.ceil(area / 60) * 40 // 40L per 60 sq ft
        count = Math.ceil(capacity / 50)
        break
      case "Class 4":
        capacity = Math.ceil(area / 40) * 50 // 50L per 40 sq ft
        count = Math.ceil(capacity / 50)
        break
      default:
        capacity = Math.ceil(area / 80) * 25
        count = Math.ceil(capacity / 50)
    }

    return { capacity, count }
  }

  const getPlacementGuidelines = () => {
    const area = parseFloat(affectedArea.toString())
    const airmovers = calculateAirmoverRequirements()
    
    return {
      airmovers: [
        "Position airmovers to create airflow across all wet surfaces",
        "Maintain 600+ FPM airflow velocity during constant drying rate",
        "Reduce to 150 FPM during falling drying rate stages",
        "Ensure continuous airflow across affected materials",
        "Avoid directing airflow at walls or creating dead spots"
      ],
      dehumidifiers: [
        "Place dehumidifiers for optimal air circulation",
        "Ensure adequate spacing for air intake and exhaust",
        "Position away from direct sunlight and heat sources",
        "Monitor psychrometric conditions at equipment outlets",
        "Adjust positioning based on humidity readings"
      ],
      monitoring: [
        "Place psychrometers at multiple strategic locations",
        "Monitor both affected and unaffected areas for comparison",
        "Record readings at same locations throughout project",
        "Position monitoring equipment away from direct airflow",
        "Document baseline conditions before equipment startup"
      ]
    }
  }

  const getSpecialEquipmentRequirements = () => {
    const requirements = {
      hepaVacuums: 0,
      airScrubbers: 0,
      negativePressure: false,
      containment: false
    }

    if (waterCategory === "Category 2" || waterCategory === "Category 3") {
      requirements.hepaVacuums = Math.ceil(affectedArea / 200) // 1 per 200 sq ft
      requirements.airScrubbers = Math.ceil(affectedArea / 500) // 1 per 500 sq ft
      requirements.negativePressure = true
      requirements.containment = true
    }

    if (waterCategory === "Category 3") {
      requirements.hepaVacuums = Math.ceil(affectedArea / 100) // More intensive
      requirements.airScrubbers = Math.ceil(affectedArea / 300)
    }

    return requirements
  }

  const getAirflowRequirements = () => {
    const area = parseFloat(affectedArea.toString())
    const airmovers = calculateAirmoverRequirements()
    
    return {
      constantRate: {
        velocity: "600+ FPM",
        description: "Initial drying phase with high evaporation rates",
        duration: "First 24-48 hours"
      },
      fallingRate: {
        velocity: "150 FPM",
        description: "Reduced airflow as surface moisture decreases",
        duration: "Remaining drying time"
      },
      totalCFM: airmovers.totalCFM,
      airChanges: Math.round(airmovers.totalCFM / (area * 8)) // Assuming 8ft ceiling
    }
  }

  const getPsychrometricTargets = () => {
    const targets = {
      "Class 1": { humidity: 45, temperature: 22 },
      "Class 2": { humidity: 40, temperature: 24 },
      "Class 3": { humidity: 35, temperature: 26 },
      "Class 4": { humidity: 30, temperature: 28 }
    }

    return targets[waterClass as keyof typeof targets] || { humidity: 40, temperature: 24 }
  }

  const getMonitoringRequirements = () => {
    const area = parseFloat(affectedArea.toString())
    
    return {
      psychrometers: Math.max(2, Math.ceil(area / 500)), // 1 per 500 sq ft, minimum 2
      moistureMeters: Math.max(1, Math.ceil(area / 1000)), // 1 per 1000 sq ft, minimum 1
      frequency: "Daily",
      locations: [
        "Affected areas",
        "Unaffected areas (control)",
        "Equipment outlets",
        "Outside conditions"
      ]
    }
  }

  useEffect(() => {
    const airmovers = calculateAirmoverRequirements()
    const dehumidifiers = calculateDehumidificationRequirements()
    const monitoring = getMonitoringRequirements()
    const special = getSpecialEquipmentRequirements()
    
    const newSizing = {
      airmovers: {
        ...sizingData.airmovers,
        count: airmovers.count,
        airflow: airmovers.totalCFM
      },
      dehumidifiers: {
        ...sizingData.dehumidifiers,
        count: dehumidifiers.count,
        capacity: dehumidifiers.capacity
      },
      monitoring: {
        ...sizingData.monitoring,
        psychrometers: monitoring.psychrometers,
        moistureMeters: monitoring.moistureMeters
      },
      specialEquipment: {
        ...sizingData.specialEquipment,
        hepaVacuums: special.hepaVacuums,
        airScrubbers: special.airScrubbers,
        negativePressure: special.negativePressure
      }
    }
    
    setSizingData(newSizing)
    onSizingUpdate(newSizing)
  }, [waterClass, affectedArea, waterCategory])

  const handleInputChange = (section: string, field: string, value: any) => {
    const newSizing = {
      ...sizingData,
      [section]: {
        ...sizingData[section as keyof typeof sizingData],
        [field]: value
      }
    }
    setSizingData(newSizing)
    onSizingUpdate(newSizing)
  }

  const placementGuidelines = getPlacementGuidelines()
  const airflowRequirements = getAirflowRequirements()
  const psychrometricTargets = getPsychrometricTargets()
  const monitoringRequirements = getMonitoringRequirements()

  return (
    <div className="space-y-6">
      {/* Equipment Summary */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Wind className="text-cyan-400" size={20} />
            <span className="font-medium text-white">Airmovers</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400">{sizingData.airmovers.count}</div>
          <div className="text-sm text-slate-400">{sizingData.airmovers.airflow} CFM</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="text-blue-400" size={20} />
            <span className="font-medium text-white">Dehumidifiers</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{sizingData.dehumidifiers.count}</div>
          <div className="text-sm text-slate-400">{sizingData.dehumidifiers.capacity}L/day</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="text-orange-400" size={20} />
            <span className="font-medium text-white">Psychrometers</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">{sizingData.monitoring.psychrometers}</div>
          <div className="text-sm text-slate-400">Monitoring</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-emerald-400" size={20} />
            <span className="font-medium text-white">Air Changes</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{airflowRequirements.airChanges}</div>
          <div className="text-sm text-slate-400">per hour</div>
        </motion.div>
      </div>

      {/* Airmover Configuration */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Wind className="text-cyan-400" size={20} />
          Airmover Configuration
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Airmover Type</label>
            <select
              value={sizingData.airmovers.type}
              onChange={(e) => handleInputChange("airmovers", "type", e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            >
              {airmoverTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} - {type.description}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Total Airflow</label>
            <div className="text-2xl font-bold text-cyan-400">
              {sizingData.airmovers.airflow.toLocaleString()} CFM
            </div>
            <div className="text-sm text-slate-400">
              {airflowRequirements.airChanges} air changes per hour
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h5 className="font-medium text-white mb-3">Airflow Requirements</h5>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-cyan-500/20 border border-cyan-500/30 rounded-lg p-4">
              <h6 className="font-medium text-cyan-400 mb-2">Constant Rate Phase</h6>
              <p className="text-sm text-cyan-300">
                <strong>{airflowRequirements.constantRate.velocity}</strong> - {airflowRequirements.constantRate.description}
              </p>
              <p className="text-xs text-slate-400 mt-1">{airflowRequirements.constantRate.duration}</p>
            </div>
            
            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
              <h6 className="font-medium text-blue-400 mb-2">Falling Rate Phase</h6>
              <p className="text-sm text-blue-300">
                <strong>{airflowRequirements.fallingRate.velocity}</strong> - {airflowRequirements.fallingRate.description}
              </p>
              <p className="text-xs text-slate-400 mt-1">{airflowRequirements.fallingRate.duration}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Dehumidifier Configuration */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Droplets className="text-blue-400" size={20} />
          Dehumidifier Configuration
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Dehumidifier Type</label>
            <select
              value={sizingData.dehumidifiers.type}
              onChange={(e) => handleInputChange("dehumidifiers", "type", e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            >
              {dehumidifierTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} - {type.description}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Total Capacity</label>
            <div className="text-2xl font-bold text-blue-400">
              {sizingData.dehumidifiers.capacity}L/day
            </div>
            <div className="text-sm text-slate-400">
              {sizingData.dehumidifiers.count} units required
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h5 className="font-medium text-white mb-3">Psychrometric Targets</h5>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Target Humidity:</span>
              <span className="text-xl font-bold text-blue-400">{psychrometricTargets.humidity}%</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Target Temperature:</span>
              <span className="text-xl font-bold text-orange-400">{psychrometricTargets.temperature}°C</span>
            </div>
          </div>
        </div>
      </div>

      {/* Special Equipment */}
      {(waterCategory === "Category 2" || waterCategory === "Category 3") && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h4 className="font-medium text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={20} />
            Special Equipment Requirements
          </h4>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h5 className="font-medium text-white mb-3">Contamination Control</h5>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">HEPA Vacuums:</span>
                  <span className="text-lg font-bold text-amber-400">{sizingData.specialEquipment.hepaVacuums}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Air Scrubbers:</span>
                  <span className="text-lg font-bold text-amber-400">{sizingData.specialEquipment.airScrubbers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Negative Pressure:</span>
                  <span className="text-lg font-bold text-amber-400">
                    {sizingData.specialEquipment.negativePressure ? "Required" : "Not Required"}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h5 className="font-medium text-white mb-3">Containment Requirements</h5>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  Containment barriers
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  Negative pressure setup
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  HEPA filtration
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  Air monitoring
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Placement Guidelines */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Settings className="text-cyan-400" size={20} />
          Equipment Placement Guidelines
        </h4>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Airmovers</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {placementGuidelines.airmovers.map((guideline, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-cyan-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {guideline}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Dehumidifiers</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {placementGuidelines.dehumidifiers.map((guideline, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {guideline}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Monitoring</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {placementGuidelines.monitoring.map((guideline, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {guideline}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Monitoring Requirements */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <BarChart3 className="text-emerald-400" size={20} />
          Monitoring Requirements
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Equipment Needs</h5>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Psychrometers:</span>
                <span className="text-lg font-bold text-emerald-400">{monitoringRequirements.psychrometers}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Moisture Meters:</span>
                <span className="text-lg font-bold text-emerald-400">{monitoringRequirements.moistureMeters}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Monitoring Frequency:</span>
                <span className="text-lg font-bold text-emerald-400">{monitoringRequirements.frequency}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Monitoring Locations</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringRequirements.locations.map((location, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  {location}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Custom Placement Details */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Airmover Placement Details</label>
          <textarea
            value={sizingData.airmovers.placement}
            onChange={(e) => handleInputChange("airmovers", "placement", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Specific airmover placement instructions, room layouts, airflow patterns"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Dehumidifier Placement Details</label>
          <textarea
            value={sizingData.dehumidifiers.placement}
            onChange={(e) => handleInputChange("dehumidifiers", "placement", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Specific dehumidifier placement instructions, spacing requirements, air circulation"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Monitoring Placement Details</label>
          <textarea
            value={sizingData.monitoring.placement}
            onChange={(e) => handleInputChange("monitoring", "placement", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Specific monitoring equipment placement, reading locations, documentation requirements"
          />
        </div>
      </div>
    </div>
  )
}
