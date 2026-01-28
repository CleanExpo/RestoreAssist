'use client'

import { useState, useEffect } from 'react'
import { CheckSquare, Calendar, Flag } from 'lucide-react'
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

interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultCompanyId?: string | null
  defaultContactId?: string | null
  defaultStatus?: string
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

export function TaskFormModal({
  open,
  onClose,
  onSuccess,
  defaultCompanyId,
  defaultContactId,
  defaultStatus = 'PENDING',
}: TaskFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    reminderDate: '',
    priority: 'MEDIUM',
    status: defaultStatus,
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
    // Set default due date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const defaultDueDate = tomorrow.toISOString().slice(0, 10)

    setFormData({
      title: '',
      description: '',
      dueDate: defaultDueDate,
      reminderDate: '',
      priority: 'MEDIUM',
      status: defaultStatus,
      companyId: defaultCompanyId || '',
      contactId: defaultContactId || '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast.error('Task title is required')
      return
    }

    try {
      setLoading(true)

      const payload: any = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        reminderDate: formData.reminderDate
          ? new Date(formData.reminderDate).toISOString()
          : null,
        priority: formData.priority,
        status: formData.status,
        companyId: formData.companyId || null,
        contactId: formData.contactId || null,
      }

      const response = await fetch('/api/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success('Task created successfully')
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create task')
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('An error occurred while creating the task')
    } finally {
      setLoading(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'text-red-600 dark:text-red-400'
      case 'HIGH':
        return 'text-orange-600 dark:text-orange-400'
      case 'MEDIUM':
        return 'text-blue-600 dark:text-blue-400'
      case 'LOW':
        return 'text-slate-600 dark:text-slate-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-cyan-500" />
            Create Task
          </DialogTitle>
          <DialogDescription>
            Add a new task to track and manage follow-ups
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Task Details
            </h3>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Title <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Enter task title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Detailed description of the task..."
                  rows={3}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Flag className={`h-3.5 w-3.5 ${getPriorityColor(formData.priority)}`} />
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="PENDING">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reminder Date
                </label>
                <Input
                  type="date"
                  value={formData.reminderDate}
                  onChange={(e) =>
                    setFormData({ ...formData, reminderDate: e.target.value })
                  }
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  You'll receive a reminder on this date
                </p>
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

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Link this task to a company or contact for better organization
            </p>
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
              disabled={loading || !formData.title.trim()}
              className="bg-cyan-500 hover:bg-cyan-600"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
