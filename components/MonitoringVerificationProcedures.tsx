"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Thermometer, 
  Droplets, 
  BarChart3, 
  CheckCircle, 
  Clock,
  AlertTriangle,
  FileText,
  Activity,
  Settings,
  Zap,
  Home,
  Wind
} from "lucide-react"

interface MonitoringVerificationProceduresProps {
  waterClass: string
  waterCategory: string
  affectedArea: number
  onMonitoringUpdate: (monitoring: any) => void
  initialData?: any
}

export default function MonitoringVerificationProcedures({ 
  waterClass, 
  waterCategory, 
  affectedArea,
  onMonitoringUpdate,
  initialData 
}: MonitoringVerificationProceduresProps) {
  const [monitoringData, setMonitoringData] = useState({
    psychrometricReadings: [],
    moistureReadings: [],
    equipmentPerformance: [],
    dailyLogs: [],
    verificationResults: [],
    complianceStatus: "pending"
  })

  const [currentReading, setCurrentReading] = useState({
    location: "",
    temperature: "",
    humidity: "",
    timestamp: "",
    notes: ""
  })

  const [currentMoistureReading, setCurrentMoistureReading] = useState({
    material: "",
    location: "",
    moistureContent: "",
    targetLevel: "",
    timestamp: "",
    notes: ""
  })

  // Update component when initialData changes
  useEffect(() => {
    if (initialData) {
      setMonitoringData(prev => {
        const newData = { ...prev, ...initialData }
        // Ensure arrays are properly initialized
        if (!Array.isArray(newData.psychrometricReadings)) {
          newData.psychrometricReadings = []
        }
        if (!Array.isArray(newData.moistureReadings)) {
          newData.moistureReadings = []
        }
        if (!Array.isArray(newData.equipmentPerformance)) {
          newData.equipmentPerformance = []
        }
        if (!Array.isArray(newData.dailyLogs)) {
          newData.dailyLogs = []
        }
        if (!Array.isArray(newData.verificationResults)) {
          newData.verificationResults = []
        }
        return newData
      })
    }
  }, [initialData])

  const getMonitoringSchedule = () => {
    const schedule = {
      initial: {
        frequency: "Immediately upon setup",
        readings: [
          "Baseline psychrometric conditions",
          "Initial moisture content measurements",
          "Equipment performance verification",
          "Documentation of starting conditions"
        ]
      },
      daily: {
        frequency: "Every 24 hours",
        readings: [
          "Temperature and humidity readings",
          "Moisture content of materials",
          "Equipment performance checks",
          "Psychrometric condition monitoring"
        ]
      },
      verification: {
        frequency: "Upon completion",
        readings: [
          "Final moisture content verification",
          "Psychrometric condition confirmation",
          "Equipment performance documentation",
          "Compliance verification"
        ]
      }
    }

    return schedule
  }

  const getPsychrometricTargets = () => {
    const targets = {
      "Class 1": { humidity: 45, temperature: 22, tolerance: 5 },
      "Class 2": { humidity: 40, temperature: 24, tolerance: 3 },
      "Class 3": { humidity: 35, temperature: 26, tolerance: 2 },
      "Class 4": { humidity: 30, temperature: 28, tolerance: 2 }
    }

    return targets[waterClass as keyof typeof targets] || { humidity: 40, temperature: 24, tolerance: 3 }
  }

  const getMoistureTargets = () => {
    const targets = {
      "Class 1": { wood: 12, drywall: 1, carpet: 16 },
      "Class 2": { wood: 10, drywall: 0.8, carpet: 14 },
      "Class 3": { wood: 8, drywall: 0.6, carpet: 12 },
      "Class 4": { wood: 6, drywall: 0.4, carpet: 10 }
    }

    return targets[waterClass as keyof typeof targets] || { wood: 10, drywall: 0.8, carpet: 14 }
  }

  const getMonitoringLocations = () => {
    const area = parseFloat(affectedArea.toString())
    const locations = [
      "Affected areas (multiple points)",
      "Unaffected areas (control)",
      "Equipment outlets",
      "Outside conditions"
    ]

    if (area > 1000) {
      locations.push("Interstitial spaces")
      locations.push("HVAC system")
    }

    if (waterCategory === "Category 2" || waterCategory === "Category 3") {
      locations.push("Containment barriers")
      locations.push("Negative pressure zones")
    }

    return locations
  }

  const getEquipmentMonitoring = () => {
    return {
      airmovers: [
        "Airflow velocity measurements",
        "Equipment positioning verification",
        "Power consumption monitoring",
        "Performance efficiency checks"
      ],
      dehumidifiers: [
        "Water removal rate monitoring",
        "Psychrometric conditions at outlets",
        "Filter condition checks",
        "Energy consumption tracking"
      ],
      monitoring: [
        "Instrument calibration verification",
        "Reading accuracy confirmation",
        "Data logging functionality",
        "Battery and power status"
      ]
    }
  }

  const getVerificationCriteria = () => {
    const criteria = {
      moisture: [
        "All materials at or below target moisture content",
        "No visible moisture or condensation",
        "Stable moisture readings over 24 hours",
        "Materials returned to pre-loss condition"
      ],
      psychrometric: [
        "Target humidity achieved and maintained",
        "Temperature within acceptable range",
        "Stable conditions for 24+ hours",
        "No significant fluctuations"
      ],
      equipment: [
        "All equipment functioning properly",
        "Optimal performance achieved",
        "No equipment failures or issues",
        "Proper maintenance completed"
      ],
      compliance: [
        "IICRC S500 standards met",
        "All documentation complete",
        "Safety protocols followed",
        "Client approval obtained"
      ]
    }

    return criteria
  }

  const addPsychrometricReading = () => {
    if (!currentReading.location || !currentReading.temperature || !currentReading.humidity) {
      return
    }

    const newReading = {
      ...currentReading,
      id: Date.now(),
      timestamp: currentReading.timestamp || new Date().toISOString()
    }

    const newData = {
      ...monitoringData,
      psychrometricReadings: [...monitoringData.psychrometricReadings, newReading]
    }

    setMonitoringData(newData)
    onMonitoringUpdate(newData)
    setCurrentReading({
      location: "",
      temperature: "",
      humidity: "",
      timestamp: "",
      notes: ""
    })
  }

  const addMoistureReading = () => {
    if (!currentMoistureReading.material || !currentMoistureReading.moistureContent) {
      return
    }

    const newReading = {
      ...currentMoistureReading,
      id: Date.now(),
      timestamp: currentMoistureReading.timestamp || new Date().toISOString()
    }

    const newData = {
      ...monitoringData,
      moistureReadings: [...monitoringData.moistureReadings, newReading]
    }

    setMonitoringData(newData)
    onMonitoringUpdate(newData)
    setCurrentMoistureReading({
      material: "",
      location: "",
      moistureContent: "",
      targetLevel: "",
      timestamp: "",
      notes: ""
    })
  }

  const getComplianceStatus = () => {
    const targets = getPsychrometricTargets()
    const moistureTargets = getMoistureTargets()
    
    let complianceScore = 0
    let totalChecks = 0

    // Check psychrometric readings
    if (Array.isArray(monitoringData.psychrometricReadings) && monitoringData.psychrometricReadings.length > 0) {
      const latestReading = monitoringData.psychrometricReadings[monitoringData.psychrometricReadings.length - 1]
      const humidity = parseFloat(latestReading.humidity)
      const temperature = parseFloat(latestReading.temperature)
      
      if (Math.abs(humidity - targets.humidity) <= targets.tolerance) complianceScore++
      if (Math.abs(temperature - targets.temperature) <= targets.tolerance) complianceScore++
      totalChecks += 2
    }

    // Check moisture readings
    if (Array.isArray(monitoringData.moistureReadings) && monitoringData.moistureReadings.length > 0) {
      const latestMoisture = monitoringData.moistureReadings[monitoringData.moistureReadings.length - 1]
      const moistureContent = parseFloat(latestMoisture.moistureContent)
      const targetLevel = parseFloat(latestMoisture.targetLevel)
      
      if (moistureContent <= targetLevel) complianceScore++
      totalChecks++
    }

    const compliancePercentage = totalChecks > 0 ? (complianceScore / totalChecks) * 100 : 0
    
    if (compliancePercentage >= 90) return "compliant"
    if (compliancePercentage >= 70) return "partial"
    return "non-compliant"
  }

  const monitoringSchedule = getMonitoringSchedule()
  const psychrometricTargets = getPsychrometricTargets()
  const moistureTargets = getMoistureTargets()
  const monitoringLocations = getMonitoringLocations()
  const equipmentMonitoring = getEquipmentMonitoring()
  const verificationCriteria = getVerificationCriteria()
  const complianceStatus = getComplianceStatus()

  return (
    <div className="space-y-6">
      {/* Monitoring Overview */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="text-cyan-400" size={20} />
            <span className="font-medium text-white">Psychrometric</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400">{Array.isArray(monitoringData.psychrometricReadings) ? monitoringData.psychrometricReadings.length : 0}</div>
          <div className="text-sm text-slate-400">Readings Recorded</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="text-blue-400" size={20} />
            <span className="font-medium text-white">Moisture</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{Array.isArray(monitoringData.moistureReadings) ? monitoringData.moistureReadings.length : 0}</div>
          <div className="text-sm text-slate-400">Readings Recorded</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-emerald-400" size={20} />
            <span className="font-medium text-white">Compliance</span>
          </div>
          <div className={`text-2xl font-bold ${
            complianceStatus === "compliant" ? "text-emerald-400" :
            complianceStatus === "partial" ? "text-amber-400" : "text-red-400"
          }`}>
            {complianceStatus === "compliant" ? "✓" : complianceStatus === "partial" ? "⚠" : "✗"}
          </div>
          <div className="text-sm text-slate-400 capitalize">{complianceStatus}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-orange-400" size={20} />
            <span className="font-medium text-white">Targets</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">{psychrometricTargets.humidity}%</div>
          <div className="text-sm text-slate-400">Target Humidity</div>
        </motion.div>
      </div>

      {/* Psychrometric Monitoring */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Thermometer className="text-cyan-400" size={20} />
          Psychrometric Monitoring
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Target Conditions</h5>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <span className="text-slate-300">Target Humidity:</span>
                <span className="text-xl font-bold text-cyan-400">{psychrometricTargets.humidity}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <span className="text-slate-300">Target Temperature:</span>
                <span className="text-xl font-bold text-orange-400">{psychrometricTargets.temperature}°C</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <span className="text-slate-300">Tolerance:</span>
                <span className="text-xl font-bold text-blue-400">±{psychrometricTargets.tolerance}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Add New Reading</h5>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Location"
                value={currentReading.location}
                onChange={(e) => setCurrentReading({...currentReading, location: e.target.value})}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Temperature (°C)"
                  value={currentReading.temperature}
                  onChange={(e) => setCurrentReading({...currentReading, temperature: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="number"
                  placeholder="Humidity (%)"
                  value={currentReading.humidity}
                  onChange={(e) => setCurrentReading({...currentReading, humidity: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                onClick={addPsychrometricReading}
                className="w-full px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
              >
                Add Reading
              </button>
            </div>
          </div>
        </div>

        {/* Recent Readings */}
        {Array.isArray(monitoringData.psychrometricReadings) && monitoringData.psychrometricReadings.length > 0 && (
          <div className="mt-6">
            <h5 className="font-medium text-white mb-3">Recent Readings</h5>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {monitoringData.psychrometricReadings.slice(-5).reverse().map((reading, index) => (
                <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                  <div>
                    <span className="font-medium text-white">{reading.location}</span>
                    <span className="text-sm text-slate-400 ml-2">
                      {new Date(reading.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-cyan-400">{reading.temperature}°C</span>
                    <span className="text-blue-400">{reading.humidity}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Moisture Monitoring */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Droplets className="text-blue-400" size={20} />
          Moisture Content Monitoring
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Target Moisture Levels</h5>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Wood:</span>
                <span className="font-bold text-emerald-400">{moistureTargets.wood}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Drywall:</span>
                <span className="font-bold text-emerald-400">{moistureTargets.drywall}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Carpet:</span>
                <span className="font-bold text-emerald-400">{moistureTargets.carpet}%</span>
              </div>
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Add Moisture Reading</h5>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Material"
                  value={currentMoistureReading.material}
                  onChange={(e) => setCurrentMoistureReading({...currentMoistureReading, material: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  placeholder="Location"
                  value={currentMoistureReading.location}
                  onChange={(e) => setCurrentMoistureReading({...currentMoistureReading, location: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Moisture Content (%)"
                  value={currentMoistureReading.moistureContent}
                  onChange={(e) => setCurrentMoistureReading({...currentMoistureReading, moistureContent: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="number"
                  placeholder="Target Level (%)"
                  value={currentMoistureReading.targetLevel}
                  onChange={(e) => setCurrentMoistureReading({...currentMoistureReading, targetLevel: e.target.value})}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                onClick={addMoistureReading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Add Moisture Reading
              </button>
            </div>
          </div>
        </div>

        {/* Recent Moisture Readings */}
        {Array.isArray(monitoringData.moistureReadings) && monitoringData.moistureReadings.length > 0 && (
          <div className="mt-6">
            <h5 className="font-medium text-white mb-3">Recent Moisture Readings</h5>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {monitoringData.moistureReadings.slice(-5).reverse().map((reading, index) => (
                <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                  <div>
                    <span className="font-medium text-white">{reading.material}</span>
                    <span className="text-sm text-slate-400 ml-2">({reading.location})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-blue-400">{reading.moistureContent}%</span>
                    <span className="text-slate-400">/ {reading.targetLevel}%</span>
                    <span className={`text-xs ${
                      parseFloat(reading.moistureContent) <= parseFloat(reading.targetLevel) 
                        ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {parseFloat(reading.moistureContent) <= parseFloat(reading.targetLevel) ? "✓" : "✗"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monitoring Schedule */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Clock className="text-orange-400" size={20} />
          Monitoring Schedule
        </h4>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Initial Setup</h5>
            <p className="text-sm text-slate-400 mb-3">{monitoringSchedule.initial.frequency}</p>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.initial.readings.map((reading, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                  {reading}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Daily Monitoring</h5>
            <p className="text-sm text-slate-400 mb-3">{monitoringSchedule.daily.frequency}</p>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.daily.readings.map((reading, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Clock size={14} className="text-blue-400 flex-shrink-0" />
                  {reading}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Final Verification</h5>
            <p className="text-sm text-slate-400 mb-3">{monitoringSchedule.verification.frequency}</p>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringSchedule.verification.readings.map((reading, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />
                  {reading}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Verification Criteria */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <CheckCircle className="text-emerald-400" size={20} />
          Verification Criteria
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Moisture Verification</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {verificationCriteria.moisture.map((criterion, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Psychrometric Verification</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {verificationCriteria.psychrometric.map((criterion, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div>
            <h5 className="font-medium text-white mb-3">Equipment Verification</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {verificationCriteria.equipment.map((criterion, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-orange-400 flex-shrink-0" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Compliance Verification</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {verificationCriteria.compliance.map((criterion, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-cyan-400 flex-shrink-0" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Monitoring Locations */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Home className="text-cyan-400" size={20} />
          Monitoring Locations
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Required Locations</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              {monitoringLocations.map((location, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                  {location}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Equipment Monitoring</h5>
            <div className="space-y-4">
              <div>
                <h6 className="font-medium text-white mb-2">Airmovers</h6>
                <ul className="space-y-1 text-sm text-slate-300">
                  {equipmentMonitoring.airmovers.map((item, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <Wind size={12} className="text-cyan-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h6 className="font-medium text-white mb-2">Dehumidifiers</h6>
                <ul className="space-y-1 text-sm text-slate-300">
                  {equipmentMonitoring.dehumidifiers.map((item, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <Droplets size={12} className="text-blue-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
