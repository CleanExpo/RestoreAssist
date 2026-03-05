'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Wrench,
  Plus,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Filter,
  X,
  Bell,
  Loader2,
} from 'lucide-react'

interface Equipment {
  id: string
  equipmentName: string
  make: string | null
  model: string | null
  serialNumber: string | null
  category: string
  isVerified: boolean
  lastCalibrated: string | null
  calibrationDue: string | null
  calibrationCertUrl: string | null
  createdAt: string
}

const CATEGORIES = [
  { value: 'MOISTURE_METER', label: 'Moisture Meter' },
  { value: 'AIR_MOVER', label: 'Air Mover' },
  { value: 'DEHUMIDIFIER', label: 'Dehumidifier' },
  { value: 'THERMAL_CAMERA', label: 'Thermal Camera' },
  { value: 'OTHER', label: 'Other' },
] as const

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(({ value, label }) => [value, label])
)

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false
  const due = new Date(dateStr)
  const now = new Date()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  return due.getTime() - now.getTime() < thirtyDays && due > now
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

export function EquipmentVerification() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterVerified, setFilterVerified] = useState<string>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [checkingReminders, setCheckingReminders] = useState(false)
  const [reminderSummary, setReminderSummary] = useState<{
    overdue: number
    due7: number
    due14: number
    due30: number
    totalNotificationsCreated: number
  } | null>(null)

  const [form, setForm] = useState({
    equipmentName: '',
    make: '',
    model: '',
    serialNumber: '',
    category: 'MOISTURE_METER',
    lastCalibrated: '',
    calibrationDue: '',
    calibrationCertUrl: '',
  })

  const fetchEquipment = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'all') params.set('category', filterCategory)
      if (filterVerified !== 'all') params.set('verified', filterVerified)
      const res = await fetch(`/api/contractors/equipment?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEquipment(data.equipment || [])
      }
    } catch (err) {
      console.error('Failed to fetch equipment:', err)
    } finally {
      setLoading(false)
    }
  }, [filterCategory, filterVerified])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchEquipment()
    }
  }, [status, router, fetchEquipment])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/contractors/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          lastCalibrated: form.lastCalibrated || null,
          calibrationDue: form.calibrationDue || null,
          calibrationCertUrl: form.calibrationCertUrl || null,
        }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Equipment added successfully.' })
        setShowAddForm(false)
        setForm({
          equipmentName: '',
          make: '',
          model: '',
          serialNumber: '',
          category: 'MOISTURE_METER',
          lastCalibrated: '',
          calibrationDue: '',
          calibrationCertUrl: '',
        })
        fetchEquipment()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to add equipment.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    }
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this equipment record?')) return
    try {
      const res = await fetch(`/api/contractors/equipment/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEquipment(prev => prev.filter(e => e.id !== id))
        setMessage({ type: 'success', text: 'Equipment removed.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete.' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const handleVerify = async (id: string) => {
    try {
      const res = await fetch(`/api/contractors/equipment/${id}/verify`, { method: 'POST' })
      if (res.ok) {
        setEquipment(prev =>
          prev.map(e => (e.id === id ? { ...e, isVerified: true } : e))
        )
        setMessage({ type: 'success', text: 'Equipment verified.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to verify.' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const handleCheckReminders = async () => {
    setCheckingReminders(true)
    setReminderSummary(null)
    try {
      const res = await fetch('/api/contractors/equipment/check-calibration', {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setReminderSummary(data.summary)
        setMessage({
          type: 'success',
          text: `Calibration check complete. ${data.summary.totalNotificationsCreated} notification${data.summary.totalNotificationsCreated !== 1 ? 's' : ''} created.`,
        })
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to check reminders.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error checking reminders.' })
    } finally {
      setCheckingReminders(false)
    }
    setTimeout(() => setMessage(null), 5000)
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

  const overdueCount = equipment.filter(e => isOverdue(e.calibrationDue)).length
  const expiringSoonCount = equipment.filter(e => isExpiringSoon(e.calibrationDue)).length
  const verifiedCount = equipment.filter(e => e.isVerified).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
            <Wrench className="h-6 w-6 text-[#8A6B4E]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#F4F5F6]">Equipment Verification</h1>
            <p className="text-sm text-[#C4C8CA]">Track calibration compliance for restoration equipment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckReminders}
            disabled={checkingReminders}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] hover:bg-[#1C2E47]/80 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {checkingReminders ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Check Reminders
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8A6B4E] text-white hover:bg-[#8A6B4E]/90 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Equipment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Total Items</p>
          <p className="text-2xl font-bold text-[#F4F5F6]">{equipment.length}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Verified</p>
          <p className="text-2xl font-bold text-emerald-400">{verifiedCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-amber-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Expiring Soon</p>
          <p className="text-2xl font-bold text-amber-400">{expiringSoonCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-red-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-400">{overdueCount}</p>
        </div>
      </div>

      {/* Calibration reminder summary */}
      {reminderSummary && (reminderSummary.overdue > 0 || reminderSummary.due7 > 0 || reminderSummary.due14 > 0 || reminderSummary.due30 > 0) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1C2E47]/60 border border-[#8A6B4E]/30">
          <Bell className="h-5 w-5 text-[#8A6B4E] shrink-0 mt-0.5" />
          <div className="text-sm text-[#C4C8CA] space-y-1">
            <p className="font-medium text-[#F4F5F6]">Calibration Summary</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {reminderSummary.overdue > 0 && (
                <span className="text-red-400">{reminderSummary.overdue} overdue</span>
              )}
              {reminderSummary.due7 > 0 && (
                <span className="text-amber-400">{reminderSummary.due7} due within 7 days</span>
              )}
              {reminderSummary.due14 > 0 && (
                <span className="text-amber-300">{reminderSummary.due14} due within 14 days</span>
              )}
              {reminderSummary.due30 > 0 && (
                <span className="text-[#C4C8CA]">{reminderSummary.due30} due within 30 days</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert banner */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{overdueCount} item{overdueCount > 1 ? 's' : ''}</strong> {overdueCount > 1 ? 'have' : 'has'} overdue calibration. Update records to maintain compliance.
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

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="space-y-4 p-5 rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/30"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#F4F5F6]">Add Equipment</h2>
            <button type="button" onClick={() => setShowAddForm(false)}>
              <X className="h-4 w-4 text-[#C4C8CA]" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Equipment Name *</label>
              <input
                required
                value={form.equipmentName}
                onChange={e => setForm(f => ({ ...f, equipmentName: e.target.value }))}
                placeholder="e.g. Delmhorst BD-10"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Category *</label>
              <select
                required
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Make</label>
              <input
                value={form.make}
                onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
                placeholder="e.g. Delmhorst"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Model</label>
              <input
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="e.g. BD-10"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Serial Number</label>
              <input
                value={form.serialNumber}
                onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))}
                placeholder="SN-XXXXXXXX"
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Last Calibrated</label>
              <input
                type="date"
                value={form.lastCalibrated}
                onChange={e => setForm(f => ({ ...f, lastCalibrated: e.target.value }))}
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Calibration Due</label>
              <input
                type="date"
                value={form.calibrationDue}
                onChange={e => setForm(f => ({ ...f, calibrationDue: e.target.value }))}
                className="w-full rounded-lg bg-[#0B1623] border border-[#5A6A7B]/40 text-[#F4F5F6] text-sm px-3 py-2 focus:outline-none focus:border-[#8A6B4E]"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Calibration Certificate URL</label>
              <input
                type="url"
                value={form.calibrationCertUrl}
                onChange={e => setForm(f => ({ ...f, calibrationCertUrl: e.target.value }))}
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
              Save Equipment
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
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
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-xs px-3 py-1.5 focus:outline-none"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={filterVerified}
          onChange={e => setFilterVerified(e.target.value)}
          className="rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-xs px-3 py-1.5 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
      </div>

      {/* Equipment List */}
      {equipment.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-[#1C2E47]/60 mb-4">
            <Wrench className="h-8 w-8 text-[#5A6A7B]" />
          </div>
          <p className="text-[#F4F5F6] font-medium mb-1">No equipment recorded</p>
          <p className="text-sm text-[#C4C8CA]">Add your moisture meters, air movers, and dehumidifiers to track calibration compliance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {equipment.map(item => {
            const overdue = isOverdue(item.calibrationDue)
            const expiring = isExpiringSoon(item.calibrationDue)
            return (
              <div
                key={item.id}
                className={`rounded-xl bg-[#1C2E47]/60 border p-4 transition-colors ${
                  overdue
                    ? 'border-red-500/40'
                    : expiring
                    ? 'border-amber-500/40'
                    : 'border-[#5A6A7B]/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-[#F4F5F6] truncate">{item.equipmentName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#5A6A7B]/20 text-[#C4C8CA]">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      {item.isVerified ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                          Unverified
                        </span>
                      )}
                      {overdue && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Calibration Overdue
                        </span>
                      )}
                      {!overdue && expiring && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Expiring Soon
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#C4C8CA]">
                      {item.make && <span>Make: {item.make}</span>}
                      {item.model && <span>Model: {item.model}</span>}
                      {item.serialNumber && <span>S/N: {item.serialNumber}</span>}
                    </div>
                    {(item.lastCalibrated || item.calibrationDue) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#C4C8CA] mt-1">
                        {item.lastCalibrated && (
                          <span>Last calibrated: {new Date(item.lastCalibrated).toLocaleDateString('en-AU')}</span>
                        )}
                        {item.calibrationDue && (
                          <span className={overdue ? 'text-red-400' : expiring ? 'text-amber-400' : ''}>
                            Due: {new Date(item.calibrationDue).toLocaleDateString('en-AU')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.calibrationCertUrl && (
                      <a
                        href={item.calibrationCertUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-[#5A6A7B]/20 text-[#C4C8CA] hover:text-[#F4F5F6] transition-colors"
                        title="View certificate"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    {!item.isVerified && (
                      <button
                        onClick={() => handleVerify(item.id)}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                        title="Mark as verified"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
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
