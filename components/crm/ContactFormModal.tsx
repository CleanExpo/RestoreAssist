'use client'

import { useState, useEffect } from 'react'
import { User, Mail, Phone, Smartphone, MapPin, Building2 } from 'lucide-react'
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
import { TagPicker } from './TagPicker'

interface ContactFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  contactId?: string | null
  defaultCompanyId?: string | null
}

interface Contact {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone?: string
  mobilePhone?: string
  title?: string
  companyId?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  preferredContactMethod?: string
  doNotEmail?: boolean
  doNotCall?: boolean
  status?: string
  lifecycleStage?: string
  isPrimaryContact?: boolean
  relationshipScore?: number
  notes?: string
  contactTags?: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
}

interface Company {
  id: string
  name: string
}

interface Tag {
  id: string
  name: string
  color: string
  category?: string
}

export function ContactFormModal({
  open,
  onClose,
  onSuccess,
  contactId,
  defaultCompanyId,
}: ContactFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobilePhone: '',
    title: '',
    companyId: defaultCompanyId || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postcode: '',
    country: 'Australia',
    preferredContactMethod: 'EMAIL',
    doNotEmail: false,
    doNotCall: false,
    status: 'ACTIVE',
    lifecycleStage: 'LEAD',
    isPrimaryContact: false,
    relationshipScore: '',
    notes: '',
    tagIds: [] as string[],
  })

  useEffect(() => {
    if (open) {
      fetchCompanies()
      fetchTags()
      if (contactId) {
        fetchContact()
      } else {
        resetForm()
      }
    }
  }, [open, contactId])

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

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/crm/tags?limit=100')
      if (response.ok) {
        const data = await response.json()
        setTags(data.tags || [])
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    }
  }

  const fetchContact = async () => {
    if (!contactId) return

    try {
      setLoadingData(true)
      const response = await fetch(`/api/crm/contacts/${contactId}`)
      if (response.ok) {
        const data = await response.json()
        const contact: Contact = data.contact
        setFormData({
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          email: contact.email || '',
          phone: contact.phone || '',
          mobilePhone: contact.mobilePhone || '',
          title: contact.title || '',
          companyId: contact.companyId || '',
          addressLine1: contact.addressLine1 || '',
          addressLine2: contact.addressLine2 || '',
          city: contact.city || '',
          state: contact.state || '',
          postcode: contact.postcode || '',
          country: contact.country || 'Australia',
          preferredContactMethod: contact.preferredContactMethod || 'EMAIL',
          doNotEmail: contact.doNotEmail || false,
          doNotCall: contact.doNotCall || false,
          status: contact.status || 'ACTIVE',
          lifecycleStage: contact.lifecycleStage || 'LEAD',
          isPrimaryContact: contact.isPrimaryContact || false,
          relationshipScore: contact.relationshipScore?.toString() || '',
          notes: contact.notes || '',
          tagIds: contact.contactTags?.map((ct) => ct.tag.id) || [],
        })
      }
    } catch (error) {
      console.error('Failed to fetch contact:', error)
      toast.error('Failed to load contact data')
    } finally {
      setLoadingData(false)
    }
  }

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      mobilePhone: '',
      title: '',
      companyId: defaultCompanyId || '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postcode: '',
      country: 'Australia',
      preferredContactMethod: 'EMAIL',
      doNotEmail: false,
      doNotCall: false,
      status: 'ACTIVE',
      lifecycleStage: 'LEAD',
      isPrimaryContact: false,
      relationshipScore: '',
      notes: '',
      tagIds: [],
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('First name and last name are required')
      return
    }

    if (!formData.email.trim()) {
      toast.error('Email is required')
      return
    }

    try {
      setLoading(true)

      const payload: any = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        fullName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        mobilePhone: formData.mobilePhone.trim() || null,
        title: formData.title.trim() || null,
        companyId: formData.companyId || null,
        addressLine1: formData.addressLine1.trim() || null,
        addressLine2: formData.addressLine2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        postcode: formData.postcode.trim() || null,
        country: formData.country.trim() || 'Australia',
        preferredContactMethod: formData.preferredContactMethod,
        doNotEmail: formData.doNotEmail,
        doNotCall: formData.doNotCall,
        status: formData.status,
        lifecycleStage: formData.lifecycleStage,
        isPrimaryContact: formData.isPrimaryContact,
        relationshipScore: formData.relationshipScore
          ? parseInt(formData.relationshipScore)
          : null,
        notes: formData.notes.trim() || null,
        tagIds: formData.tagIds,
      }

      const url = contactId
        ? `/api/crm/contacts/${contactId}`
        : '/api/crm/contacts'
      const method = contactId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success(
          contactId ? 'Contact updated successfully' : 'Contact created successfully'
        )
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to save contact')
      }
    } catch (error) {
      console.error('Failed to save contact:', error)
      toast.error('An error occurred while saving the contact')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTag = async (name: string, color: string): Promise<Tag> => {
    const response = await fetch('/api/crm/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })

    if (!response.ok) {
      throw new Error('Failed to create tag')
    }

    const data = await response.json()
    const newTag = data.tag

    // Update tags list
    setTags((prev) => [...prev, newTag])

    return newTag
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-cyan-500" />
            {contactId ? 'Edit Contact' : 'Create Contact'}
          </DialogTitle>
          <DialogDescription>
            {contactId
              ? 'Update contact information and details'
              : 'Add a new contact to your CRM'}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Basic Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    placeholder="Enter first name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    placeholder="Enter last name"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Job Title
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="e.g., Property Manager, Director"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    Company
                  </label>
                  <select
                    value={formData.companyId}
                    onChange={(e) =>
                      setFormData({ ...formData, companyId: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">No company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lifecycle Stage
                  </label>
                  <select
                    value={formData.lifecycleStage}
                    onChange={(e) =>
                      setFormData({ ...formData, lifecycleStage: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="LEAD">Lead</option>
                    <option value="QUALIFIED_LEAD">Qualified Lead</option>
                    <option value="CUSTOMER">Customer</option>
                    <option value="REPEAT_CUSTOMER">Repeat Customer</option>
                    <option value="VIP_CUSTOMER">VIP Customer</option>
                    <option value="CHURNED">Churned</option>
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
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="PROSPECT">Prospect</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="DO_NOT_CONTACT">Do Not Contact</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Contact Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="contact@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="(02) 1234 5678"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Smartphone className="h-3.5 w-3.5" />
                    Mobile
                  </label>
                  <Input
                    type="tel"
                    value={formData.mobilePhone}
                    onChange={(e) =>
                      setFormData({ ...formData, mobilePhone: e.target.value })
                    }
                    placeholder="04XX XXX XXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Preferred Contact Method
                  </label>
                  <select
                    value={formData.preferredContactMethod}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        preferredContactMethod: e.target.value,
                      })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="EMAIL">Email</option>
                    <option value="PHONE">Phone</option>
                    <option value="SMS">SMS</option>
                    <option value="MOBILE">Mobile</option>
                    <option value="ANY">Any</option>
                  </select>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPrimaryContact}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isPrimaryContact: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Primary Contact
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.doNotEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, doNotEmail: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Do Not Email
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.doNotCall}
                    onChange={(e) =>
                      setFormData({ ...formData, doNotCall: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Do Not Call
                  </span>
                </label>
              </div>
            </div>

            {/* Address (if no company) */}
            {!formData.companyId && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Address
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <Input
                    value={formData.addressLine1}
                    onChange={(e) =>
                      setFormData({ ...formData, addressLine1: e.target.value })
                    }
                    placeholder="Address Line 1"
                  />

                  <Input
                    value={formData.addressLine2}
                    onChange={(e) =>
                      setFormData({ ...formData, addressLine2: e.target.value })
                    }
                    placeholder="Address Line 2"
                  />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Input
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      placeholder="City"
                    />

                    <Input
                      value={formData.state}
                      onChange={(e) =>
                        setFormData({ ...formData, state: e.target.value })
                      }
                      placeholder="State"
                    />

                    <Input
                      value={formData.postcode}
                      onChange={(e) =>
                        setFormData({ ...formData, postcode: e.target.value })
                      }
                      placeholder="Postcode"
                    />

                    <Input
                      value={formData.country}
                      onChange={(e) =>
                        setFormData({ ...formData, country: e.target.value })
                      }
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Notes
              </h3>

              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes about this contact..."
                rows={3}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* Tags */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Tags
              </h3>

              <TagPicker
                tags={tags}
                selectedTagIds={formData.tagIds}
                onTagsChange={(tagIds) =>
                  setFormData({ ...formData, tagIds })
                }
                onCreateTag={handleCreateTag}
                placeholder="Add tags..."
              />
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
                  !formData.firstName.trim() ||
                  !formData.lastName.trim() ||
                  !formData.email.trim()
                }
                className="bg-cyan-500 hover:bg-cyan-600"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {contactId ? 'Updating...' : 'Creating...'}
                  </>
                ) : contactId ? (
                  'Update Contact'
                ) : (
                  'Create Contact'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
