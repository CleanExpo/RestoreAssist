"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  FileText, 
  Shield, 
  Droplets, 
  Wind, 
  Thermometer, 
  CheckCircle, 
  AlertTriangle,
  Settings,
  BarChart3,
  Activity,
  Save,
  ArrowRight,
  ArrowLeft
} from "lucide-react"
import RemediationProcedures from "./RemediationProcedures"
import DryingPlanTemplates from "./DryingPlanTemplates"
import EquipmentSizingGuidelines from "./EquipmentSizingGuidelines"
import MonitoringVerificationProcedures from "./MonitoringVerificationProcedures"
import IICRCComplianceHelper from "./IICRCComplianceHelper"
import InsuranceInformation from "./InsuranceInformation"

interface IICRCReportBuilderProps {
  onReportComplete: (report: any) => void
  initialData?: any
  isEditMode?: boolean
}

export default function IICRCReportBuilder({ onReportComplete, initialData, isEditMode = false }: IICRCReportBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState({
    // Basic Information
    title: "",
    reportNumber: "",
    clientName: "",
    propertyAddress: "",
    inspectionDate: "",
    hazardType: "",
    insuranceType: "",
    
    // IICRC Assessment
    waterCategory: "",
    waterClass: "",
    sourceOfWater: "",
    affectedArea: 0,
    safetyHazards: "",
    
    // Detailed Assessment
    structuralDamage: "",
    contentsDamage: "",
    hvacAffected: false,
    electricalHazards: "",
    microbialGrowth: "",
    
    // Remediation Data
    remediationData: {},
    
    // Drying Plan
    dryingPlan: {},
    
    // Equipment Sizing
    equipmentSizing: {},
    
    // Monitoring
    monitoringData: {},
    
    // Insurance Information
    insuranceData: {}
  })

  // Auto-generate report number on component mount
  useEffect(() => {
    const generateReportNumber = () => {
      const year = new Date().getFullYear()
      const timestamp = Date.now().toString().slice(-6)
      return `WD-${year}-${timestamp}`
    }
    
    setReportData(prev => ({
      ...prev,
      reportNumber: generateReportNumber(),
      inspectionDate: new Date().toISOString().slice(0, 16)
    }))
  }, [])

  // Load initial data for edit mode
  useEffect(() => {
    if (isEditMode && initialData) {
      setReportData(prev => ({
        ...prev,
        ...initialData,
        // Ensure arrays are properly initialized
        psychrometricReadings: initialData.psychrometricReadings || [],
        moistureReadings: initialData.moistureReadings || [],
        equipmentPerformance: initialData.equipmentPerformance || [],
        dailyLogs: initialData.dailyLogs || [],
        verificationResults: initialData.verificationResults || [],
        // Parse JSON strings back to objects
        propertyCover: typeof initialData.propertyCover === 'string' 
          ? JSON.parse(initialData.propertyCover) 
          : initialData.propertyCover,
        contentsCover: typeof initialData.contentsCover === 'string' 
          ? JSON.parse(initialData.contentsCover) 
          : initialData.contentsCover,
        liabilityCover: typeof initialData.liabilityCover === 'string' 
          ? JSON.parse(initialData.liabilityCover) 
          : initialData.liabilityCover,
        businessInterruption: typeof initialData.businessInterruption === 'string' 
          ? JSON.parse(initialData.businessInterruption) 
          : initialData.businessInterruption,
        additionalCover: typeof initialData.additionalCover === 'string' 
          ? JSON.parse(initialData.additionalCover) 
          : initialData.additionalCover,
      }))
    }
  }, [isEditMode, initialData])

  // Generate title based on report data (only for new reports)
  useEffect(() => {
    if (!isEditMode) {
      const generateTitle = () => {
        if (reportData.clientName && reportData.waterCategory) {
          return `${reportData.waterCategory} Water Damage Assessment - ${reportData.clientName}`
        } else if (reportData.clientName) {
          return `Water Damage Assessment - ${reportData.clientName}`
        } else if (reportData.waterCategory) {
          return `${reportData.waterCategory} Water Damage Assessment`
        } else {
          return "Water Damage Assessment Report"
        }
      }

      setReportData(prev => ({
        ...prev,
        title: generateTitle()
      }))
    }
  }, [reportData.clientName, reportData.waterCategory, isEditMode])

  // Fetch clients for dropdown
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch('/api/clients')
        if (response.ok) {
          const data = await response.json()
          setClients(data.clients || [])
        }
      } catch (error) {
        console.error('Error fetching clients:', error)
      }
    }
    fetchClients()
  }, [])

  const steps = [
    { 
      id: 1, 
      title: "Initial Assessment", 
      icon: FileText, 
      description: "Basic information and safety evaluation",
      component: "basic"
    },
    { 
      id: 2, 
      title: "Water Classification", 
      icon: Droplets, 
      description: "IICRC S500 water category and class determination",
      component: "classification"
    },
    { 
      id: 3, 
      title: "Damage Assessment", 
      icon: AlertTriangle, 
      description: "Structural and contents damage evaluation",
      component: "damage"
    },
    { 
      id: 4, 
      title: "Remediation Procedures", 
      icon: Shield, 
      description: "Category 2/3 contamination control procedures",
      component: "remediation"
    },
    { 
      id: 5, 
      title: "Drying Plan", 
      icon: Wind, 
      description: "Equipment sizing and drying strategy",
      component: "drying"
    },
    { 
      id: 6, 
      title: "Equipment Sizing", 
      icon: Settings, 
      description: "Detailed equipment calculations and placement",
      component: "equipment"
    },
    { 
      id: 7, 
      title: "Monitoring Plan", 
      icon: Thermometer, 
      description: "Psychrometric monitoring and verification",
      component: "monitoring"
    },
    { 
      id: 8, 
      title: "Insurance Coverage", 
      icon: Shield, 
      description: "Small business insurance coverage assessment",
      component: "insurance"
    },
    { 
      id: 9, 
      title: "Final Review", 
      icon: CheckCircle, 
      description: "Compliance verification and report completion",
      component: "review"
    }
  ]

  const handleInputChange = (field: string, value: any) => {
    setReportData(prev => ({ ...prev, [field]: value }))
  }

  const handleStepData = (step: string, data: any) => {
    setReportData(prev => ({ ...prev, [step]: data }))
  }

  // Auto-fill scenarios for each step
  const autoFillScenarios = {
    basic: {
      category1: {
        title: "Category 1 Water Damage Assessment - Clean Water Restoration Co.",
        clientName: "Clean Water Restoration Co.",
        propertyAddress: "123 Residential Street, Sydney NSW 2000",
        safetyHazards: "Minimal safety hazards, standard precautions sufficient",
        hazardType: "Water Damage",
        insuranceType: "Building & Contents"
      },
      category2: {
        title: "Category 2 Water Damage Assessment - Gray Water Solutions",
        clientName: "Gray Water Solutions",
        propertyAddress: "456 Commercial Avenue, Melbourne VIC 3000", 
        safetyHazards: "Electrical outlets near water damage, potential structural compromise, gas line integrity needs verification",
        hazardType: "Water Damage",
        insuranceType: "Building & Contents"
      },
      category3: {
        title: "Category 3 Water Damage Assessment - Biohazard Restoration Pro",
        clientName: "Biohazard Restoration Pro",
        propertyAddress: "789 Industrial Road, Brisbane QLD 4000",
        safetyHazards: "Biohazard contamination, structural integrity compromised, electrical hazards present, requires full PPE",
        hazardType: "Biohazard",
        insuranceType: "Building & Contents"
      }
    },
    classification: {
      category1: {
        waterCategory: "Category 1",
        waterClass: "Class 1",
        sourceOfWater: "Burst supply line from municipal water system",
        affectedArea: 200
      },
      category2: {
        waterCategory: "Category 2", 
        waterClass: "Class 2",
        sourceOfWater: "Burst hot water heater with gray water contamination from sediment and mineral buildup",
        affectedArea: 450
      },
      category3: {
        waterCategory: "Category 3",
        waterClass: "Class 3", 
        sourceOfWater: "Sewage backup from main line, contains pathogenic agents",
        affectedArea: 320
      }
    },
    damage: {
      category1: {
        structuralDamage: "Light water damage to carpet and baseboards",
        contentsDamage: "Minimal contents damage, mostly protective measures needed",
        hvacAffected: false,
        electricalHazards: "No electrical hazards detected",
        microbialGrowth: "No microbial growth risk"
      },
      category2: {
        structuralDamage: "Water damage to drywall up to 2 feet, carpet padding saturated, hardwood flooring showing cupping",
        contentsDamage: "Furniture legs showing water staining, electronics on floor affected, personal items in contact with water",
        hvacAffected: true,
        electricalHazards: "GFCI outlets tripped, electrical panel shows moisture indicators",
        microbialGrowth: "No visible mould growth detected, but conditions favourable for development within 24-48 hours"
      },
      category3: {
        structuralDamage: "Severe water damage to all structural materials, carpet and padding require removal",
        contentsDamage: "All contents in contact with sewage require disposal or professional cleaning",
        hvacAffected: true,
        electricalHazards: "Multiple electrical hazards, power must be disconnected",
        microbialGrowth: "Active microbial growth present, requires immediate remediation"
      }
    },
    remediation: {
      category2: {
        remediationData: {
          containmentRequired: true,
          ppeRequired: "N95 respirators, nitrile gloves, protective clothing",
          containmentBarriers: "6-mil polyethylene sheeting with negative pressure",
          airFiltration: "HEPA filtration units required",
          decontaminationProcedures: "Antimicrobial treatment of affected surfaces",
          wasteDisposal: "Contaminated materials double-bagged for disposal",
          safetyProtocols: "Standard Category 2 protocols - moderate contamination control",
          isolationRequired: true,
          negativePressure: "Required to prevent cross-contamination",
          monitoringFrequency: "Continuous during remediation"
        }
      },
      category3: {
        remediationData: {
          containmentRequired: true,
          ppeRequired: "Full body protection, P100 respirators, chemical-resistant gloves, protective suits",
          containmentBarriers: "Full containment with 6-mil polyethylene, sealed joints, negative pressure mandatory",
          airFiltration: "Multiple HEPA filtration units with pre-filters",
          decontaminationProcedures: "Aggressive antimicrobial treatment, specialized cleaning protocols",
          wasteDisposal: "Biohazard disposal protocols, triple-bagged contaminated materials",
          safetyProtocols: "Full Category 3 biohazard protocols - maximum contamination control",
          isolationRequired: true,
          negativePressure: "Mandatory negative pressure with continuous monitoring",
          monitoringFrequency: "Continuous monitoring with real-time air quality assessment"
        }
      }
    },
    drying: {
      category1: {
        dryingPlan: {
          targetHumidity: 40,
          targetTemperature: 75,
          dryingSystem: "Open system with natural ventilation",
          estimatedDryingTime: "1-2 days",
          psychrometricReadings: {
            initialHumidity: 60,
            initialTemperature: 70,
            targetHumidity: 40,
            targetTemperature: 75
          }
        }
      },
      category2: {
        dryingPlan: {
          targetHumidity: 35,
          targetTemperature: 80,
          dryingSystem: "Closed system with dehumidification",
          estimatedDryingTime: "3-5 days",
          psychrometricReadings: {
            initialHumidity: 85,
            initialTemperature: 68,
            targetHumidity: 35,
            targetTemperature: 80
          }
        }
      },
      category3: {
        dryingPlan: {
          targetHumidity: 30,
          targetTemperature: 85,
          dryingSystem: "Closed system with aggressive dehumidification",
          estimatedDryingTime: "5-7 days",
          psychrometricReadings: {
            initialHumidity: 90,
            initialTemperature: 65,
            targetHumidity: 30,
            targetTemperature: 85
          }
        }
      }
    },
    equipment: {
      category1: {
        equipmentSizing: {
          dehumidificationCapacity: 30,
          airmoversCount: 4,
          equipmentPlacement: "Strategic placement for optimal airflow across all affected surfaces",
          powerRequirements: "Standard 15-amp circuits sufficient",
          monitoringEquipment: "Basic moisture meters and hygrometers"
        }
      },
      category2: {
        equipmentSizing: {
          dehumidificationCapacity: 90,
          airmoversCount: 9,
          equipmentPlacement: "Strategic placement for optimal airflow across all affected surfaces",
          powerRequirements: "Dedicated 20-amp circuits required",
          monitoringEquipment: "Psychrometric monitoring devices, moisture meters, air quality monitors"
        }
      },
      category3: {
        equipmentSizing: {
          dehumidificationCapacity: 150,
          airmoversCount: 12,
          equipmentPlacement: "Maximum airflow with containment barriers, negative pressure systems",
          powerRequirements: "Dedicated 30-amp circuits with backup power",
          monitoringEquipment: "Advanced psychrometric monitoring, real-time air quality assessment, HEPA filtration monitoring"
        }
      }
    },
    monitoring: {
      category1: {
        monitoringData: {
          monitoringFrequency: "Daily",
          psychrometricReadings: [],
          moistureReadings: [],
          equipmentPerformance: [],
          dailyLogs: [],
          verificationResults: [],
          complianceStatus: "pending"
        }
      },
      category2: {
        monitoringData: {
          monitoringFrequency: "Twice daily",
          psychrometricReadings: [],
          moistureReadings: [],
          equipmentPerformance: [],
          dailyLogs: [],
          verificationResults: [],
          complianceStatus: "pending"
        }
      },
      category3: {
        monitoringData: {
          monitoringFrequency: "Continuous",
          psychrometricReadings: [],
          moistureReadings: [],
          equipmentPerformance: [],
          dailyLogs: [],
          verificationResults: [],
          complianceStatus: "pending"
        }
      }
    },
    insurance: {
      standard: {
        insuranceData: {
          propertyCover: {
            buildingCoverage: 500000,
            deductible: 2500,
            coverageType: "Replacement cost"
          },
          contentsCover: {
            contentsCoverage: 100000,
            deductible: 1000,
            coverageType: "Actual cash value"
          },
          liabilityCover: {
            generalLiability: 1000000,
            professionalLiability: 500000,
            coverageType: "Occurrence"
          },
          businessInterruption: {
            coverageAmount: 50000,
            waitingPeriod: 72,
            coverageType: "Gross earnings"
          },
          additionalCover: {
            equipmentBreakdown: true,
            cyberLiability: true,
            employmentPractices: true
          }
        }
      },
      comprehensive: {
        insuranceData: {
          propertyCover: {
            buildingCoverage: 1000000,
            deductible: 5000,
            coverageType: "Replacement cost"
          },
          contentsCover: {
            contentsCoverage: 250000,
            deductible: 2500,
            coverageType: "Replacement cost"
          },
          liabilityCover: {
            generalLiability: 2000000,
            professionalLiability: 1000000,
            coverageType: "Occurrence"
          },
          businessInterruption: {
            coverageAmount: 100000,
            waitingPeriod: 48,
            coverageType: "Gross earnings"
          },
          additionalCover: {
            equipmentBreakdown: true,
            cyberLiability: true,
            employmentPractices: true,
            environmentalLiability: true,
            directorsOfficers: true
          }
        }
      }
    }
  }

  const handleAutoFill = (scenario: string) => {
    const stepKey = getCurrentStepKey() as keyof typeof autoFillScenarios
    const scenarioData = autoFillScenarios[stepKey]?.[scenario as keyof typeof autoFillScenarios[typeof stepKey]]
    if (scenarioData) {
      setReportData(prev => ({ ...prev, ...(scenarioData as any) }))
    }
  }

  const getCurrentStepKey = () => {
    const stepKeys = ['basic', 'classification', 'damage', 'remediation', 'drying', 'equipment', 'monitoring', 'insurance', 'review']
    return stepKeys[currentStep - 1] || 'basic'
  }

  const handleClientSelect = (clientId: string) => {
    const selectedClient = clients.find(c => c.id === clientId)
    if (selectedClient) {
      setReportData(prev => ({
        ...prev,
        clientName: selectedClient.name,
        propertyAddress: selectedClient.address || ""
      }))
    }
  }

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = () => {
    onReportComplete(reportData)
  }

  const renderStepContent = () => {
    const currentStepData = steps[currentStep - 1]
    
    switch (currentStepData.component) {
      case "basic":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water Scenario
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water Scenario
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water Scenario
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, title: "", clientName: "", propertyAddress: "", safetyHazards: "", hazardType: "", insuranceType: "" }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Report Title</label>
                <input
                  type="text"
                  value={reportData.title}
                  onChange={(e) => setReportData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                  placeholder="Auto-generated based on client and water category"
                />
                <p className="text-xs text-slate-400 mt-1">Title will be auto-generated as you fill in client and water category</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Report Number (Auto-generated)</label>
                <input
                  type="text"
                  value={reportData.reportNumber}
                  readOnly
                  className="w-full px-4 py-3 bg-slate-600/50 border border-slate-500 rounded-lg text-slate-300 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">Automatically generated - no changes needed</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Inspection Date</label>
                <input
                  type="datetime-local"
                  value={reportData.inspectionDate}
                  onChange={(e) => handleInputChange("inspectionDate", e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Hazard Type</label>
                <select
                  value={reportData.hazardType}
                  onChange={(e) => handleInputChange("hazardType", e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select hazard type</option>
                  <option value="Water Damage">Water Damage</option>
                  <option value="Fire Damage">Fire Damage</option>
                  <option value="Storm Damage">Storm Damage</option>
                  <option value="Mould Remediation">Mould Remediation</option>
                  <option value="Biohazard">Biohazard</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Insurance Type</label>
                <select
                  value={reportData.insuranceType}
                  onChange={(e) => handleInputChange("insuranceType", e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select insurance type</option>
                  <option value="Building & Contents">Building & Contents</option>
                  <option value="Standalone Building">Standalone Building</option>
                  <option value="Standalone Contents">Standalone Contents</option>
                  <option value="Landlord Insurance">Landlord Insurance</option>
                  <option value="Portable Valuables">Portable Valuables</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Select Client</label>
              <select
                value={reportData.clientName}
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="">Choose a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} - {client.address || 'No address'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Select from existing clients or use auto-fill scenarios above</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Property Address</label>
              <input
                type="text"
                value={reportData.propertyAddress}
                onChange={(e) => handleInputChange("propertyAddress", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                placeholder="123 Main St, Sydney NSW 2000"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Safety Hazards Identified</label>
              <textarea
                value={reportData.safetyHazards}
                onChange={(e) => handleInputChange("safetyHazards", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Electrical hazards, structural damage, gas leaks, etc."
              />
            </div>
          </div>
        )

      case "classification":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water (Category 1)
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water (Category 2)
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water (Category 3)
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, waterCategory: "", waterClass: "", sourceOfWater: "", affectedArea: 0 }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <IICRCComplianceHelper 
              waterCategory={reportData.waterCategory}
              waterClass={reportData.waterClass}
              affectedArea={reportData.affectedArea}
            />
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-4">Water Category (IICRC S500)</label>
                <div className="space-y-3">
                  {[
                    { value: "Category 1", label: "Category 1 - Clean Water", description: "Sanitary source, no contamination risk" },
                    { value: "Category 2", label: "Category 2 - Gray Water", description: "Significant contamination, may cause discomfort or sickness" },
                    { value: "Category 3", label: "Category 3 - Black Water", description: "Grossly contaminated, pathogenic agents present" }
                  ].map((category) => (
                    <label key={category.value} className="flex items-start gap-3 p-4 bg-slate-700/30 border border-slate-600 rounded-lg hover:bg-slate-700/50 cursor-pointer">
                      <input
                        type="radio"
                        name="waterCategory"
                        value={category.value}
                        checked={reportData.waterCategory === category.value}
                        onChange={(e) => handleInputChange("waterCategory", e.target.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{category.label}</div>
                        <div className="text-sm text-slate-400">{category.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-4">Water Class (IICRC S500)</label>
                <div className="space-y-3">
                  {[
                    { value: "Class 1", label: "Class 1 - Slow Rate of Evaporation", description: "Minimal water absorption, low evaporation load" },
                    { value: "Class 2", label: "Class 2 - Fast Rate of Evaporation", description: "Water absorption into materials, moderate evaporation load" },
                    { value: "Class 3", label: "Class 3 - Fastest Rate of Evaporation", description: "Water absorption from overhead, high evaporation load" },
                    { value: "Class 4", label: "Class 4 - Specialty Drying Situations", description: "Deep water absorption, specialty drying required" }
                  ].map((waterClass) => (
                    <label key={waterClass.value} className="flex items-start gap-3 p-4 bg-slate-700/30 border border-slate-600 rounded-lg hover:bg-slate-700/50 cursor-pointer">
                      <input
                        type="radio"
                        name="waterClass"
                        value={waterClass.value}
                        checked={reportData.waterClass === waterClass.value}
                        onChange={(e) => handleInputChange("waterClass", e.target.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{waterClass.label}</div>
                        <div className="text-sm text-slate-400">{waterClass.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Source of Water</label>
              <input
                type="text"
                value={reportData.sourceOfWater}
                onChange={(e) => handleInputChange("sourceOfWater", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                placeholder="Burst pipe, storm damage, appliance failure, etc."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Affected Area (sq ft)</label>
              <input
                type="number"
                value={reportData.affectedArea}
                onChange={(e) => handleInputChange("affectedArea", parseFloat(e.target.value))}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                placeholder="500"
              />
            </div>
          </div>
        )

      case "damage":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water Damage
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water Damage
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water Damage
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, structuralDamage: "", contentsDamage: "", hvacAffected: false, electricalHazards: "", microbialGrowth: "" }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Structural Damage</label>
              <textarea
                value={reportData.structuralDamage}
                onChange={(e) => handleInputChange("structuralDamage", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Describe structural damage to walls, floors, ceilings, framing, etc."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Contents Damage</label>
              <textarea
                value={reportData.contentsDamage}
                onChange={(e) => handleInputChange("contentsDamage", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Describe damage to furniture, electronics, personal belongings, etc."
              />
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="hvacAffected"
                checked={reportData.hvacAffected}
                onChange={(e) => handleInputChange("hvacAffected", e.target.checked)}
                className="w-5 h-5"
              />
              <label htmlFor="hvacAffected" className="text-sm font-medium">
                HVAC System Affected
              </label>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Electrical Hazards</label>
              <textarea
                value={reportData.electricalHazards}
                onChange={(e) => handleInputChange("electricalHazards", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Electrical outlets, wiring, appliances affected by water"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Microbial Growth Assessment</label>
              <textarea
                value={reportData.microbialGrowth}
                onChange={(e) => handleInputChange("microbialGrowth", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Visible mould, musty odours, previous water damage history"
              />
            </div>
          </div>
        )

      case "remediation":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Category 2 Remediation
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Category 3 Remediation
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, remediationData: {} }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Note: Category 1 (Clean Water) does not require remediation procedures
              </p>
            </div>

            <RemediationProcedures
              waterCategory={reportData.waterCategory}
              waterClass={reportData.waterClass}
              affectedArea={reportData.affectedArea}
              safetyHazards={reportData.safetyHazards}
              onUpdate={(data) => handleStepData("remediationData", data)}
              initialData={reportData.remediationData}
            />
          </div>
        )

      case "drying":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water Drying
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water Drying
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water Drying
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, dryingPlan: {} }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <DryingPlanTemplates
              waterClass={reportData.waterClass}
              affectedArea={reportData.affectedArea}
              waterCategory={reportData.waterCategory}
              onPlanUpdate={(plan) => handleStepData("dryingPlan", plan)}
              initialData={reportData.dryingPlan}
            />
          </div>
        )

      case "equipment":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water Equipment
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water Equipment
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water Equipment
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, equipmentSizing: {} }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <EquipmentSizingGuidelines
              waterClass={reportData.waterClass}
              affectedArea={reportData.affectedArea}
              waterCategory={reportData.waterCategory}
              onSizingUpdate={(sizing) => handleStepData("equipmentSizing", sizing)}
              initialData={reportData.equipmentSizing}
            />
          </div>
        )

      case "monitoring":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('category1')}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  Clean Water Monitoring
                </button>
                <button
                  onClick={() => handleAutoFill('category2')}
                  className="px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                >
                  Gray Water Monitoring
                </button>
                <button
                  onClick={() => handleAutoFill('category3')}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                >
                  Black Water Monitoring
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, monitoringData: {} }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <MonitoringVerificationProcedures
              waterClass={reportData.waterClass}
              waterCategory={reportData.waterCategory}
              affectedArea={reportData.affectedArea}
              onMonitoringUpdate={(monitoring) => handleStepData("monitoringData", monitoring)}
              initialData={reportData.monitoringData}
            />
          </div>
        )

      case "insurance":
        return (
          <div className="space-y-6">
            {/* Auto-fill buttons */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">Quick Fill Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAutoFill('standard')}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
                >
                  Standard Coverage
                </button>
                <button
                  onClick={() => handleAutoFill('comprehensive')}
                  className="px-4 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 transition-colors text-sm"
                >
                  Comprehensive Coverage
                </button>
                <button
                  onClick={() => setReportData(prev => ({ ...prev, insuranceData: {} }))}
                  className="px-4 py-2 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors text-sm"
                >
                  Clear All
                </button>
              </div>
            </div>

            <InsuranceInformation
              onInsuranceUpdate={(insurance) => handleStepData("insuranceData", insurance)}
              initialData={reportData.insuranceData}
            />
          </div>
        )

      case "review":
        return (
          <div className="space-y-6">
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="text-emerald-400" size={24} />
                <h3 className="text-xl font-medium text-emerald-400">IICRC S500 Compliance Review</h3>
              </div>
              <p className="text-emerald-300">
                This report has been generated following ANSI/IICRC S500: 2021 Standard for Professional Water Damage Restoration procedures.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-white mb-3">Report Summary</h4>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span>Report Number:</span>
                    <span className="font-medium">{reportData.reportNumber || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Water Category:</span>
                    <span className="font-medium">{reportData.waterCategory || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Water Class:</span>
                    <span className="font-medium">{reportData.waterClass || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Affected Area:</span>
                    <span className="font-medium">{reportData.affectedArea || 0} sq ft</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-white mb-3">Compliance Status</h4>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    <span>IICRC S500 Standards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    <span>Safety Protocols</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    <span>Equipment Sizing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    <span>Monitoring Procedures</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <h4 className="font-medium text-white mb-4">Final Documentation</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-white mb-2">Required Documentation</h5>
                  <ul className="space-y-1 text-sm text-slate-300">
                    <li>• Initial assessment and safety evaluation</li>
                    <li>• Water category and class determination</li>
                    <li>• Damage assessment and evaluation</li>
                    <li>• Remediation procedures (if applicable)</li>
                    <li>• Drying plan and equipment sizing</li>
                    <li>• Monitoring and verification procedures</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-white mb-2">Compliance Verification</h5>
                  <ul className="space-y-1 text-sm text-slate-300">
                    <li>• IICRC S500 standards adherence</li>
                    <li>• Safety protocol implementation</li>
                    <li>• Equipment requirements met</li>
                    <li>• Monitoring procedures established</li>
                    <li>• Documentation complete</li>
                    <li>• Client approval obtained</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-9xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 
          className="text-3xl font-medium text-white mb-2"
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          IICRC S500 Report Builder
        </h1>
        <p className="text-slate-400">
          Professional water damage restoration report following ANSI/IICRC S500: 2021 standards
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-300">
              Step {currentStep} of {steps.length}
            </span>
            <span className="text-sm text-slate-400">
              {Math.round((currentStep / steps.length) * 100)}% Complete
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <motion.div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(currentStep / steps.length) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:block">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center justify-center flex-1">
                <motion.div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 mb-2 transition-all flex-shrink-0 ${
                    currentStep >= step.id
                      ? "bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                      : "border-slate-600 text-slate-400"
                  }`}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {currentStep > step.id ? (
                    <CheckCircle size={20} />
                  ) : (
                    <step.icon size={20} />
                  )}
                </motion.div>
                
                <div className="ml-4 flex-1">
                  <div className={`text-sm font-medium ${
                    currentStep >= step.id ? "text-white" : "text-slate-400"
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{step.description}</div>
                </div>
                
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${
                    currentStep > step.id ? "bg-cyan-500" : "bg-slate-600"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile/Tablet Layout */}
        <div className="lg:hidden">
          <div className="flex items-center justify-between overflow-x-auto pb-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center min-w-0 px-2">
                <motion.div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                    currentStep >= step.id
                      ? "bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                      : "border-slate-600 text-slate-400"
                  }`}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {currentStep > step.id ? (
                    <CheckCircle size={18} />
                  ) : (
                    <step.icon size={18} />
                  )}
                </motion.div>
                
                <div className="mt-2 text-center">
                  <div className={`text-xs font-medium leading-tight ${
                    currentStep >= step.id ? "text-white" : "text-slate-400"
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-tight">{step.description}</div>
                </div>
                
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mt-5 ${
                    currentStep > step.id ? "bg-cyan-500" : "bg-slate-600"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-8"
      >
        {renderStepContent()}
      </motion.div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-700/50">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          className="px-6 py-3 border border-slate-600 rounded-lg text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          Previous
        </button>
        
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-medium text-slate-300">
              Step {currentStep} of {steps.length}
            </div>
            <div className="text-xs text-slate-400">
              {Math.round((currentStep / steps.length) * 100)}% Complete
            </div>
          </div>
          
          {currentStep === steps.length ? (
            <button
              onClick={handleSubmit}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg text-white font-medium hover:shadow-lg hover:shadow-emerald-500/50 transition-all flex items-center gap-2"
            >
              <CheckCircle size={20} />
              {isEditMode ? 'Update Report' : 'Complete Report'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center gap-2"
            >
              Next Step
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
