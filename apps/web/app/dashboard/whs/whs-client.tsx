'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  ShieldAlert,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Phone,
  MapPin,
  Calendar,
  FileText,
  User,
  Users,
} from 'lucide-react'

interface CorrectiveAction {
  id: string
  description: string
  assignedTo: string | null
  dueDate: string | null
  completedAt: string | null
  status: string
  createdAt: string
}

interface Incident {
  id: string
  incidentNumber: string
  incidentDate: string
  location: string
  description: string
  severity: string
  injuryType: string | null
  affectedPerson: string | null
  witnessNames: string | null
  immediateAction: string | null
  reportedToSafework: boolean
  safeworkRefNumber: string | null
  status: string
  investigationNotes: string | null
  closedAt: string | null
  evidenceUrls: string[]
  correctiveActions: CorrectiveAction[]
  createdAt: string
}

const SEVERITIES = [
  { value: 'NEAR_MISS', label: 'Near Miss', className: 'bg-blue-500/20 text-blue-400' },
  { value: 'MINOR', label: 'Minor', className: 'bg-green-500/20 text-green-400' },
  { value: 'MODERATE', label: 'Moderate', className: 'bg-amber-500/20 text-amber-400' },
  { value: 'SERIOUS', label: 'Serious', className: 'bg-orange-500/20 text-orange-400' },
  { value: 'CRITICAL', label: 'Critical', className: 'bg-red-500/20 text-red-400' },
] as const

const STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_INVESTIGATION', label: 'Under Investigation' },
  { value: 'CORRECTIVE_ACTION', label: 'Corrective Action' },
  { value: 'CLOSED', label: 'Closed' },
] as const

const INJURY_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'STRAIN', label: 'Strain / Sprain' },
  { value: 'LACERATION', label: 'Laceration' },
  { value: 'FRACTURE', label: 'Fracture' },
  { value: 'BURN', label: 'Burn' },
  { value: 'OTHER', label: 'Other' },
] as const

const SEVERITY_MAP: Record<string, { label: string; className: string }> = Object.fromEntries(
  SEVERITIES.map(s => [s.value, { label: s.label, className: s.className }])
)

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUSES.map(s => [s.value, s.label])
)

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function WHSClient() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showNewForm, setShowNewForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    incidentDate: new Date().toISOString().split('T')[0],
    location: '',
    description: '',
    severity: 'MINOR',
    injuryType: 'NONE',
    affectedPerson: '',
    witnessNames: '',
    immediateAction: '',
    reportedToSafework: false,
    safeworkRefNumber: '',
  })

  // Investigation / status update state
  const [editingStatus, setEditingStatus] = useState<string | null>(null)
  const [statusForm, setStatusForm] = useState({ status: '', investigationNotes: '' })

  // Corrective action form
  const [addingActionFor, setAddingActionFor] = useState<string | null>(null)
  const [actionForm, setActionForm] = useState({ description: '', assignedTo: '', dueDate: '' })

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterSeverity !== 'all') params.set('severity', filterSeverity)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/whs/incidents?${params}`)
      if (res.ok) {
        const data = await res.json()
        setIncidents(data.incidents || [])
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err)
    } finally {
      setLoading(false)
    }
  }, [filterSeverity, filterStatus])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchIncidents()
    }
  }, [status, router, fetchIncidents])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/whs/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          injuryType: form.injuryType || null,
          affectedPerson: form.affectedPerson || null,
          witnessNames: form.witnessNames || null,
          immediateAction: form.immediateAction || null,
          safeworkRefNumber: form.safeworkRefNumber || null,
        }),
      })
      if (res.ok) {
        showMessage('success', 'Incident reported successfully.')
        setShowNewForm(false)
        setForm({
          incidentDate: new Date().toISOString().split('T')[0],
          location: '',
          description: '',
          severity: 'MINOR',
          injuryType: 'NONE',
          affectedPerson: '',
          witnessNames: '',
          immediateAction: '',
          reportedToSafework: false,
          safeworkRefNumber: '',
        })
        fetchIncidents()
      } else {
        const err = await res.json()
        showMessage('error', err.error || 'Failed to create incident.')
      }
    } catch {
      showMessage('error', 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this incident report? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/whs/incidents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setIncidents(prev => prev.filter(i => i.id !== id))
        showMessage('success', 'Incident deleted.')
      }
    } catch {
      showMessage('error', 'Failed to delete incident.')
    }
  }

  const handleUpdateStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/whs/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusForm.status,
          investigationNotes: statusForm.investigationNotes || null,
        }),
      })
      if (res.ok) {
        showMessage('success', 'Incident updated.')
        setEditingStatus(null)
        fetchIncidents()
      } else {
        const err = await res.json()
        showMessage('error', err.error || 'Failed to update.')
      }
    } catch {
      showMessage('error', 'Network error.')
    }
  }

  const handleAddAction = async (incidentId: string) => {
    try {
      const res = await fetch(`/api/whs/incidents/${incidentId}/corrective-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: actionForm.description,
          assignedTo: actionForm.assignedTo || null,
          dueDate: actionForm.dueDate || null,
        }),
      })
      if (res.ok) {
        showMessage('success', 'Corrective action added.')
        setAddingActionFor(null)
        setActionForm({ description: '', assignedTo: '', dueDate: '' })
        fetchIncidents()
      } else {
        const err = await res.json()
        showMessage('error', err.error || 'Failed to add action.')
      }
    } catch {
      showMessage('error', 'Network error.')
    }
  }

  const handleToggleActionStatus = async (incidentId: string, action: CorrectiveAction) => {
    const newStatus = action.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    try {
      const res = await fetch(`/api/whs/incidents/${incidentId}/corrective-actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchIncidents()
      }
    } catch {
      showMessage('error', 'Failed to update action.')
    }
  }

  const handleDeleteAction = async (incidentId: string, actionId: string) => {
    try {
      const res = await fetch(`/api/whs/incidents/${incidentId}/corrective-actions/${actionId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchIncidents()
      }
    } catch {
      showMessage('error', 'Failed to delete action.')
    }
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

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const openCount = incidents.filter(i => i.status === 'OPEN').length
  const investigatingCount = incidents.filter(i => i.status === 'UNDER_INVESTIGATION').length
  const closedCount = incidents.filter(i => i.status === 'CLOSED').length
  const thisMonthCount = incidents.filter(i => new Date(i.incidentDate) >= startOfMonth).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
            <ShieldAlert className="h-6 w-6 text-[#8A6B4E]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#F4F5F6]">WHS Incident Reporting</h1>
            <p className="text-sm text-[#C4C8CA]">Report and track workplace health and safety incidents</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8A6B4E] text-white hover:bg-[#8A6B4E]/90 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Incident
        </button>
      </div>

      {/* SafeWork QLD Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
        <Phone className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm text-red-300">
          <p className="font-medium text-red-200">SafeWork QLD Reporting Obligation</p>
          <p>Critical and Serious incidents must be reported to SafeWork QLD within 48 hours. Call <strong>1300 362 128</strong>.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Total</p>
          <p className="text-2xl font-bold text-[#F4F5F6]">{incidents.length}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-amber-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Open</p>
          <p className="text-2xl font-bold text-amber-400">{openCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-blue-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Investigating</p>
          <p className="text-2xl font-bold text-blue-400">{investigatingCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-emerald-500/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">Closed</p>
          <p className="text-2xl font-bold text-emerald-400">{closedCount}</p>
        </div>
        <div className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 p-4">
          <p className="text-xs text-[#C4C8CA] mb-1">This Month</p>
          <p className="text-2xl font-bold text-[#F4F5F6]">{thisMonthCount}</p>
        </div>
      </div>

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

      {/* New Incident Form */}
      {showNewForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 p-5 rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/30"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#F4F5F6]">Report New Incident</h2>
            <button type="button" onClick={() => setShowNewForm(false)}>
              <X className="h-4 w-4 text-[#C4C8CA]" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Incident Date *</label>
              <input
                required
                type="date"
                value={form.incidentDate}
                onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Location *</label>
              <input
                required
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. 42 Smith St, Brisbane QLD"
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Severity *</label>
              <select
                required
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
              >
                {SEVERITIES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Injury Type</label>
              <select
                value={form.injuryType}
                onChange={e => setForm(f => ({ ...f, injuryType: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
              >
                {INJURY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Affected Person</label>
              <input
                value={form.affectedPerson}
                onChange={e => setForm(f => ({ ...f, affectedPerson: e.target.value }))}
                placeholder="Name of affected person"
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
              />
            </div>
            <div>
              <label className="text-xs text-[#C4C8CA] mb-1 block">Witnesses</label>
              <input
                value={form.witnessNames}
                onChange={e => setForm(f => ({ ...f, witnessNames: e.target.value }))}
                placeholder="Comma-separated names"
                className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#C4C8CA] mb-1 block">Description of Incident *</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what happened, how it happened, and what conditions contributed..."
              className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-[#C4C8CA] mb-1 block">Immediate Action Taken</label>
            <textarea
              rows={2}
              value={form.immediateAction}
              onChange={e => setForm(f => ({ ...f, immediateAction: e.target.value }))}
              placeholder="What immediate actions were taken to address the incident?"
              className="w-full px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60 resize-none"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-[#C4C8CA] cursor-pointer">
              <input
                type="checkbox"
                checked={form.reportedToSafework}
                onChange={e => setForm(f => ({ ...f, reportedToSafework: e.target.checked }))}
                className="rounded border-[#5A6A7B]/30"
              />
              Reported to SafeWork QLD
            </label>
            {form.reportedToSafework && (
              <input
                value={form.safeworkRefNumber}
                onChange={e => setForm(f => ({ ...f, safeworkRefNumber: e.target.value }))}
                placeholder="SafeWork reference number"
                className="flex-1 px-3 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/30 text-[#C4C8CA] text-sm hover:bg-[#1C2E47]/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8A6B4E] text-white text-sm font-medium hover:bg-[#8A6B4E]/90 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Report
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
        >
          <option value="all">All Severities</option>
          {SEVERITIES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
        >
          <option value="all">All Statuses</option>
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Incident List */}
      {incidents.length === 0 ? (
        <div className="text-center py-12">
          <ShieldAlert className="h-12 w-12 text-[#5A6A7B] mx-auto mb-3" />
          <p className="text-[#C4C8CA] text-sm">No incidents recorded. Click &quot;New Incident&quot; to report one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(incident => {
            const sev = SEVERITY_MAP[incident.severity] || { label: incident.severity, className: 'bg-gray-500/20 text-gray-400' }
            const isExpanded = expandedId === incident.id

            return (
              <div
                key={incident.id}
                className="rounded-xl bg-[#1C2E47]/60 border border-[#5A6A7B]/20 overflow-hidden"
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#1C2E47]/80 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-mono font-medium text-[#F4F5F6]">{incident.incidentNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sev.className}`}>
                        {sev.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#0B1623] text-[#C4C8CA]">
                        {STATUS_LABELS[incident.status] || incident.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#C4C8CA]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(incident.incidentDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {incident.location}
                      </span>
                      {incident.correctiveActions.length > 0 && (
                        <span className="flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {incident.correctiveActions.filter(a => a.status === 'COMPLETED').length}/{incident.correctiveActions.length} actions
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[#5A6A7B] shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#5A6A7B] shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-[#5A6A7B]/20 p-4 space-y-4">
                    {/* Description */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-[#8A6B4E]" />
                        <span className="text-xs font-medium text-[#C4C8CA] uppercase tracking-wider">Description</span>
                      </div>
                      <p className="text-sm text-[#F4F5F6] whitespace-pre-wrap">{incident.description}</p>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {incident.injuryType && incident.injuryType !== 'NONE' && (
                        <div>
                          <span className="text-xs text-[#C4C8CA]">Injury Type:</span>
                          <p className="text-[#F4F5F6]">{INJURY_TYPES.find(t => t.value === incident.injuryType)?.label || incident.injuryType}</p>
                        </div>
                      )}
                      {incident.affectedPerson && (
                        <div className="flex items-start gap-1.5">
                          <User className="h-3.5 w-3.5 text-[#5A6A7B] mt-0.5" />
                          <div>
                            <span className="text-xs text-[#C4C8CA]">Affected Person:</span>
                            <p className="text-[#F4F5F6]">{incident.affectedPerson}</p>
                          </div>
                        </div>
                      )}
                      {incident.witnessNames && (
                        <div className="flex items-start gap-1.5">
                          <Users className="h-3.5 w-3.5 text-[#5A6A7B] mt-0.5" />
                          <div>
                            <span className="text-xs text-[#C4C8CA]">Witnesses:</span>
                            <p className="text-[#F4F5F6]">{incident.witnessNames}</p>
                          </div>
                        </div>
                      )}
                      {incident.immediateAction && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-[#C4C8CA]">Immediate Action:</span>
                          <p className="text-[#F4F5F6]">{incident.immediateAction}</p>
                        </div>
                      )}
                      {incident.reportedToSafework && (
                        <div>
                          <span className="text-xs text-[#C4C8CA]">SafeWork QLD:</span>
                          <p className="text-emerald-400">Reported{incident.safeworkRefNumber ? ` - Ref: ${incident.safeworkRefNumber}` : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Investigation Notes */}
                    {incident.investigationNotes && (
                      <div className="p-3 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/20">
                        <span className="text-xs text-[#C4C8CA] uppercase tracking-wider">Investigation Notes</span>
                        <p className="text-sm text-[#F4F5F6] mt-1 whitespace-pre-wrap">{incident.investigationNotes}</p>
                      </div>
                    )}

                    {/* Update Status */}
                    {editingStatus === incident.id ? (
                      <div className="p-3 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#C4C8CA] uppercase tracking-wider">Update Status</span>
                          <button onClick={() => setEditingStatus(null)}>
                            <X className="h-4 w-4 text-[#C4C8CA]" />
                          </button>
                        </div>
                        <select
                          value={statusForm.status}
                          onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
                        >
                          {STATUSES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          value={statusForm.investigationNotes}
                          onChange={e => setStatusForm(f => ({ ...f, investigationNotes: e.target.value }))}
                          placeholder="Investigation notes..."
                          className="w-full px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60 resize-none"
                        />
                        <button
                          onClick={() => handleUpdateStatus(incident.id)}
                          className="px-4 py-2 rounded-lg bg-[#8A6B4E] text-white text-sm font-medium hover:bg-[#8A6B4E]/90 transition-colors"
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingStatus(incident.id)
                          setStatusForm({ status: incident.status, investigationNotes: incident.investigationNotes || '' })
                        }}
                        className="text-xs text-[#8A6B4E] hover:text-[#8A6B4E]/80 transition-colors"
                      >
                        Update Status / Add Notes
                      </button>
                    )}

                    {/* Corrective Actions */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[#C4C8CA] uppercase tracking-wider">
                          Corrective Actions ({incident.correctiveActions.length})
                        </span>
                        <button
                          onClick={() => {
                            setAddingActionFor(addingActionFor === incident.id ? null : incident.id)
                            setActionForm({ description: '', assignedTo: '', dueDate: '' })
                          }}
                          className="flex items-center gap-1 text-xs text-[#8A6B4E] hover:text-[#8A6B4E]/80 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add Action
                        </button>
                      </div>

                      {addingActionFor === incident.id && (
                        <div className="p-3 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/20 space-y-2 mb-2">
                          <input
                            value={actionForm.description}
                            onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Describe the corrective action..."
                            className="w-full px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
                          />
                          <div className="flex gap-2">
                            <input
                              value={actionForm.assignedTo}
                              onChange={e => setActionForm(f => ({ ...f, assignedTo: e.target.value }))}
                              placeholder="Assigned to"
                              className="flex-1 px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm placeholder:text-[#5A6A7B] focus:outline-none focus:border-[#8A6B4E]/60"
                            />
                            <input
                              type="date"
                              value={actionForm.dueDate}
                              onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))}
                              className="px-3 py-2 rounded-lg bg-[#1C2E47] border border-[#5A6A7B]/30 text-[#F4F5F6] text-sm focus:outline-none focus:border-[#8A6B4E]/60"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setAddingActionFor(null)}
                              className="px-3 py-1.5 rounded-lg text-xs text-[#C4C8CA] hover:bg-[#1C2E47]/60 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleAddAction(incident.id)}
                              disabled={!actionForm.description.trim()}
                              className="px-3 py-1.5 rounded-lg bg-[#8A6B4E] text-white text-xs font-medium hover:bg-[#8A6B4E]/90 transition-colors disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {incident.correctiveActions.length > 0 && (
                        <div className="space-y-1.5">
                          {incident.correctiveActions.map(action => (
                            <div
                              key={action.id}
                              className="flex items-start gap-2 p-2.5 rounded-lg bg-[#0B1623] border border-[#5A6A7B]/10"
                            >
                              <button
                                onClick={() => handleToggleActionStatus(incident.id, action)}
                                className={`mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                  action.status === 'COMPLETED'
                                    ? 'bg-emerald-500/30 border-emerald-500/50'
                                    : 'border-[#5A6A7B]/40 hover:border-[#8A6B4E]/60'
                                }`}
                              >
                                {action.status === 'COMPLETED' && (
                                  <CheckCircle className="h-3 w-3 text-emerald-400" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${action.status === 'COMPLETED' ? 'text-[#5A6A7B] line-through' : 'text-[#F4F5F6]'}`}>
                                  {action.description}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#5A6A7B]">
                                  {action.assignedTo && <span>Assigned: {action.assignedTo}</span>}
                                  {action.dueDate && <span>Due: {formatDate(action.dueDate)}</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteAction(incident.id, action.id)}
                                className="text-[#5A6A7B] hover:text-red-400 transition-colors shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer actions */}
                    <div className="flex justify-end pt-2 border-t border-[#5A6A7B]/10">
                      <button
                        onClick={() => handleDelete(incident.id)}
                        className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Incident
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
