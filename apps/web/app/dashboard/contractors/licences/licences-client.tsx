'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Award,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Filter,
  X,
  Loader2,
} from 'lucide-react'

interface Licence {
  id: string
  licenceType: string
  licenceNumber: string | null
  issuingAuthority: string | null
  expiryDate: string | null
  documentUrl: string | null
  isActive: boolean
  createdAt: string
}

const LICENCE_TYPES = [
  { value: 'BUILDERS_LICENCE', label: "Builder's Licence" },
  { value: 'WHS_WHITE_CARD', label: 'WHS White Card' },
  { value: 'ELECTRICAL', label: 'Electrical Licence' },
  { value: 'PLUMBING', label: 'Plumbing Licence' },
  { value: 'IICRC_MEMBERSHIP', label: 'IICRC Membership' },
  { value: 'NRPG_MEMBERSHIP', label: 'NRPG Membership' },
  { value: 'ABN_REGISTRATION', label: 'ABN Registration' },
  { value: 'OTHER', label: 'Other' },
] as const

const LICENCE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LICENCE_TYPES.map(({ value, label }) => [value, label])
)

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const now = new Date()
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function getExpiryStatus(dateStr: string | null): 'active' | 'expiring' | 'expired' | 'no-expiry' {
  if (!dateStr) return 'no-expiry'
  const days = daysUntilExpiry(dateStr)
  if (days === null) return 'no-expiry'
  if (days < 0) return 'expired'
  if (days <= 60) return 'expiring'
  return 'active'
}

export function LicenceManager() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [licences, setLicences] = useState<Licence[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [form, setForm] = useState({
    licenceType: 'BUILDERS_LICENCE',
    licenceNumber: '',
    issuingAuthority: '',
    expiryDate: '',
    documentUrl: '',
  })

  const resetForm = () => {
    setForm({
      licenceType: 'BUILDERS_LICENCE',
      licenceNumber: '',
      issuingAuthority: '',
      expiryDate: '',
      documentUrl: '',
    })
    setEditingId(null)
  }

  const fetchLicences = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') params.set('licenceType', filterType)
      const res = await fetch(`/api/contractors/licences?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLicences(data.licences || [])
      }
    } catch (err) {
      console.error('Failed to fetch licences:', err)
    } finally {
      setLoading(false)
    }
  }, [filterType])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchLicences()
    }
  }, [status, router, fetchLicences])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingId
        ? `/api/contractors/licences/${editingId}`
        : '/api/contractors/licences'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expiryDate: form.expiryDate || null,
          documentUrl: form.documentUrl || null,
        }),
      })

      if (res.ok) {
        setMessage({
          type: 'success',
          text: editingId ? 'Licence updated successfully.' : 'Licence added successfully.',
        })
        setShowForm(false)
        resetForm()
        fetchLicences()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to save licence.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    }
    setTimeout(() => setMessage(null), 4000)
  }

  const handleEdit = (item: Licence) => {
    setForm({
      licenceType: item.licenceType,
      licenceNumber: item.licenceNumber || '',
      issuingAuthority: item.issuingAuthority || '',
      expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
      documentUrl: item.documentUrl || '',
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this licence record?')) return
    try {
      const res = await fetch(`/api/contractors/licences/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setLicences(prev => prev.filter(l => l.id !== id))
        setMessage({ type: 'success', text: 'Licence removed.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete.' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  if (status === 'loading' || (loading && session)) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[#1C2E47]/40 animate-pulse" />
        ))}
      </div>
    )
  }

  const expiredCount = licences.filter(l => getExpiryStatus(l.expiryDate) === 'expired').length
  const expiringCount = licences.filter(l => getExpiryStatus(l.expiryDate) === 'expiring').length
  const activeCount = licences.filter(l => {
    const s = getExpiryStatus(l.expiryDate)
    return s === 'active' || s === 'no-expiry'
  }).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
            <Award className="h-6 w-6 text-[#8A6B4E]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#F4F5F6]">Licence Management</h1>
            <p className="text-sm text-[#C4C8CA]">Track licences, certifications, and memberships</p>
          </div>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(v => !v)
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8A6B4E] text-white hover:bg-[#8A6B4E]/90 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Licence
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Total Licences</p>
          <p className="text-2xl font-bold text-[#F4F5F6]">{licences.length}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-amber-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Expiring Soon</p>
          <p className="text-2xl font-bold text-amber-400">{expiringCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-red-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Expired</p>
          <p className="text-2xl font-bold text-red-400">{expiredCount}</p>
        </div>
      </div>

      {/* Alert banner */}
      {expiredCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{expiredCount} licence{expiredCount > 1 ? 's' : ''}</strong> {expiredCount > 1 ? 'have' : 'has'} expired. Renew immediately to maintain compliance.
          </p>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-5 rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/30"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#F4F5F6]">
              {editingId ? 'Edit Licence' : 'Add Licence'}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}>
              <X className="h-4 w-4 text-[#C4C8CA]" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Licence Type *</label>
              <select
                required
                value={form.licenceType}
                onChange={e => setForm(f => ({ ...f, licenceType: e.target.value }))}
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              >
                {LICENCE_TYPES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Licence Number</label>
              <input
                value={form.licenceNumber}
                onChange={e => setForm(f => ({ ...f, licenceNumber: e.target.value }))}
                placeholder="e.g. BLD-123456"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Issuing Authority</label>
              <input
                value={form.issuingAuthority}
                onChange={e => setForm(f => ({ ...f, issuingAuthority: e.target.value }))}
                placeholder="e.g. NSW Fair Trading"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-[#C4C8CA] mb-1 block">Document URL</label>
              <input
                type="url"
                value={form.documentUrl}
                onChange={e => setForm(f => ({ ...f, documentUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#8A6B4E] text-white text-sm font-medium hover:bg-[#8A6B4E]/90"
            >
              {editingId ? 'Update Licence' : 'Save Licence'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 rounded-lg bg-[#5A6A7B]/20 text-[#C4C8CA] text-sm hover:bg-[#5A6A7B]/30"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-[#C4C8CA]" />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-xs px-3 py-1.5 focus:outline-none"
        >
          <option value="all">All Types</option>
          {LICENCE_TYPES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Licence List */}
      {licences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-[#1C2E47]/60 mb-4">
            <Award className="h-8 w-8 text-[#5A6A7B]" />
          </div>
          <p className="text-[#F4F5F6] font-medium mb-1">No licences recorded</p>
          <p className="text-sm text-[#C4C8CA]">Add your builder&apos;s licence, WHS white card, trade licences, and memberships.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {licences.map(item => {
            const expiryStatus = getExpiryStatus(item.expiryDate)
            const days = daysUntilExpiry(item.expiryDate)
            return (
              <div
                key={item.id}
                className={`rounded-xl bg-[#1C2E47]/60 border p-4 transition-colors ${
                  expiryStatus === 'expired'
                    ? 'border-red-500/40'
                    : expiryStatus === 'expiring'
                    ? 'border-amber-500/40'
                    : 'border-[#5A6A7B]/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-[#F4F5F6] truncate">
                        {LICENCE_TYPE_LABELS[item.licenceType] ?? item.licenceType}
                      </span>
                      {expiryStatus === 'active' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      )}
                      {expiryStatus === 'no-expiry' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#5A6A7B]/20 text-[#C4C8CA]">
                          No Expiry
                        </span>
                      )}
                      {expiryStatus === 'expiring' && days !== null && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Expiring in {days} days
                        </span>
                      )}
                      {expiryStatus === 'expired' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Expired
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#C4C8CA]">
                      {item.licenceNumber && <span>Number: {item.licenceNumber}</span>}
                      {item.issuingAuthority && <span>Authority: {item.issuingAuthority}</span>}
                    </div>
                    {item.expiryDate && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#C4C8CA] mt-1">
                        <span className={expiryStatus === 'expired' ? 'text-red-400' : expiryStatus === 'expiring' ? 'text-amber-400' : ''}>
                          Expires: {new Date(item.expiryDate).toLocaleDateString('en-AU')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.documentUrl && (
                      <a
                        href={item.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-[#5A6A7B]/20 text-[#C4C8CA] hover:text-[#F4F5F6] transition-colors"
                        title="View document"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-1.5 rounded-lg hover:bg-[#5A6A7B]/20 text-[#C4C8CA] hover:text-[#F4F5F6] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-[#C4C8CA] hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
