"use client"

import { useState, useEffect } from "react"
import { DollarSign, Save, RefreshCw, Plus, Trash2, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"

interface PricingConfigurationProps {
  isOnboarding?: boolean
}

interface PricingConfig {
  id?: string
  masterQualifiedNormalHours: number
  masterQualifiedSaturday: number
  masterQualifiedSunday: number
  qualifiedTechnicianNormalHours: number
  qualifiedTechnicianSaturday: number
  qualifiedTechnicianSunday: number
  labourerNormalHours: number
  labourerSaturday: number
  labourerSunday: number
  airMoverAxialDailyRate: number
  airMoverCentrifugalDailyRate: number
  dehumidifierLGRDailyRate: number
  dehumidifierDesiccantDailyRate: number
  afdUnitLargeDailyRate: number
  extractionTruckMountedHourlyRate: number
  extractionElectricHourlyRate: number
  injectionDryingSystemDailyRate: number
  antimicrobialTreatmentRate: number
  mouldRemediationTreatmentRate: number
  biohazardTreatmentRate: number
  administrationFee: number
  callOutFee: number
  thermalCameraUseCostPerAssessment: number
}

interface CustomField {
  name: string
  value: number
}

type CustomFieldsCategory = 'labour' | 'equipment' | 'chemical' | 'fees'

interface CustomFields {
  labour?: CustomField[]
  equipment?: CustomField[]
  chemical?: CustomField[]
  fees?: CustomField[]
}

export default function PricingConfiguration({ isOnboarding = false }: PricingConfigurationProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<PricingConfig | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [customFields, setCustomFields] = useState<CustomFields>({
    labour: [],
    equipment: [],
    chemical: [],
    fees: []
  })
  const [formData, setFormData] = useState<PricingConfig>({
    masterQualifiedNormalHours: 85.00,
    masterQualifiedSaturday: 127.50,
    masterQualifiedSunday: 170.00,
    qualifiedTechnicianNormalHours: 65.00,
    qualifiedTechnicianSaturday: 97.50,
    qualifiedTechnicianSunday: 130.00,
    labourerNormalHours: 45.00,
    labourerSaturday: 67.50,
    labourerSunday: 90.00,
    airMoverAxialDailyRate: 25.00,
    airMoverCentrifugalDailyRate: 35.00,
    dehumidifierLGRDailyRate: 45.00,
    dehumidifierDesiccantDailyRate: 65.00,
    afdUnitLargeDailyRate: 40.00,
    extractionTruckMountedHourlyRate: 120.00,
    extractionElectricHourlyRate: 80.00,
    injectionDryingSystemDailyRate: 150.00,
    antimicrobialTreatmentRate: 8.50,
    mouldRemediationTreatmentRate: 15.00,
    biohazardTreatmentRate: 25.00,
    administrationFee: 250.00,
    callOutFee: 150.00,
    thermalCameraUseCostPerAssessment: 75.00
  })

  useEffect(() => {
    fetchPricingConfig()
  }, [])

  const fetchPricingConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/pricing-config')
      const data = await response.json()
      
      setHasApiKey(data.hasApiKey ?? false)
      
      // Users can always edit pricing configuration
      setCanEdit(true)
      
      if (data.pricingConfig) {
        setConfig(data.pricingConfig)
        setFormData(data.pricingConfig)
        
        // Load custom fields
        if (data.pricingConfig.customFields) {
          setCustomFields({
            labour: data.pricingConfig.customFields.labour || [],
            equipment: data.pricingConfig.customFields.equipment || [],
            chemical: data.pricingConfig.customFields.chemical || [],
            fees: data.pricingConfig.customFields.fees || []
          })
        }
      } else if (data.defaults) {
        setFormData(data.defaults)
      }
    } catch (error) {
      console.error('Error fetching pricing config:', error)
      toast.error('Failed to load pricing configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('Pricing configuration cannot be modified after API key is set')
      return
    }

    setSaving(true)
    try {
      // Filter out empty custom fields
      const cleanedCustomFields: CustomFields = {}
      Object.keys(customFields).forEach(category => {
        const fields = customFields[category as CustomFieldsCategory]
        if (fields && fields.length > 0) {
          cleanedCustomFields[category as CustomFieldsCategory] = fields.filter(f => f.name.trim() !== '')
        }
      })

      const response = await fetch('/api/pricing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          customFields: Object.keys(cleanedCustomFields).length > 0 ? cleanedCustomFields : null
        })
      })

      if (response.ok) {
        const data = await response.json()
        setConfig(data.pricingConfig)
        if (data.pricingConfig.customFields) {
          setCustomFields({
            labour: data.pricingConfig.customFields.labour || [],
            equipment: data.pricingConfig.customFields.equipment || [],
            chemical: data.pricingConfig.customFields.chemical || [],
            fees: data.pricingConfig.customFields.fees || []
          })
        }
        toast.success('Pricing configuration saved successfully')
        
        // If in onboarding flow, check status and redirect to next step
        if (isOnboarding) {
          // Wait a moment for the API to update
          await new Promise(resolve => setTimeout(resolve, 500))
          
          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            if (onboardingData.nextStep) {
              const nextStepRoute = onboardingData.steps[onboardingData.nextStep]?.route
              if (nextStepRoute) {
                toast.success('Step 3 complete! Redirecting to create your first report...', { duration: 2000 })
                setTimeout(() => {
                  router.push(`${nextStepRoute}?onboarding=true`)
                }, 2000)
                return
              }
            } else {
              // All steps complete
              toast.success('Onboarding complete! Redirecting to reports...', { duration: 2000 })
              setTimeout(() => {
                router.push('/dashboard/reports/new')
              }, 2000)
              return
            }
          }
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save pricing configuration')
      }
    } catch (error) {
      console.error('Error saving pricing config:', error)
      toast.error('Failed to save pricing configuration')
    } finally {
      setSaving(false)
    }
  }

  const addCustomField = (category: CustomFieldsCategory) => {
    setCustomFields(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), { name: '', value: 0 }]
    }))
  }

  const removeCustomField = (category: CustomFieldsCategory, index: number) => {
    setCustomFields(prev => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== index)
    }))
  }

  const updateCustomField = (category: CustomFieldsCategory, index: number, field: Partial<CustomField>) => {
    setCustomFields(prev => ({
      ...prev,
      [category]: (prev[category] || []).map((f, i) => i === index ? { ...f, ...field } : f)
    }))
  }

  const handleInputChange = (field: keyof PricingConfig, value: string) => {
    const numValue = parseFloat(value) || 0
    setFormData(prev => ({ ...prev, [field]: numValue }))
  }

  const renderCustomFields = (category: CustomFieldsCategory, categoryLabel: string) => {
    const fields = customFields[category] || []
    
    return (
      <div className="mt-6 pt-6 border-t border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-slate-300">Custom {categoryLabel} Fields</h4>
          {canEdit && (
            <button
              onClick={() => addCustomField(category)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Field
            </button>
          )}
        </div>
        
        {fields.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No custom fields added yet</p>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={index} className="flex gap-3 items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Field name"
                    value={field.name}
                    onChange={(e) => updateCustomField(category, index, { name: e.target.value })}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Value"
                      value={field.value || ''}
                      onChange={(e) => updateCustomField(category, index, { value: parseFloat(e.target.value) || 0 })}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => removeCustomField(category, index)}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
         
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPricingConfig}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {hasApiKey && !config && (
        <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10 flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-400 mb-1">Initial Pricing Setup</h3>
            <p className="text-sm text-slate-300">
              Please configure your pricing to get started. You can modify it anytime.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Labour Rates Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4">Labour Rates (AUD per hour)</h3>
          
          <div className="space-y-4">
            {/* Master Qualified Technician */}
            <div className="border-l-4 border-cyan-500 pl-4">
              <h4 className="font-medium mb-3">Master Qualified Technician</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Normal Hours</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.masterQualifiedNormalHours}
                      onChange={(e) => handleInputChange('masterQualifiedNormalHours', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Saturday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.masterQualifiedSaturday}
                      onChange={(e) => handleInputChange('masterQualifiedSaturday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sunday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.masterQualifiedSunday}
                      onChange={(e) => handleInputChange('masterQualifiedSunday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Qualified Technician */}
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-medium mb-3">Qualified Technician</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Normal Hours</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.qualifiedTechnicianNormalHours}
                      onChange={(e) => handleInputChange('qualifiedTechnicianNormalHours', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Saturday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.qualifiedTechnicianSaturday}
                      onChange={(e) => handleInputChange('qualifiedTechnicianSaturday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sunday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.qualifiedTechnicianSunday}
                      onChange={(e) => handleInputChange('qualifiedTechnicianSunday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Labourer */}
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="font-medium mb-3">Labourer</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Normal Hours</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.labourerNormalHours}
                      onChange={(e) => handleInputChange('labourerNormalHours', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Saturday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.labourerSaturday}
                      onChange={(e) => handleInputChange('labourerSaturday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sunday</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.labourerSunday}
                      onChange={(e) => handleInputChange('labourerSunday', e.target.value)}
                      disabled={!canEdit}
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {renderCustomFields('labour', 'Labour')}
        </div>

        {/* Equipment Rental Rates Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4">Equipment Rental Rates</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Air Mover (Axial) - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.airMoverAxialDailyRate}
                  onChange={(e) => handleInputChange('airMoverAxialDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Air Mover (Centrifugal) - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.airMoverCentrifugalDailyRate}
                  onChange={(e) => handleInputChange('airMoverCentrifugalDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Dehumidifier (LGR) - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.dehumidifierLGRDailyRate}
                  onChange={(e) => handleInputChange('dehumidifierLGRDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Dehumidifier (Desiccant) - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.dehumidifierDesiccantDailyRate}
                  onChange={(e) => handleInputChange('dehumidifierDesiccantDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">AFD Unit (Large) - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.afdUnitLargeDailyRate}
                  onChange={(e) => handleInputChange('afdUnitLargeDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Extraction (Truck-Mounted) - Hourly Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.extractionTruckMountedHourlyRate}
                  onChange={(e) => handleInputChange('extractionTruckMountedHourlyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Extraction (Electric) - Hourly Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.extractionElectricHourlyRate}
                  onChange={(e) => handleInputChange('extractionElectricHourlyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Injection Drying System - Daily Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.injectionDryingSystemDailyRate}
                  onChange={(e) => handleInputChange('injectionDryingSystemDailyRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
          {renderCustomFields('equipment', 'Equipment')}
        </div>

        {/* Chemical Treatment Rates Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4">Chemical Treatment Rates (AUD per sqm)</h3>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Antimicrobial Treatment</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.antimicrobialTreatmentRate}
                  onChange={(e) => handleInputChange('antimicrobialTreatmentRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mould Remediation Treatment</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.mouldRemediationTreatmentRate}
                  onChange={(e) => handleInputChange('mouldRemediationTreatmentRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Biohazard Treatment</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.biohazardTreatmentRate}
                  onChange={(e) => handleInputChange('biohazardTreatmentRate', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
          {renderCustomFields('chemical', 'Chemical')}
        </div>

        {/* Fees Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4">Fees</h3>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Administration Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.administrationFee}
                  onChange={(e) => handleInputChange('administrationFee', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Call-Out Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.callOutFee}
                  onChange={(e) => handleInputChange('callOutFee', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Thermal Camera Use (per assessment)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.thermalCameraUseCostPerAssessment}
                  onChange={(e) => handleInputChange('thermalCameraUseCostPerAssessment', e.target.value)}
                  disabled={!canEdit}
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
          {renderCustomFields('fees', 'Fees')}
        </div>
      </div>
    </div>
  )
}

