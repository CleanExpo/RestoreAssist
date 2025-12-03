"use client"

import { useState, useEffect } from "react"
import { FileText, Calendar, MapPin, User, Phone, Mail, Save, ArrowRight } from "lucide-react"
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
    technicianFieldReport: initialData?.technicianFieldReport || ''
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
        technicianFieldReport: initialData.technicianFieldReport || ''
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Initial Data Entry</h2>
        <p className="text-slate-400">
          Enter the basic information from the technician's field report. All fields marked with * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client Information Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Client Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => handleInputChange('clientName', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Enter client's full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Client Contact Details
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.clientContactDetails}
                  onChange={(e) => handleInputChange('clientContactDetails', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
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
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Claim Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Claim Reference Number
              </label>
              <input
                type="text"
                value={formData.claimReferenceNumber}
                onChange={(e) => handleInputChange('claimReferenceNumber', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="If an existing claim reference exists"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date of Incident
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => handleInputChange('incidentDate', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Technician Attendance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.technicianAttendanceDate}
                    onChange={(e) => handleInputChange('technicianAttendanceDate', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Technician Name
              </label>
              <input
                type="text"
                value={formData.technicianName}
                onChange={(e) => handleInputChange('technicianName', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Name of technician who attended (if available)"
              />
            </div>
          </div>
        </div>

        {/* Technician Field Report Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Technician Field Report
          </h3>

          <div>
            <label className="block text-sm font-medium mb-2">
              Technician's Field Report <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={formData.technicianFieldReport}
              onChange={(e) => handleInputChange('technicianFieldReport', e.target.value)}
              rows={12}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm"
              placeholder="Paste or type the technician's field report here. Include observations, affected areas, equipment deployed, moisture readings, and any other relevant details..."
            />
            <p className="text-xs text-slate-400 mt-2">
              This report will be analyzed to identify affected areas, water source, materials, and equipment deployed.
            </p>
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

