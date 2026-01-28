'use client'

import { useState, useEffect } from 'react'
import { X, Building2, Globe, Mail, Phone, MapPin } from 'lucide-react'
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

interface CompanyFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  companyId?: string | null
}

interface Company {
  id: string
  name: string
  industry?: string
  website?: string
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  abn?: string
  acn?: string
  description?: string
  companySize?: string
  lifecycleStage?: string
  status?: string
  potentialRevenue?: number
  companyTags?: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
}

interface Tag {
  id: string
  name: string
  color: string
  category?: string
}

export function CompanyFormModal({
  open,
  onClose,
  onSuccess,
  companyId,
}: CompanyFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [tags, setTags] = useState<Tag[]>([])
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postcode: '',
    country: 'Australia',
    abn: '',
    acn: '',
    description: '',
    companySize: 'SMALL',
    lifecycleStage: 'LEAD',
    status: 'ACTIVE',
    potentialRevenue: '',
    tagIds: [] as string[],
  })

  useEffect(() => {
    if (open) {
      fetchTags()
      if (companyId) {
        fetchCompany()
      } else {
        resetForm()
      }
    }
  }, [open, companyId])

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

  const fetchCompany = async () => {
    if (!companyId) return

    try {
      setLoadingData(true)
      const response = await fetch(`/api/crm/companies/${companyId}`)
      if (response.ok) {
        const data = await response.json()
        const company: Company = data.company
        setFormData({
          name: company.name || '',
          industry: company.industry || '',
          website: company.website || '',
          email: company.email || '',
          phone: company.phone || '',
          addressLine1: company.addressLine1 || '',
          addressLine2: company.addressLine2 || '',
          city: company.city || '',
          state: company.state || '',
          postcode: company.postcode || '',
          country: company.country || 'Australia',
          abn: company.abn || '',
          acn: company.acn || '',
          description: company.description || '',
          companySize: company.companySize || 'SMALL',
          lifecycleStage: company.lifecycleStage || 'LEAD',
          status: company.status || 'ACTIVE',
          potentialRevenue: company.potentialRevenue?.toString() || '',
          tagIds: company.companyTags?.map((ct) => ct.tag.id) || [],
        })
      }
    } catch (error) {
      console.error('Failed to fetch company:', error)
      toast.error('Failed to load company data')
    } finally {
      setLoadingData(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      industry: '',
      website: '',
      email: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postcode: '',
      country: 'Australia',
      abn: '',
      acn: '',
      description: '',
      companySize: 'SMALL',
      lifecycleStage: 'LEAD',
      status: 'ACTIVE',
      potentialRevenue: '',
      tagIds: [],
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Company name is required')
      return
    }

    try {
      setLoading(true)

      const payload: any = {
        name: formData.name.trim(),
        industry: formData.industry.trim() || null,
        website: formData.website.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        addressLine1: formData.addressLine1.trim() || null,
        addressLine2: formData.addressLine2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        postcode: formData.postcode.trim() || null,
        country: formData.country.trim() || 'Australia',
        abn: formData.abn.trim() || null,
        acn: formData.acn.trim() || null,
        description: formData.description.trim() || null,
        companySize: formData.companySize,
        lifecycleStage: formData.lifecycleStage,
        status: formData.status,
        potentialRevenue: formData.potentialRevenue
          ? parseFloat(formData.potentialRevenue)
          : null,
        tagIds: formData.tagIds,
      }

      const url = companyId
        ? `/api/crm/companies/${companyId}`
        : '/api/crm/companies'
      const method = companyId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success(
          companyId ? 'Company updated successfully' : 'Company created successfully'
        )
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to save company')
      }
    } catch (error) {
      console.error('Failed to save company:', error)
      toast.error('An error occurred while saving the company')
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
            <Building2 className="h-5 w-5 text-cyan-500" />
            {companyId ? 'Edit Company' : 'Create Company'}
          </DialogTitle>
          <DialogDescription>
            {companyId
              ? 'Update company information and details'
              : 'Add a new company to your CRM'}
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter company name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Industry
                  </label>
                  <Input
                    value={formData.industry}
                    onChange={(e) =>
                      setFormData({ ...formData, industry: e.target.value })
                    }
                    placeholder="e.g., Construction, Insurance"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company Size
                  </label>
                  <select
                    value={formData.companySize}
                    onChange={(e) =>
                      setFormData({ ...formData, companySize: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="SOLE_TRADER">Sole Trader</option>
                    <option value="SMALL">Small (2-10)</option>
                    <option value="MEDIUM">Medium (11-50)</option>
                    <option value="LARGE">Large (51-200)</option>
                    <option value="ENTERPRISE">Enterprise (200+)</option>
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
                    <option value="OPPORTUNITY">Opportunity</option>
                    <option value="CUSTOMER">Customer</option>
                    <option value="REPEAT_CUSTOMER">Repeat Customer</option>
                    <option value="VIP_CUSTOMER">VIP Customer</option>
                    <option value="PARTNER">Partner</option>
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="company@example.com"
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

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </label>
                  <Input
                    type="url"
                    value={formData.website}
                    onChange={(e) =>
                      setFormData({ ...formData, website: e.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
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

            {/* Business Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Business Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  value={formData.abn}
                  onChange={(e) =>
                    setFormData({ ...formData, abn: e.target.value })
                  }
                  placeholder="ABN"
                />

                <Input
                  value={formData.acn}
                  onChange={(e) =>
                    setFormData({ ...formData, acn: e.target.value })
                  }
                  placeholder="ACN"
                />

                <Input
                  type="number"
                  value={formData.potentialRevenue}
                  onChange={(e) =>
                    setFormData({ ...formData, potentialRevenue: e.target.value })
                  }
                  placeholder="Potential Revenue ($)"
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
                  placeholder="Additional notes about this company..."
                  rows={3}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
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
                disabled={loading || !formData.name.trim()}
                className="bg-cyan-500 hover:bg-cyan-600"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {companyId ? 'Updating...' : 'Creating...'}
                  </>
                ) : companyId ? (
                  'Update Company'
                ) : (
                  'Create Company'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
