"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Thermometer, 
  Wind, 
  Droplets, 
  Clock, 
  Calculator,
  BarChart3,
  Settings,
  CheckCircle,
  AlertTriangle,
  Info
} from "lucide-react"

interface DryingPlanTemplatesProps {
  waterClass: string
  affectedArea: number
  waterCategory: string
  onPlanUpdate: (plan: any) => void
  initialData?: any
}

export default function DryingPlanTemplates({ 
  waterClass, 
  affectedArea, 
  waterCategory,
  onPlanUpdate,
  initialData 
}: DryingPlanTemplatesProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("standard")
  const [dryingPlan, setDryingPlan] = useState({
    systemType: "closed",
    dehumidificationCapacity: 0,
    airmoversCount: 0,
    targetHumidity: 40,
    targetTemperature: 24,
    estimatedDryingTime: 72,
    equipmentPlacement: "",
    monitoringSchedule: "",
    psychrometricTargets: "",
    specialConsiderations: ""
  })

  // Update component when initialData changes
  useEffect(() => {
    if (initialData) {
      setDryingPlan(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const dryingTemplates = [
    {
      id: "standard",
      name: "Standard Drying",
      description: "Standard closed system with dehumidification",
      systemType: "closed",
      icon: Settings
    },
    {
      id: "open",
      name: "Open System",
      description: "Ventilation with outdoor air exchange",
      systemType: "open",
      icon: Wind
    },
    {
      id: "combination",
      name: "Combination System",
      description: "Mixed ventilation and dehumidification",
      systemType: "combination",
      icon: BarChart3
    },
    {
      id: "specialty",
      name: "Specialty Drying",
      description: "Class 4 specialty drying procedures",
      systemType: "specialty",
      icon: AlertTriangle
    }
  ]

  const calculateEquipmentNeeds = () => {
    if (!affectedArea || !waterClass) return { airmovers: 0, dehumidification: 0 }

    const area = parseFloat(affectedArea.toString())
    let airmovers = 0
    let dehumidification = 0

    // IICRC S500 Equipment Sizing Guidelines
    switch (waterClass) {
      case "Class 1":
        airmovers = Math.ceil(area / 60) // 1 per 50-70 sq ft
        dehumidification = Math.ceil(area / 100) * 20 // 20L per 100 sq ft
        break
      case "Class 2":
        airmovers = Math.ceil(area / 50) // 1 per 50 sq ft
        dehumidification = Math.ceil(area / 80) * 30 // 30L per 80 sq ft
        break
      case "Class 3":
        airmovers = Math.ceil(area / 40) // 1 per 40 sq ft
        dehumidification = Math.ceil(area / 60) * 40 // 40L per 60 sq ft
        break
      case "Class 4":
        airmovers = Math.ceil(area / 30) // 1 per 30 sq ft
        dehumidification = Math.ceil(area / 40) * 50 // 50L per 40 sq ft
        break
      default:
        airmovers = Math.ceil(area / 50)
        dehumidification = Math.ceil(area / 80) * 25
    }

    return { airmovers, dehumidification }
  }

  const calculateDryingTime = () => {
    if (!waterClass || !affectedArea) return 72

    const baseTime = {
      "Class 1": 24,
      "Class 2": 48,
      "Class 3": 72,
      "Class 4": 120
    }

    const area = parseFloat(affectedArea.toString())
    const multiplier = Math.ceil(area / 500) // Additional time for larger areas
    
    return (baseTime[waterClass as keyof typeof baseTime] || 72) + (multiplier * 24)
  }

  const getPsychrometricTargets = () => {
    const targets = {
      humidity: {
        "Class 1": 45,
        "Class 2": 40,
        "Class 3": 35,
        "Class 4": 30
      },
      temperature: {
        "Class 1": 22,
        "Class 2": 24,
        "Class 3": 26,
        "Class 4": 28
      }
    }

    return {
      humidity: targets.humidity[waterClass as keyof typeof targets.humidity] || 40,
      temperature: targets.temperature[waterClass as keyof typeof targets.temperature] || 24
    }
  }

  const getSystemRequirements = () => {
    const template = dryingTemplates.find(t => t.id === selectedTemplate)
    
    switch (template?.systemType) {
      case "open":
        return {
          description: "Uses outdoor air exchange to reduce humidity",
          requirements: [
            "Outdoor humidity significantly lower than indoor",
            "Adequate ventilation capacity",
            "Security considerations",
            "Weather monitoring"
          ],
          advantages: [
            "Lower energy consumption",
            "Faster initial humidity reduction",
            "No dehumidification equipment needed"
          ],
          disadvantages: [
            "Weather dependent",
            "Security concerns",
            "Potential for outdoor pollutants"
          ]
        }
      
      case "closed":
        return {
          description: "Isolated system with mechanical dehumidification",
          requirements: [
            "Complete building isolation",
            "Mechanical dehumidification",
            "Adequate power supply",
            "Equipment capacity calculations"
          ],
          advantages: [
            "Weather independent",
            "Maximum control",
            "Security maintained",
            "Consistent conditions"
          ],
          disadvantages: [
            "Higher energy consumption",
            "Equipment costs",
            "Power requirements"
          ]
        }
      
      case "combination":
        return {
          description: "Mixed approach using both ventilation and dehumidification",
          requirements: [
            "Initial ventilation phase",
            "Transition to closed system",
            "Dual equipment setup",
            "Monitoring and adjustment"
          ],
          advantages: [
            "Flexible approach",
            "Energy efficient start",
            "Weather adaptation",
            "Optimal drying conditions"
          ],
          disadvantages: [
            "Complex setup",
            "Equipment coordination",
            "Higher initial costs"
          ]
        }
      
      case "specialty":
        return {
          description: "Specialized drying for Class 4 situations",
          requirements: [
            "Professional expertise required",
            "Specialty equipment",
            "Extended monitoring",
            "Complex assembly access"
          ],
          advantages: [
            "Handles complex situations",
            "Professional results",
            "Comprehensive approach"
          ],
          disadvantages: [
            "High expertise required",
            "Expensive equipment",
            "Extended timeframes"
          ]
        }
      
      default:
        return {
          description: "Standard drying approach",
          requirements: [],
          advantages: [],
          disadvantages: []
        }
    }
  }

  const getEquipmentPlacement = () => {
    const area = parseFloat(affectedArea.toString())
    const airmovers = calculateEquipmentNeeds().airmovers
    
    return {
      airmovers: [
        `Place 1 airmover per 50-70 sq ft of affected floor area`,
        `Position airmovers to create airflow across all wet surfaces`,
        `Ensure 600+ FPM airflow velocity during constant drying rate`,
        `Reduce to 150 FPM during falling drying rate stages`,
        `Total airmovers needed: ${airmovers} units`
      ],
      dehumidifiers: [
        `Position dehumidifiers for optimal air circulation`,
        `Ensure adequate spacing for air intake and exhaust`,
        `Monitor psychrometric conditions at equipment outlets`,
        `Adjust positioning based on moisture readings`
      ],
      monitoring: [
        `Place psychrometers at multiple locations`,
        `Monitor both affected and unaffected areas`,
        `Record readings at same locations daily`,
        `Adjust equipment based on psychrometric data`
      ]
    }
  }

  const getMonitoringSchedule = () => {
    const schedule = {
      initial: [
        "Set up equipment and begin monitoring",
        "Record baseline psychrometric conditions",
        "Document initial moisture readings",
        "Establish drying goals and targets"
      ],
      daily: [
        "Record psychrometric readings (temperature, humidity)",
        "Measure moisture content of materials",
        "Check equipment performance and positioning",
        "Adjust drying plan as needed"
      ],
      verification: [
        "Confirm drying goals achieved",
        "Document final moisture readings",
        "Verify psychrometric conditions stable",
        "Complete post-drying verification"
      ]
    }

    return schedule
  }

  useEffect(() => {
    const equipment = calculateEquipmentNeeds()
    const targets = getPsychrometricTargets()
    const dryingTime = calculateDryingTime()
    
    const newPlan = {
      ...dryingPlan,
      dehumidificationCapacity: equipment.dehumidification,
      airmoversCount: equipment.airmovers,
      targetHumidity: targets.humidity,
      targetTemperature: targets.temperature,
      estimatedDryingTime: dryingTime
    }
    
    setDryingPlan(newPlan)
    onPlanUpdate(newPlan)
  }, [waterClass, affectedArea, selectedTemplate])

  const handleInputChange = (field: string, value: any) => {
    const newPlan = { ...dryingPlan, [field]: value }
    setDryingPlan(newPlan)
    onPlanUpdate(newPlan)
  }

  const systemRequirements = getSystemRequirements()
  const equipmentPlacement = getEquipmentPlacement()
  const monitoringSchedule = getMonitoringSchedule()

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      <div>
        <h3 
          className="text-lg font-medium text-white mb-4"
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          Drying System Templates
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          {dryingTemplates.map((template) => (
            <motion.button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`p-4 rounded-lg border transition-all ${
                selectedTemplate === template.id
                  ? "border-cyan-500 bg-cyan-500/20"
                  : "border-slate-600 bg-slate-700/30 hover:border-slate-500"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <template.icon size={20} className="text-cyan-400" />
                <span className="font-medium text-white">{template.name}</span>
              </div>
              <p className="text-sm text-slate-400">{template.description}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* System Requirements */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4">{systemRequirements.description}</h4>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Requirements</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {systemRequirements.requirements.map((req, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                  {req}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Advantages</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {systemRequirements.advantages.map((adv, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                  {adv}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Considerations</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {systemRequirements.disadvantages.map((dis, index) => (
                <li key={index} className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                  {dis}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Equipment Calculations */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h4 className="font-medium text-white mb-4 flex items-center gap-2">
            <Calculator className="text-cyan-400" size={20} />
            Equipment Calculations
          </h4>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Airmovers Required:</span>
              <span className="text-2xl font-bold text-cyan-400">{dryingPlan.airmoversCount}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Dehumidification Capacity:</span>
              <span className="text-2xl font-bold text-cyan-400">{dryingPlan.dehumidificationCapacity}L/day</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Estimated Drying Time:</span>
              <span className="text-2xl font-bold text-orange-400">{dryingPlan.estimatedDryingTime}h</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h4 className="font-medium text-white mb-4 flex items-center gap-2">
            <Thermometer className="text-cyan-400" size={20} />
            Psychrometric Targets
          </h4>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Target Humidity:</span>
              <span className="text-2xl font-bold text-blue-400">{dryingPlan.targetHumidity}%</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Target Temperature:</span>
              <span className="text-2xl font-bold text-orange-400">{dryingPlan.targetTemperature}°C</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Water Class:</span>
              <span className="text-lg font-bold text-cyan-400">{waterClass}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment Placement */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Wind className="text-cyan-400" size={20} />
          Equipment Placement Guidelines
        </h4>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Airmovers</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {equipmentPlacement.airmovers.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-cyan-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Dehumidifiers</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {equipmentPlacement.dehumidifiers.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Monitoring</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {equipmentPlacement.monitoring.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Monitoring Schedule */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Clock className="text-cyan-400" size={20} />
          Monitoring Schedule
        </h4>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Initial Setup</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.initial.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-1" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Daily Monitoring</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.daily.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Clock size={14} className="text-blue-400 flex-shrink-0 mt-1" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Final Verification</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.verification.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-cyan-400 flex-shrink-0 mt-1" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Custom Plan Details */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Equipment Placement Details</label>
          <textarea
            value={dryingPlan.equipmentPlacement}
            onChange={(e) => handleInputChange("equipmentPlacement", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Specific equipment placement instructions, room layouts, airflow patterns"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Monitoring Schedule</label>
          <textarea
            value={dryingPlan.monitoringSchedule}
            onChange={(e) => handleInputChange("monitoringSchedule", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Detailed monitoring schedule, reading intervals, documentation requirements"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Special Considerations</label>
          <textarea
            value={dryingPlan.specialConsiderations}
            onChange={(e) => handleInputChange("specialConsiderations", e.target.value)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
            rows={3}
            placeholder="Special conditions, occupant concerns, building-specific requirements"
          />
        </div>
      </div>
    </div>
  )
}
