"use client"

import { useState, useEffect } from "react"
import { DollarSign, Save, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

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

export default function PricingConfiguration() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<PricingConfig | null>(null)
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
    dehumidifierLGRDailyRate: 85.00,
    dehumidifierDesiccantDailyRate: 120.00,
    afdUnitLargeDailyRate: 65.00,
    extractionTruckMountedHourlyRate: 150.00,
    extractionElectricHourlyRate: 75.00,
    injectionDryingSystemDailyRate: 200.00,
    antimicrobialTreatmentRate: 8.50,
    mouldRemediationTreatmentRate: 15.00,
    biohazardTreatmentRate: 25.00,
    administrationFee: 150.00,
    callOutFee: 200.00,
    thermalCameraUseCostPerAssessment: 50.00
  })

  useEffect(() => {
    fetchPricingConfig()
  }, [])

  const fetchPricingConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/pricing-config')
      const data = await response.json()
      
      if (data.pricingConfig) {
        setConfig(data.pricingConfig)
        setFormData(data.pricingConfig)
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
    setSaving(true)
    try {
      const response = await fetch('/api/pricing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const data = await response.json()
        setConfig(data.pricingConfig)
        toast.success('Pricing configuration saved successfully')
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

  const handleInputChange = (field: keyof PricingConfig, value: string) => {
    const numValue = parseFloat(value) || 0
    setFormData(prev => ({ ...prev, [field]: numValue }))
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
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            Pricing Configuration
          </h2>
          <p className="text-slate-400 mt-1">
            Configure your company's labour rates, equipment rental rates, and fees
          </p>
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
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                      className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
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
                  className="w-full pl-8 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

