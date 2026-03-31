'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  X,
  XCircle,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

// ─── Types ───────────────────────────────────────────────────────────────────

type WHSSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type WHSStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'REQUIRES_ESCALATION'

interface WHSCorrectiveAction {
  id: string
  incidentId: string
  description: string
  assignedTo: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

interface WHSIncident {
  id: string
  userId: string
  incidentType: string
  severity: WHSSeverity
  status: WHSStatus
  incidentDate: string
  location: string | null
  description: string | null
  injuredParty: string | null
  injuryDescription: string | null
  correctiveActions: WHSCorrectiveAction[]
  createdAt: string
  updatedAt: string
}

interface NewIncidentForm {
  incidentType: string
  severity: WHSSeverity | ''
  status: WHSStatus | ''
  incidentDate: string
  location: string
  description: string
  injuredParty: string
  injuryDescription: string
}

const BLANK_FORM: NewIncidentForm = {
  incidentType: '',
  severity: '',
  status: '',
  incidentDate: '',
  location: '',
  description: '',
  injuredParty: '',
  injuryDescription: '',
}

type FilterTab = 'ALL' | 'OPEN' | 'UNDER_REVIEW' | 'CLOSED'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function isOverdue(dueDateStr: string): boolean {
  return new Date(dueDateStr) < new Date()
}

function thisMonthClosed(incidents: WHSIncident[]): number {
  const now = new Date()
  return incidents.filter((i) => {
    if (i.status !== 'CLOSED') return false
    const updated = new Date(i.updatedAt)
    return (
      updated.getFullYear() === now.getFullYear() &&
      updated.getMonth() === now.getMonth()
    )
  }).length
}

function overdueActions(incidents: WHSIncident[]): number {
  return incidents
    .flatMap((i) => i.correctiveActions)
    .filter((a) => !a.completedAt && a.dueDate && isOverdue(a.dueDate)).length
}

// ─── Badge components ─────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: WHSSeverity }) {
  const config: Record<WHSSeverity, { label: string; className: string }> = {
    LOW: { label: 'Low', className: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
    MEDIUM: { label: 'Medium', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    HIGH: { label: 'High', className: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
    CRITICAL: { label: 'Critical', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  }
  const { label, className } = config[severity]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: WHSStatus }) {
  const config: Record<WHSStatus, { label: string; className: string }> = {
    OPEN: { label: 'Open', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    UNDER_REVIEW: { label: 'Under Review', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    CLOSED: { label: 'Closed', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    REQUIRES_ESCALATION: { label: 'Escalation', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
  }
  const { label, className } = config[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-slate-800/30 border-slate-700">
            <CardContent className="pt-5 pb-5">
              <Skeleton className="h-4 w-24 bg-slate-700 mb-2" />
              <Skeleton className="h-8 w-12 bg-slate-700" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Table rows skeleton */}
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-700/60 last:border-0">
            <Skeleton className="h-5 w-16 bg-slate-700 rounded" />
            <Skeleton className="h-5 w-20 bg-slate-700 rounded" />
            <Skeleton className="h-5 w-40 bg-slate-700 rounded" />
            <Skeleton className="h-5 w-24 bg-slate-700 rounded" />
            <Skeleton className="h-5 w-28 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Corrective actions sub-row ────────────────────────────────────────────────

interface CorrectiveActionsRowProps {
  incident: WHSIncident
  onAddAction: () => void
}

function CorrectiveActionsRow({ incident, onAddAction }: CorrectiveActionsRowProps) {
  const actions = incident.correctiveActions

  return (
    <tr>
      <td colSpan={7} className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/60">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-300">Corrective Actions</h4>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={onAddAction}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Action
            </Button>
          </div>

          {actions.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No corrective actions recorded for this incident.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => {
                const overdue = !action.completedAt && action.dueDate && isOverdue(action.dueDate)
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 text-sm bg-slate-700/20 rounded-lg px-3 py-2 border border-slate-700/40"
                  >
                    {/* Completed checkbox (display only) */}
                    <div
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                        action.completedAt
                          ? 'bg-green-500/20 border-green-500/40'
                          : 'border-slate-500'
                      }`}
                    >
                      {action.completedAt && <CheckCircle className="h-3 w-3 text-green-400" />}
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-slate-300 ${action.completedAt ? 'line-through opacity-60' : ''}`}>
                        {action.description}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs">
                        {action.assignedTo && (
                          <span className="text-slate-400">
                            Assigned to: <span className="text-slate-300">{action.assignedTo}</span>
                          </span>
                        )}
                        {action.dueDate && (
                          <span className={overdue ? 'text-red-400 font-medium' : 'text-slate-400'}>
                            Due: {formatDate(action.dueDate)}
                            {overdue && ' — Overdue'}
                          </span>
                        )}
                        {action.completedAt && (
                          <span className="text-green-400">
                            Completed: {formatDate(action.completedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Description of incident */}
          {incident.description && (
            <>
              <Separator className="bg-slate-700/50" />
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Incident Description</p>
                <p className="text-sm text-slate-300">{incident.description}</p>
              </div>
            </>
          )}

          {incident.injuryDescription && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Injury Details</p>
              <p className="text-sm text-slate-300">{incident.injuryDescription}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── New Incident Form ────────────────────────────────────────────────────────

interface NewIncidentFormProps {
  form: NewIncidentForm
  onChange: (form: NewIncidentForm) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  errors: Partial<Record<keyof NewIncidentForm, string>>
}

function NewIncidentFormPanel({ form, onChange, onSave, onCancel, saving, errors }: NewIncidentFormProps) {
  const set =
    (field: keyof NewIncidentForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [field]: e.target.value })

  return (
    <div className="bg-slate-700/20 border border-slate-600 rounded-xl p-6 space-y-5">
      <h3 className="text-base font-semibold text-white">Log New WHS Incident</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Incident Type */}
        <div className="space-y-1.5">
          <Label htmlFor="incidentType" className="text-slate-300">
            Incident Type <span className="text-red-400">*</span>
          </Label>
          <Input
            id="incidentType"
            value={form.incidentType}
            onChange={set('incidentType')}
            placeholder="e.g. Slip and Fall, Chemical Exposure"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
          {errors.incidentType && <p className="text-xs text-red-400">{errors.incidentType}</p>}
        </div>

        {/* Severity */}
        <div className="space-y-1.5">
          <Label htmlFor="severity" className="text-slate-300">
            Severity <span className="text-red-400">*</span>
          </Label>
          <select
            id="severity"
            value={form.severity}
            onChange={set('severity')}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Select severity…</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          {errors.severity && <p className="text-xs text-red-400">{errors.severity}</p>}
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-slate-300">
            Status <span className="text-red-400">*</span>
          </Label>
          <select
            id="status"
            value={form.status}
            onChange={set('status')}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Select status…</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CLOSED">Closed</option>
            <option value="REQUIRES_ESCALATION">Requires Escalation</option>
          </select>
          {errors.status && <p className="text-xs text-red-400">{errors.status}</p>}
        </div>

        {/* Incident Date */}
        <div className="space-y-1.5">
          <Label htmlFor="incidentDate" className="text-slate-300">
            Incident Date <span className="text-red-400">*</span>
          </Label>
          <Input
            id="incidentDate"
            type="date"
            value={form.incidentDate}
            onChange={set('incidentDate')}
            className="bg-slate-700/50 border-slate-600 text-white"
          />
          {errors.incidentDate && <p className="text-xs text-red-400">{errors.incidentDate}</p>}
        </div>

        {/* Location — spans full width */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="location" className="text-slate-300">Location / Property Address</Label>
          <Input
            id="location"
            value={form.location}
            onChange={set('location')}
            placeholder="e.g. 42 King St, Brisbane QLD 4000"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
        </div>

        {/* Description — spans full width */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description" className="text-slate-300">Incident Description</Label>
          <textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Describe what happened…"
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
        </div>

        {/* Injured Party */}
        <div className="space-y-1.5">
          <Label htmlFor="injuredParty" className="text-slate-300">Injured Party Name</Label>
          <Input
            id="injuredParty"
            value={form.injuredParty}
            onChange={set('injuredParty')}
            placeholder="Full name (if applicable)"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
        </div>

        {/* Injury Description */}
        <div className="space-y-1.5">
          <Label htmlFor="injuryDescription" className="text-slate-300">Injury Description</Label>
          <Input
            id="injuryDescription"
            value={form.injuryDescription}
            onChange={set('injuryDescription')}
            placeholder="Nature of injury (if applicable)"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          {saving ? 'Saving…' : 'Log Incident'}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WHSPage() {
  const { status } = useSession()
  const router = useRouter()

  const [incidents, setIncidents] = useState<WHSIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewIncidentForm>(BLANK_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewIncidentForm, string>>>({})
  const [saving, setSaving] = useState(false)

  // Toast message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchIncidents()
    }
  }, [status])

  const fetchIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/whs')
      if (res.status === 404 || res.status === 405) {
        // API route not yet available — show empty state gracefully
        setApiUnavailable(true)
        setIncidents([])
        return
      }
      if (res.ok) {
        const data = await res.json()
        setIncidents(data.incidents ?? [])
      } else {
        setApiUnavailable(true)
        setIncidents([])
      }
    } catch {
      // Network error or API not available
      setApiUnavailable(true)
      setIncidents([])
    } finally {
      setLoading(false)
    }
  }, [])

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4500)
  }

  function validateForm(): boolean {
    const errs: Partial<Record<keyof NewIncidentForm, string>> = {}
    if (!form.incidentType.trim()) errs.incidentType = 'Incident type is required'
    if (!form.severity) errs.severity = 'Severity is required'
    if (!form.status) errs.status = 'Status is required'
    if (!form.incidentDate) errs.incidentDate = 'Incident date is required'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)
    try {
      const res = await fetch('/api/whs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentType: form.incidentType.trim(),
          severity: form.severity,
          status: form.status,
          incidentDate: form.incidentDate,
          location: form.location.trim() || null,
          description: form.description.trim() || null,
          injuredParty: form.injuredParty.trim() || null,
          injuryDescription: form.injuryDescription.trim() || null,
        }),
      })
      if (res.ok) {
        showMsg('success', 'Incident logged successfully.')
        setShowForm(false)
        setForm(BLANK_FORM)
        setFormErrors({})
        await fetchIncidents()
      } else if (res.status === 404 || res.status === 405) {
        showMsg('error', 'API endpoint not yet available. The WHS incident register requires a database migration.')
      } else {
        const data = await res.json().catch(() => ({}))
        showMsg('error', data.error ?? 'Failed to save incident.')
      }
    } catch {
      showMsg('error', 'Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleAddAction() {
    showMsg('error', 'Feature coming soon')
  }

  // ─── Derived stats ──────────────────────────────────────────────────────────

  const openCount = incidents.filter((i) => i.status === 'OPEN').length
  const underReviewCount = incidents.filter((i) => i.status === 'UNDER_REVIEW').length
  const closedThisMonth = thisMonthClosed(incidents)
  const overdueCount = overdueActions(incidents)

  const filteredIncidents = incidents.filter((i) => {
    if (activeTab === 'ALL') return true
    if (activeTab === 'OPEN') return i.status === 'OPEN' || i.status === 'REQUIRES_ESCALATION'
    if (activeTab === 'UNDER_REVIEW') return i.status === 'UNDER_REVIEW'
    if (activeTab === 'CLOSED') return i.status === 'CLOSED'
    return true
  })

  const TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All', count: incidents.length },
    { key: 'OPEN', label: 'Open', count: openCount },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: underReviewCount },
    { key: 'CLOSED', label: 'Closed', count: closedThisMonth > 0 ? closedThisMonth : undefined },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (status === 'loading' || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64 bg-slate-700" />
          <Skeleton className="h-10 w-40 bg-slate-700" />
        </div>
        <LoadingSkeleton />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ── Toast ── */}
      {message && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <XCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── API unavailable banner ── */}
      {apiUnavailable && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold">WHS API not yet active.</span>
            {' '}The incident register requires a pending database migration. Run:{' '}
            <code className="bg-amber-500/10 px-1 rounded text-xs font-mono">
              npx prisma migrate dev --name add_whs_models
            </code>
          </div>
        </div>
      )}

      {/* ── Overdue actions warning ── */}
      {overdueCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-lg border bg-red-500/10 border-red-500/30 text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            <span className="font-semibold">{overdueCount} corrective action{overdueCount > 1 ? 's' : ''}</span>{' '}
            overdue. Review and update their status.
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">WHS Incident Register</h1>
          {incidents.length > 0 && (
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-slate-700 text-slate-300 text-xs font-semibold">
              {incidents.length}
            </span>
          )}
        </div>
        <Button
          onClick={() => {
            setShowForm((v) => !v)
            if (!showForm) {
              setForm(BLANK_FORM)
              setFormErrors({})
            }
          }}
          className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Log New Incident'}
        </Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wide">Open Incidents</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-blue-400">{openCount}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wide">Under Review</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-amber-400">{underReviewCount}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wide">Closed This Month</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-green-400">{closedThisMonth}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wide">Overdue Actions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-3xl font-bold ${overdueCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── New incident form ── */}
      {showForm && (
        <NewIncidentFormPanel
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setForm(BLANK_FORM)
            setFormErrors({})
          }}
          saving={saving}
          errors={formErrors}
        />
      )}

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-semibold ${
                  activeTab === tab.key ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {filteredIncidents.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-slate-500" />
          </div>
          {incidents.length === 0 ? (
            <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
              No WHS incidents recorded. This is a good sign! Use the button above to log any incidents.
            </p>
          ) : (
            <p className="text-slate-400 text-sm">No incidents match this filter.</p>
          )}
          {incidents.length === 0 && (
            <Button
              onClick={() => { setShowForm(true); setForm(BLANK_FORM); setFormErrors({}) }}
              className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2 mt-2"
            >
              <Plus className="h-4 w-4" />
              Log First Incident
            </Button>
          )}
        </div>
      )}

      {/* ── Incidents table ── */}
      {filteredIncidents.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Injured Party</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.map((incident) => {
                const isExpanded = expandedId === incident.id
                return (
                  <>
                    <tr
                      key={incident.id}
                      className={`border-b border-slate-700/60 transition-colors ${
                        isExpanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <SeverityBadge severity={incident.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={incident.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">
                        {incident.location ?? <span className="text-slate-500 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {formatDate(incident.incidentDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-[180px] truncate">
                        {incident.incidentType}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {incident.injuredParty ?? <span className="text-slate-500 italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <CorrectiveActionsRow
                        key={`${incident.id}-actions`}
                        incident={incident}
                        onAddAction={handleAddAction}
                      />
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
