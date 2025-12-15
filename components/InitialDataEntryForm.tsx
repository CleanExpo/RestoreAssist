"use client"

import { useState, useEffect } from "react"
import { FileText, Calendar, MapPin, User, Phone, Mail, Save, ArrowRight, AlertTriangle, Clock } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string) => void
  initialData?: {
    clientName?: string
    clientContactDetails?: string
    propertyAddress?: string
    propertyPostcode?: string
    claimReferenceNumber?: string
    incidentDate?: string
    technicianAttendanceDate?: string
    technicianName?: string
    technicianFieldReport?: string
  }
}

// Helper function to normalize date strings to YYYY-MM-DD format
function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  
  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // Try to parse various date formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, // DD/MM/YY or DD-MM-YY
  ]
  
  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      let year, month, day
      
      if (match[3].length === 4) {
        // Full year
        if (format === formats[0]) {
          // DD/MM/YYYY
          day = match[1].padStart(2, '0')
          month = match[2].padStart(2, '0')
          year = match[3]
        } else {
          // YYYY/MM/DD
          year = match[1]
          month = match[2].padStart(2, '0')
          day = match[3].padStart(2, '0')
        }
      } else {
        // 2-digit year
        day = match[1].padStart(2, '0')
        month = match[2].padStart(2, '0')
        const twoDigitYear = parseInt(match[3])
        year = twoDigitYear > 50 ? `19${match[3]}` : `20${match[3]}`
      }
      
      return `${year}-${month}-${day}`
    }
  }
  
  // If we can't parse it, try using Date object
  try {
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return ''
}

export default function InitialDataEntryForm({ onSuccess, initialData }: InitialDataEntryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    clientName: initialData?.clientName || '',
    clientContactDetails: initialData?.clientContactDetails || '',
    propertyAddress: initialData?.propertyAddress || '',
    propertyPostcode: initialData?.propertyPostcode || '',
    claimReferenceNumber: initialData?.claimReferenceNumber || '',
    incidentDate: normalizeDate(initialData?.incidentDate || ''),
    technicianAttendanceDate: normalizeDate(initialData?.technicianAttendanceDate || ''),
    technicianName: initialData?.technicianName || '',
    technicianFieldReport: initialData?.technicianFieldReport || '',
    // Property Intelligence
    buildingAge: initialData?.buildingAge || '',
    structureType: initialData?.structureType || '',
    accessNotes: initialData?.accessNotes || '',
    // Hazard Profile
    insurerName: initialData?.insurerName || '',
    methamphetamineScreen: initialData?.methamphetamineScreen || 'NEGATIVE',
    methamphetamineTestCount: initialData?.methamphetamineTestCount || '',
    biologicalMouldDetected: initialData?.biologicalMouldDetected || false,
    biologicalMouldCategory: initialData?.biologicalMouldCategory || '',
    // Timeline Estimation
    phase1StartDate: normalizeDate(initialData?.phase1StartDate || ''),
    phase1EndDate: normalizeDate(initialData?.phase1EndDate || ''),
    phase2StartDate: normalizeDate(initialData?.phase2StartDate || ''),
    phase2EndDate: normalizeDate(initialData?.phase2EndDate || ''),
    phase3StartDate: normalizeDate(initialData?.phase3StartDate || ''),
    phase3EndDate: normalizeDate(initialData?.phase3EndDate || '')
  })

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        clientName: initialData.clientName || '',
        clientContactDetails: initialData.clientContactDetails || '',
        propertyAddress: initialData.propertyAddress || '',
        propertyPostcode: initialData.propertyPostcode || '',
        claimReferenceNumber: initialData.claimReferenceNumber || '',
        incidentDate: normalizeDate(initialData.incidentDate || ''),
        technicianAttendanceDate: normalizeDate(initialData.technicianAttendanceDate || ''),
        technicianName: initialData.technicianName || '',
        technicianFieldReport: initialData.technicianFieldReport || '',
        // Property Intelligence
        buildingAge: initialData.buildingAge || '',
        structureType: initialData.structureType || '',
        accessNotes: initialData.accessNotes || '',
        // Hazard Profile
        insurerName: initialData.insurerName || '',
        methamphetamineScreen: initialData.methamphetamineScreen || 'NEGATIVE',
        methamphetamineTestCount: initialData.methamphetamineTestCount || '',
        biologicalMouldDetected: initialData.biologicalMouldDetected || false,
        biologicalMouldCategory: initialData.biologicalMouldCategory || '',
        // Timeline Estimation
        phase1StartDate: normalizeDate(initialData.phase1StartDate || ''),
        phase1EndDate: normalizeDate(initialData.phase1EndDate || ''),
        phase2StartDate: normalizeDate(initialData.phase2StartDate || ''),
        phase2EndDate: normalizeDate(initialData.phase2EndDate || ''),
        phase3StartDate: normalizeDate(initialData.phase3StartDate || ''),
        phase3EndDate: normalizeDate(initialData.phase3EndDate || '')
      })
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Validate required fields
    if (!formData.clientName.trim()) {
      toast.error('Client name is required')
      setLoading(false)
      return
    }

    if (!formData.propertyAddress.trim()) {
      toast.error('Property address is required')
      setLoading(false)
      return
    }

    if (!formData.propertyPostcode.trim()) {
      toast.error('Property postcode is required')
      setLoading(false)
      return
    }

    if (!formData.technicianFieldReport.trim()) {
      toast.error('Technician field report is required')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/reports/initial-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          incidentDate: formData.incidentDate ? new Date(formData.incidentDate).toISOString() : null,
          technicianAttendanceDate: formData.technicianAttendanceDate ? new Date(formData.technicianAttendanceDate).toISOString() : null,
        })
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Initial data saved successfully')
        
        if (onSuccess) {
          onSuccess(data.report.id)
        } else {
          // Navigate to report detail page or next step
          router.push(`/dashboard/reports/${data.report.id}`)
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save initial data')
      }
    } catch (error) {
      console.error('Error saving initial data:', error)
      toast.error('Failed to save initial data')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-full mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Initial Data Entry</h2>
        <p className="text-slate-400">
          Enter the basic information from the technician's field report. All fields marked with * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Client Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => handleInputChange('clientName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Enter client's full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Client Contact Details
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.clientContactDetails}
                  onChange={(e) => handleInputChange('clientContactDetails', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  placeholder="Phone number, email, etc."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Property Information Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Property Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Property Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.propertyAddress}
                onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Full property address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Postcode <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={4}
                value={formData.propertyPostcode}
                onChange={(e) => handleInputChange('propertyPostcode', e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="0000"
              />
              <p className="text-xs text-slate-400 mt-1">Required for state detection and regulatory compliance</p>
            </div>
          </div>
        </div>

        {/* Claim Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Claim Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Claim Reference Number
              </label>
              <input
                type="text"
                value={formData.claimReferenceNumber}
                onChange={(e) => handleInputChange('claimReferenceNumber', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Claim reference"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Insurer / Client Name
              </label>
              <input
                type="text"
                value={formData.insurerName}
                onChange={(e) => handleInputChange('insurerName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Insurance company"
              />
            </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Date of Incident
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => handleInputChange('incidentDate', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
                </div>
              </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Technician Attendance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.technicianAttendanceDate}
                    onChange={(e) => handleInputChange('technicianAttendanceDate', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">
                Technician Name
              </label>
              <input
                type="text"
                value={formData.technicianName}
                onChange={(e) => handleInputChange('technicianName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Name of technician who attended"
              />
            </div>
          </div>
        </div>

        {/* Technician Field Report Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Technician Field Report
          </h3>

          <div>
            <label className="block text-sm font-medium mb-1">
              Technician's Field Report <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={formData.technicianFieldReport}
              onChange={(e) => handleInputChange('technicianFieldReport', e.target.value)}
              rows={6}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm"
              placeholder="Paste or type the technician's field report here..."
            />
          </div>
        </div>

        {/* Hazard Profile Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Hazard Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Methamphetamine Screen
              </label>
              <select
                value={formData.methamphetamineScreen}
                onChange={(e) => handleInputChange('methamphetamineScreen', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
              >
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="POSITIVE">POSITIVE</option>
              </select>
            </div>

            {formData.methamphetamineScreen === 'POSITIVE' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Test Count
                </label>
                <input
                  type="number"
                  value={formData.methamphetamineTestCount}
                  onChange={(e) => handleInputChange('methamphetamineTestCount', e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  placeholder="Test count"
                  min="1"
                />
              </div>
            )}

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={formData.biologicalMouldDetected}
                  onChange={(e) => handleInputChange('biologicalMouldDetected', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                Bio/Mould Detected
              </label>
            </div>

            {formData.biologicalMouldDetected && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mould Category
                </label>
                <select
                  value={formData.biologicalMouldCategory}
                  onChange={(e) => handleInputChange('biologicalMouldCategory', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                >
                  <option value="">Select category</option>
                  <option value="CAT 3">CAT 3</option>
                  <option value="CAT 2">CAT 2</option>
                  <option value="CAT 1">CAT 1</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Estimation Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timeline Estimation (Optional)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Phase 1 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 1: Make-safe</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1StartDate}
                      onChange={(e) => handleInputChange('phase1StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
            />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1EndDate}
                      onChange={(e) => handleInputChange('phase1EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 2 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 2: Remediation/Drying</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2StartDate}
                      onChange={(e) => handleInputChange('phase2StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2EndDate}
                      onChange={(e) => handleInputChange('phase2EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 3 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">Phase 3: Verification</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Start</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3StartDate}
                      onChange={(e) => handleInputChange('phase3StartDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3EndDate}
                      onChange={(e) => handleInputChange('phase3EndDate', e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                Save & Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

