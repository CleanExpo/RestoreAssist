"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  AlertTriangle, 
  Shield, 
  Droplets, 
  Wind, 
  Thermometer, 
  CheckCircle, 
  XCircle,
  Users,
  Zap,
  Home,
  FileText,
  Clock,
  Activity
} from "lucide-react"

interface RemediationProceduresProps {
  waterCategory: string
  waterClass: string
  affectedArea: number
  safetyHazards: string
  onUpdate: (data: any) => void
  initialData?: any
}

export default function RemediationProcedures({ 
  waterCategory, 
  waterClass, 
  affectedArea, 
  safetyHazards,
  onUpdate,
  initialData 
}: RemediationProceduresProps) {
  const [activeStep, setActiveStep] = useState(1)
  const [remediationData, setRemediationData] = useState({
    contaminationAssessment: "",
    containmentSetup: "",
    ppeRequirements: "",
    decontaminationProcedures: "",
    wasteDisposal: "",
    postRemediationVerification: "",
    iepRequired: false,
    iepContact: "",
    safetyPlan: "",
    emergencyProcedures: "",
    // Auto-fill fields
    containmentRequired: false,
    ppeRequired: "",
    containmentBarriers: "",
    airFiltration: "",
    safetyProtocols: "",
    isolationRequired: false,
    negativePressure: "",
    monitoringFrequency: "",
    ...initialData
  })

  // Update component when initialData changes
  useEffect(() => {
    if (initialData) {
      setRemediationData(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const isCategory2Or3 = waterCategory === "Category 2" || waterCategory === "Category 3"
  const isCategory3 = waterCategory === "Category 3"

  const remediationSteps = [
    {
      id: 1,
      title: "Safety Assessment",
      icon: Shield,
      description: "Evaluate hazards and establish safety protocols",
      required: true
    },
    {
      id: 2,
      title: "Contamination Control",
      icon: AlertTriangle,
      description: "Implement containment and contamination controls",
      required: isCategory2Or3
    },
    {
      id: 3,
      title: "Decontamination",
      icon: Droplets,
      description: "Clean and decontaminate affected areas",
      required: isCategory2Or3
    },
    {
      id: 4,
      title: "IEP Assessment",
      icon: Users,
      description: "Independent Environmental Professional evaluation",
      required: isCategory3
    },
    {
      id: 5,
      title: "Verification",
      icon: CheckCircle,
      description: "Post-remediation verification and clearance",
      required: isCategory2Or3
    }
  ]

  const getPPERequirements = () => {
    const basePPE = [
      "Safety glasses or goggles",
      "Protective gloves",
      "Non-slip footwear",
      "Hard hat (if overhead hazards)"
    ]

    if (isCategory2Or3) {
      return [
        ...basePPE,
        "Respiratory protection (N95 or higher)",
        "Protective clothing (coveralls)",
        "Disposable boot covers"
      ]
    }

    if (isCategory3) {
      return [
        ...basePPE,
        "Full-face respirator with P100 filters",
        "Disposable protective suit",
        "Disposable boot covers",
        "Double gloves"
      ]
    }

    return basePPE
  }

  const getContainmentRequirements = () => {
    if (waterCategory === "Category 3") {
      return {
        barriers: "Full containment barriers required",
        pressure: "Negative pressure mandatory",
        isolation: "Complete isolation from uncontaminated areas",
        monitoring: "Continuous air monitoring"
      }
    }

    if (waterCategory === "Category 2") {
      return {
        barriers: "Containment barriers recommended",
        pressure: "Negative pressure recommended",
        isolation: "Isolate contaminated areas",
        monitoring: "Periodic air monitoring"
      }
    }

    return {
      barriers: "No containment required",
      pressure: "No pressure differential needed",
      isolation: "Standard work practices",
      monitoring: "Visual inspection sufficient"
    }
  }

  const getDecontaminationProcedures = () => {
    if (isCategory3) {
      return [
        "Remove all contaminated materials",
        "HEPA vacuum all surfaces",
        "Wet cleaning with antimicrobial solution",
        "Air scrubbing with HEPA filtration",
        "Final HEPA vacuuming",
        "Post-cleaning verification"
      ]
    }

    if (waterCategory === "Category 2") {
      return [
        "Remove contaminated materials",
        "HEPA vacuum affected surfaces",
        "Wet cleaning with appropriate solution",
        "Final cleaning verification"
      ]
    }

    return [
      "Standard cleaning procedures",
      "Remove visible contamination",
      "Dry cleaning sufficient"
    ]
  }

  const getIEPRequirements = () => {
    if (isCategory3) {
      return {
        required: true,
        triggers: [
          "High-risk occupants present",
          "Public health facility",
          "Significant contamination",
          "Aerosolization concerns"
        ]
      }
    }

    if (waterCategory === "Category 2") {
      return {
        required: false,
        triggers: [
          "High-risk occupants",
          "Public health facility",
          "Significant contamination"
        ]
      }
    }

    return {
      required: false,
      triggers: []
    }
  }

  const handleInputChange = (field: string, value: any) => {
    const newData = { ...remediationData, [field]: value }
    setRemediationData(newData)
    onUpdate(newData)
  }

  const renderStepContent = () => {
    switch (activeStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="text-amber-400" size={20} />
                <h4 className="font-medium text-amber-400">Safety Assessment Required</h4>
              </div>
              <p className="text-sm text-amber-300">
                {isCategory2Or3 
                  ? "Category 2/3 water requires enhanced safety protocols and contamination controls."
                  : "Standard safety procedures apply for Category 1 water."
                }
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Safety Hazards Identified</label>
              <textarea
                value={safetyHazards}
                readOnly
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-300"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Safety Plan</label>
              <textarea
                value={remediationData.safetyPlan}
                onChange={(e) => handleInputChange("safetyPlan", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Detailed safety protocols, emergency procedures, evacuation plans"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Emergency Procedures</label>
              <textarea
                value={remediationData.emergencyProcedures}
                onChange={(e) => handleInputChange("emergencyProcedures", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Emergency contacts, evacuation routes, medical procedures"
              />
            </div>

            <div>
              <h5 className="font-medium text-white mb-3">Required PPE</h5>
              <textarea
                value={remediationData.ppeRequired}
                onChange={(e) => handleInputChange("ppeRequired", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="PPE requirements will be auto-filled based on water category"
              />
              <ul className="space-y-2 mt-3">
                {getPPERequirements().map((ppe, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                    {ppe}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="text-red-400" size={20} />
                <h4 className="font-medium text-red-400">Contamination Control Required</h4>
              </div>
              <p className="text-sm text-red-300">
                {isCategory2Or3 
                  ? "Contamination controls are mandatory for Category 2/3 water damage."
                  : "No contamination controls required for Category 1 water."
                }
              </p>
            </div>

            {isCategory2Or3 && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Containment Setup</label>
                  <textarea
                    value={remediationData.containmentSetup}
                    onChange={(e) => handleInputChange("containmentSetup", e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                    rows={4}
                    placeholder="Containment barriers, negative pressure setup, isolation procedures"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Containment Barriers</label>
                  <textarea
                    value={remediationData.containmentBarriers}
                    onChange={(e) => handleInputChange("containmentBarriers", e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                    rows={2}
                    placeholder="Containment barriers will be auto-filled based on water category"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Air Filtration</label>
                  <textarea
                    value={remediationData.airFiltration}
                    onChange={(e) => handleInputChange("airFiltration", e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                    rows={2}
                    placeholder="Air filtration requirements will be auto-filled"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Negative Pressure</label>
                  <textarea
                    value={remediationData.negativePressure}
                    onChange={(e) => handleInputChange("negativePressure", e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                    rows={2}
                    placeholder="Negative pressure requirements will be auto-filled"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-white mb-3">Containment Requirements</h5>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                        {getContainmentRequirements().barriers}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                        {getContainmentRequirements().pressure}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                        {getContainmentRequirements().isolation}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                        {getContainmentRequirements().monitoring}
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-medium text-white mb-3">Engineering Controls</h5>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                        HEPA filtration systems
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                        Negative pressure units
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                        Air scrubbing equipment
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                        Containment barriers
                      </li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Decontamination Procedures</label>
              <textarea
                value={remediationData.decontaminationProcedures}
                onChange={(e) => handleInputChange("decontaminationProcedures", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Detailed decontamination procedures, cleaning protocols, antimicrobial application"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Waste Disposal</label>
              <textarea
                value={remediationData.wasteDisposal}
                onChange={(e) => handleInputChange("wasteDisposal", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Waste disposal procedures will be auto-filled based on water category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Safety Protocols</label>
              <textarea
                value={remediationData.safetyProtocols}
                onChange={(e) => handleInputChange("safetyProtocols", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Safety protocols will be auto-filled based on water category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Monitoring Frequency</label>
              <textarea
                value={remediationData.monitoringFrequency}
                onChange={(e) => handleInputChange("monitoringFrequency", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={2}
                placeholder="Monitoring frequency will be auto-filled"
              />
            </div>

            <div>
              <h5 className="font-medium text-white mb-3">Decontamination Steps</h5>
              <ol className="space-y-2">
                {getDecontaminationProcedures().map((step, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Waste Disposal Procedures</label>
              <textarea
                value={remediationData.wasteDisposal}
                onChange={(e) => handleInputChange("wasteDisposal", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={3}
                placeholder="Waste segregation, disposal methods, regulatory compliance"
              />
            </div>
          </div>
        )

      case 4:
        const iepRequirements = getIEPRequirements()
        return (
          <div className="space-y-6">
            <div className={`${iepRequirements.required ? 'bg-red-500/20 border-red-500/30' : 'bg-amber-500/20 border-amber-500/30'} rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Users className={iepRequirements.required ? "text-red-400" : "text-amber-400"} size={20} />
                <h4 className={`font-medium ${iepRequirements.required ? 'text-red-400' : 'text-amber-400'}`}>
                  IEP Assessment {iepRequirements.required ? 'Required' : 'Recommended'}
                </h4>
              </div>
              <p className={`text-sm ${iepRequirements.required ? 'text-red-300' : 'text-amber-300'}`}>
                {iepRequirements.required 
                  ? "Independent Environmental Professional assessment is mandatory for Category 3 water damage."
                  : "IEP assessment may be recommended based on risk factors."
                }
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="iepRequired"
                checked={remediationData.iepRequired}
                onChange={(e) => handleInputChange("iepRequired", e.target.checked)}
                className="w-5 h-5"
              />
              <label htmlFor="iepRequired" className="text-sm font-medium">
                IEP Assessment Required
              </label>
            </div>

            {remediationData.iepRequired && (
              <div>
                <label className="block text-sm font-medium mb-2">IEP Contact Information</label>
                <input
                  type="text"
                  value={remediationData.iepContact}
                  onChange={(e) => handleInputChange("iepContact", e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                  placeholder="IEP company name, contact person, phone number"
                />
              </div>
            )}

            <div>
              <h5 className="font-medium text-white mb-3">IEP Assessment Triggers</h5>
              <ul className="space-y-2">
                {iepRequirements.triggers.map((trigger, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                    {trigger}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
              <h5 className="font-medium text-blue-400 mb-2">IEP Responsibilities</h5>
              <ul className="space-y-1 text-sm text-blue-300">
                <li>• Pre-remediation assessment and sampling</li>
                <li>• Contamination level determination</li>
                <li>• Post-remediation verification</li>
                <li>• Clearance testing and documentation</li>
                <li>• Regulatory compliance verification</li>
              </ul>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-emerald-400" size={20} />
                <h4 className="font-medium text-emerald-400">Post-Remediation Verification</h4>
              </div>
              <p className="text-sm text-emerald-300">
                Final verification ensures all contamination has been properly addressed and the environment is safe for occupancy.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Post-Remediation Verification</label>
              <textarea
                value={remediationData.postRemediationVerification}
                onChange={(e) => handleInputChange("postRemediationVerification", e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                rows={4}
                placeholder="Verification procedures, clearance testing, final documentation"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-white mb-3">Verification Requirements</h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                    Visual inspection completed
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                    Air quality testing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                    Surface sampling (if required)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                    Odor elimination confirmed
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-white mb-3">Documentation Required</h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                    Clearance test results
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                    Final inspection report
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                    Certificate of completion
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />
                    Regulatory compliance documentation
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {remediationSteps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <motion.div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                activeStep >= step.id
                  ? "bg-cyan-500 border-cyan-500 text-white"
                  : "border-slate-600 text-slate-400"
              } ${!step.required ? "opacity-50" : ""}`}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {activeStep > step.id ? (
                <CheckCircle size={20} />
              ) : (
                <step.icon size={20} />
              )}
            </motion.div>
            
            {index < remediationSteps.length - 1 && (
              <div className={`w-16 h-0.5 mx-2 ${
                activeStep > step.id ? "bg-cyan-500" : "bg-slate-600"
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <motion.div
        key={activeStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
      >
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white">
            {remediationSteps[activeStep - 1]?.title}
          </h3>
          <p className="text-slate-400 text-sm">
            {remediationSteps[activeStep - 1]?.description}
          </p>
        </div>

        {renderStepContent()}
      </motion.div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
          disabled={activeStep === 1}
          className="px-6 py-3 border border-slate-600 rounded-lg text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Step {activeStep} of {remediationSteps.length}
          </span>
          
          {activeStep < remediationSteps.length ? (
            <button
              onClick={() => setActiveStep(Math.min(remediationSteps.length, activeStep + 1))}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            >
              Next Step
            </button>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle size={20} />
              <span className="font-medium">Remediation Plan Complete</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
