'use client'

import { useState, useEffect } from 'react'
import { Activity, Calendar } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface ActivityFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultCompanyId?: string | null
  defaultContactId?: string | null
}

interface Company {
  id: string
  name: string
}

interface Contact {
  id: string
  fullName: string
  company?: { name: string }
}

export function ActivityFormModal({
  open,
  onClose,
  onSuccess,
  defaultCompanyId,
  defaultContactId,
}: ActivityFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [formData, setFormData] = useState({
    type: 'CALL',
    subject: '',
    description: '',
    outcome: '',
    activityDate: new Date().toISOString().slice(0, 16),
    duration: '',
    companyId: defaultCompanyId || '',
    contactId: defaultContactId || '',
  })

  useEffect(() => {
    if (open) {
      fetchCompanies()
      fetchContacts()
      resetForm()
    }
  }, [open])

  useEffect(() => {
    if (formData.companyId) {
      fetchContactsByCompany(formData.companyId)
    }
  }, [formData.companyId])

  const fetchCompanies = async () => {
    try {
      const response = await fetch('/api/crm/companies?limit=100')
      if (response.ok) {
        const data = await response.json()
        setCompanies(data.companies || [])
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error)
    }
  }

  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/crm/contacts?limit=100')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    }
  }

  const fetchContactsByCompany = async (companyId: string) => {
    try {
      const response = await fetch(`/api/crm/companies/${companyId}/contacts`)
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
      }
    } catch (error) {
      console.error('Failed to fetch company contacts:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      type: 'CALL',
      subject: '',
      description: '',
      outcome: '',
      activityDate: new Date().toISOString().slice(0, 16),
      duration: '',
      companyId: defaultCompanyId || '',
      contactId: defaultContactId || '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.subject.trim()) {
      toast.error('Subject is required')
      return
    }

    if (!formData.companyId && !formData.contactId) {
      toast.error('Please select at least a company or contact')
      return
    }

    try {
      setLoading(true)

      const payload: any = {
        type: formData.type,
        subject: formData.subject.trim(),
        description: formData.description.trim() || null,
        outcome: formData.outcome.trim() || null,
        activityDate: new Date(formData.activityDate).toISOString(),
        duration: formData.duration ? parseInt(formData.duration) : null,
        companyId: formData.companyId || null,
        contactId: formData.contactId || null,
      }

      const response = await fetch('/api/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success('Activity logged successfully')
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to log activity')
      }
    } catch (error) {
      console.error('Failed to log activity:', error)
      toast.error('An error occurred while logging the activity')
    } finally {
      setLoading(false)
    }
  }

  const activityTypes = [
    { value: 'CALL', label: 'Phone Call' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'MEETING', label: 'Meeting' },
    { value: 'SITE_VISIT', label: 'Site Visit' },
    { value: 'NOTE', label: 'Note' },
    { value: 'QUOTE_SENT', label: 'Quote Sent' },
    { value: 'FOLLOW_UP', label: 'Follow Up' },
    { value: 'PORTAL_ACCESS', label: 'Portal Access' },
    { value: 'APPROVAL', label: 'Approval' },
    { value: 'OTHER', label: 'Other' },
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-500" />
            Log Activity
          </DialogTitle>
          <DialogDescription>
            Record a new interaction with a company or contact
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Activity Type */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Activity Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Activity Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                >
                  {activityTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  placeholder="Brief description of the activity"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Date & Time <span className="text-red-500">*</span>
                </label>
                <Input
                  type="datetime-local"
                  value={formData.activityDate}
                  onChange={(e) =>
                    setFormData({ ...formData, activityDate: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Duration (minutes)
                </label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData({ ...formData, duration: e.target.value })
                  }
                  placeholder="e.g., 30"
                  min="0"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Detailed notes about this activity..."
                  rows={3}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Outcome
                </label>
                <Input
                  value={formData.outcome}
                  onChange={(e) =>
                    setFormData({ ...formData, outcome: e.target.value })
                  }
                  placeholder="Result or next steps"
                />
              </div>
            </div>
          </div>

          {/* Related Entities */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Related To
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Company
                </label>
                <select
                  value={formData.companyId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      companyId: e.target.value,
                      contactId: '', // Reset contact when company changes
                    })
                  }
                  className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select company (optional)</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contact
                </label>
                <select
                  value={formData.contactId}
                  onChange={(e) =>
                    setFormData({ ...formData, contactId: e.target.value })
                  }
                  className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  disabled={!contacts.length}
                >
                  <option value="">Select contact (optional)</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.fullName}
                      {contact.company && ` (${contact.company.name})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!formData.companyId && !formData.contactId && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Please select at least a company or contact for this activity
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !formData.subject.trim() ||
                (!formData.companyId && !formData.contactId)
              }
              className="bg-cyan-500 hover:bg-cyan-600"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Logging...
                </>
              ) : (
                'Log Activity'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
