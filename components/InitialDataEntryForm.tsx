"use client"

import { useState } from "react"
import { FileText, Calendar, MapPin, User, Phone, Mail, Save, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string) => void
}

export default function InitialDataEntryForm({ onSuccess }: InitialDataEntryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    clientName: '',
    clientContactDetails: '',
    propertyAddress: '',
    propertyPostcode: '',
    claimReferenceNumber: '',
    incidentDate: '',
    technicianAttendanceDate: '',
    technicianName: '',
    technicianFieldReport: ''
  })

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

