'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  X
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

// ─── Types ───────────────────────────────────────────────────────────────────

type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'RENEWAL_NEEDED'
type CertificationType =
  | 'IICRC_WRT'
  | 'IICRC_AMRT'
  | 'IICRC_FSRT'
  | 'IICRC_CCT'
  | 'TRADE_PLUMBING'
  | 'TRADE_ELECTRICAL'
  | 'TRADE_BUILDING'
  | 'TRADE_CARPENTRY'
  | 'INSURANCE_PUBLIC_LIABILITY'
  | 'INSURANCE_PROFESSIONAL_INDEMNITY'
  | 'INSURANCE_WORKERS_COMP'
  | 'BUSINESS_ABN_REGISTRATION'
  | 'BUSINESS_GST_REGISTRATION'
  | 'OTHER'

interface Certification {
  id: string
  certificationType: CertificationType
  certificationName: string
  issuingBody: string
  certificationNumber: string | null
  issueDate: string
  expiryDate: string | null
  verificationStatus: VerificationStatus
  verifiedAt: string | null
  verificationNotes: string | null
  documentUrl: string | null
  createdAt: string
  updatedAt: string
}

interface FormState {
  certificationType: string
  certificationName: string
  issuingBody: string
  certificationNumber: string
  issueDate: string
  expiryDate: string
  documentUrl: string
}

const BLANK_FORM: FormState = {
  certificationType: '',
  certificationName: '',
  issuingBody: '',
  certificationNumber: '',
  issueDate: '',
  expiryDate: '',
  documentUrl: ''
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CERT_TYPE_LABELS: Record<CertificationType, string> = {
  IICRC_WRT: 'IICRC — Water Damage Restoration (WRT)',
  IICRC_AMRT: 'IICRC — Applied Microbial Remediation (AMRT)',
  IICRC_FSRT: 'IICRC — Fire & Smoke Restoration (FSRT)',
  IICRC_CCT: 'IICRC — Commercial Carpet Cleaning (CCT)',
  TRADE_PLUMBING: 'Trade — Plumbing',
  TRADE_ELECTRICAL: 'Trade — Electrical',
  TRADE_BUILDING: 'Trade — Building',
  TRADE_CARPENTRY: 'Trade — Carpentry',
  INSURANCE_PUBLIC_LIABILITY: 'Insurance — Public Liability',
  INSURANCE_PROFESSIONAL_INDEMNITY: 'Insurance — Professional Indemnity',
  INSURANCE_WORKERS_COMP: 'Insurance — Workers Compensation',
  BUSINESS_ABN_REGISTRATION: 'Business — ABN Registration',
  BUSINESS_GST_REGISTRATION: 'Business — GST Registration',
  OTHER: 'Other'
}

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

interface StatusBadgeProps {
  status: VerificationStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  const configs: Record<VerificationStatus, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING: {
      label: 'Pending',
      className: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      icon: <Clock className="h-3 w-3" />
    },
    VERIFIED: {
      label: 'Verified',
      className: 'bg-green-500/10 text-green-400 border-green-500/30',
      icon: <CheckCircle className="h-3 w-3" />
    },
    REJECTED: {
      label: 'Rejected',
      className: 'bg-red-500/10 text-red-400 border-red-500/30',
      icon: <XCircle className="h-3 w-3" />
    },
    EXPIRED: {
      label: 'Expired',
      className: 'bg-red-500/10 text-red-400 border-red-500/30',
      icon: <XCircle className="h-3 w-3" />
    },
    RENEWAL_NEEDED: {
      label: 'Renewal Needed',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: <RefreshCw className="h-3 w-3" />
    }
  }

  const { label, className, icon } = configs[status]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {icon}
      {label}
    </span>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-3/4 bg-slate-700" />
            <Skeleton className="h-4 w-1/2 bg-slate-700 mt-1" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full bg-slate-700" />
            <Skeleton className="h-4 w-2/3 bg-slate-700" />
            <Skeleton className="h-6 w-20 bg-slate-700 mt-3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

interface CertFormProps {
  form: FormState
  onChange: (form: FormState) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  errors: Partial<Record<keyof FormState, string>>
  editMode: boolean
}

function CertForm({ form, onChange, onSave, onCancel, saving, errors, editMode }: CertFormProps) {
  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [field]: e.target.value })

  return (
    <div className="bg-slate-700/20 border border-slate-600 rounded-xl p-6 space-y-5">
      <h3 className="text-base font-semibold text-white">
        {editMode ? 'Edit Certification' : 'Add Certification'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Certification Type */}
        <div className="space-y-1.5">
          <Label htmlFor="certType" className="text-slate-300">Certification Type <span className="text-red-400">*</span></Label>
          <select
            id="certType"
            value={form.certificationType}
            onChange={set('certificationType')}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Select type…</option>
            {(Object.entries(CERT_TYPE_LABELS) as [CertificationType, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {errors.certificationType && <p className="text-xs text-red-400">{errors.certificationType}</p>}
        </div>

        {/* Certification Name */}
        <div className="space-y-1.5">
          <Label htmlFor="certName" className="text-slate-300">Certification Name <span className="text-red-400">*</span></Label>
          <Input
            id="certName"
            value={form.certificationName}
            onChange={set('certificationName')}
            placeholder="e.g. Water Damage Restoration Technician"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
          {errors.certificationName && <p className="text-xs text-red-400">{errors.certificationName}</p>}
        </div>

        {/* Issuing Body */}
        <div className="space-y-1.5">
          <Label htmlFor="issuingBody" className="text-slate-300">Issuing Body <span className="text-red-400">*</span></Label>
          <Input
            id="issuingBody"
            value={form.issuingBody}
            onChange={set('issuingBody')}
            placeholder="e.g. IICRC, QBCC"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400"
          />
          {errors.issuingBody && <p className="text-xs text-red-400">{errors.issuingBody}</p>}
        </div>

        {/* Cert Number */}
        <div className="space-y-1.5">
          <Label htmlFor="certNumber" className="text-slate-300">Certificate Number</Label>
          <Input
            id="certNumber"
            value={form.certificationNumber}
            onChange={set('certificationNumber')}
            placeholder="e.g. WRT-123456"
            className="bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 font-mono"
          />
        </div>

        {/* Issue Date */}
        <div className="space-y-1.5">
          <Label htmlFor="issueDate" className="text-slate-300">Issue Date <span className="text-red-400">*</span></Label>
          <Input
            id="issueDate"
            type="date"
            value={form.issueDate}
            onChange={set('issueDate')}
            className="bg-slate-700/50 border-slate-600 text-white"
          />
          {errors.issueDate && <p className="text-xs text-red-400">{errors.issueDate}</p>}
        </div>

        {/* Expiry Date */}
        <div className="space-y-1.5">
          <Label htmlFor="expiryDate" className="text-slate-300">Expiry Date</Label>
          <Input
            id="expiryDate"
            type="date"
            value={form.expiryDate}
            onChange={set('expiryDate')}
            className="bg-slate-700/50 border-slate-600 text-white"
          />
        </div>

        {/* Document URL — spans full width */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="documentUrl" className="text-slate-300">Document / Certificate URL</Label>
          <Input
            id="documentUrl"
            type="url"
            value={form.documentUrl}
            onChange={set('documentUrl')}
            placeholder="https://…"
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
          {saving ? 'Saving…' : editMode ? 'Save Changes' : 'Add Certification'}
        </Button>
        <Button variant="outline" onClick={onCancel} className="border-slate-600 text-slate-300 hover:bg-slate-700">
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CertificationsPage() {
  const { status } = useSession()
  const router = useRouter()

  const [certifications, setCertifications] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form visibility
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // Inline delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Toast-style message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchCertifications()
    }
  }, [status])

  async function fetchCertifications() {
    try {
      const res = await fetch('/api/contractors/certifications')
      if (res.ok) {
        const data = await res.json()
        setCertifications(data.certifications ?? [])
      }
    } catch {
      // silently ignore network errors on load
    } finally {
      setLoading(false)
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  function validateForm(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.certificationType) errs.certificationType = 'Please select a type'
    if (!form.certificationName.trim()) errs.certificationName = 'Name is required'
    if (!form.issuingBody.trim()) errs.issuingBody = 'Issuing body is required'
    if (!form.issueDate) errs.issueDate = 'Issue date is required'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  function openAdd() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setFormErrors({})
    setShowForm(true)
  }

  function openEdit(cert: Certification) {
    // Verified certs cannot be edited (API enforces this too)
    if (cert.verificationStatus === 'VERIFIED') {
      showMessage('error', 'Verified certifications cannot be edited.')
      return
    }
    setEditingId(cert.id)
    setForm({
      certificationType: cert.certificationType,
      certificationName: cert.certificationName,
      issuingBody: cert.issuingBody,
      certificationNumber: cert.certificationNumber ?? '',
      issueDate: cert.issueDate ? cert.issueDate.slice(0, 10) : '',
      expiryDate: cert.expiryDate ? cert.expiryDate.slice(0, 10) : '',
      documentUrl: cert.documentUrl ?? ''
    })
    setFormErrors({})
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(BLANK_FORM)
    setFormErrors({})
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)

    try {
      const url = editingId
        ? `/api/contractors/certifications/${editingId}`
        : '/api/contractors/certifications'
      const method = editingId ? 'PATCH' : 'POST'

      const body = {
        certificationType: form.certificationType,
        certificationName: form.certificationName.trim(),
        issuingBody: form.issuingBody.trim(),
        certificationNumber: form.certificationNumber.trim() || null,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate || null,
        documentUrl: form.documentUrl.trim() || null
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        showMessage('success', editingId ? 'Certification updated.' : 'Certification added.')
        cancelForm()
        await fetchCertifications()
      } else {
        const data = await res.json()
        showMessage('error', data.error ?? 'Failed to save certification.')
      }
    } catch {
      showMessage('error', 'Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/contractors/certifications/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showMessage('success', 'Certification deleted.')
        setDeleteConfirmId(null)
        await fetchCertifications()
      } else {
        const data = await res.json()
        showMessage('error', data.error ?? 'Failed to delete.')
        setDeleteConfirmId(null)
      }
    } catch {
      showMessage('error', 'Network error — please try again.')
      setDeleteConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const expiringSoon = certifications.filter((c) => {
    if (!c.expiryDate) return false
    const d = daysUntilExpiry(c.expiryDate)
    return d >= 0 && d <= 60
  })

  // ─── Render ───────────────────────────────────────────────────────────────

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

      {/* ── Toast message ── */}
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

      {/* ── Expiry warning banner ── */}
      {expiringSoon.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold">{expiringSoon.length} certification{expiringSoon.length > 1 ? 's' : ''} expiring within 60 days:</span>{' '}
            {expiringSoon.map((c, i) => (
              <span key={c.id}>
                {c.certificationName}
                {c.expiryDate && (
                  <span className="opacity-75"> (expires {formatDate(c.expiryDate)})</span>
                )}
                {i < expiringSoon.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Certifications &amp; Licences</h1>
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-slate-700 text-slate-300 text-xs font-semibold">
            {certifications.length}
          </span>
        </div>
        <Button
          onClick={openAdd}
          className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Certification
        </Button>
      </div>

      {/* ── Add / Edit form ── */}
      {showForm && (
        <CertForm
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          errors={formErrors}
          editMode={editingId !== null}
        />
      )}

      {/* ── Empty state ── */}
      {certifications.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
            <Award className="h-8 w-8 text-slate-500" />
          </div>
          <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
            No certifications added yet. Add your IICRC or trade certifications to demonstrate compliance and build trust with clients.
          </p>
          <Button onClick={openAdd} className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Add your first certification
          </Button>
        </div>
      )}

      {/* ── Certifications grid ── */}
      {certifications.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {certifications.map((cert) => {
            const days = cert.expiryDate ? daysUntilExpiry(cert.expiryDate) : null
            const isExpired = days !== null && days < 0
            const isUrgent = days !== null && days >= 0 && days < 30
            const isWarning = days !== null && days >= 30 && days < 60
            const isDeleting = deleteConfirmId === cert.id

            return (
              <Card key={cert.id} className="bg-slate-800/30 border-slate-700 flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-white text-base leading-snug">
                        {cert.certificationName}
                      </CardTitle>
                      <p className="text-sm text-slate-400 mt-0.5">{cert.issuingBody}</p>
                    </div>
                    <Award className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-3">
                  {/* Cert number */}
                  {cert.certificationNumber && (
                    <p className="font-mono text-xs text-slate-300 bg-slate-700/40 px-2 py-1 rounded w-fit">
                      {cert.certificationNumber}
                    </p>
                  )}

                  {/* Dates */}
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>Issued: <span className="text-slate-300">{formatDate(cert.issueDate)}</span></div>
                    {cert.expiryDate && (
                      <div>
                        Expires:{' '}
                        <span
                          className={
                            isExpired
                              ? 'text-red-400 font-medium'
                              : isUrgent
                              ? 'text-red-300 font-medium'
                              : isWarning
                              ? 'text-amber-300 font-medium'
                              : 'text-slate-300'
                          }
                        >
                          {formatDate(cert.expiryDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Days until expiry pill */}
                  {cert.expiryDate && (
                    <div>
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">
                          <XCircle className="h-3 w-3" />
                          Expired {Math.abs(days!)} day{Math.abs(days!) !== 1 ? 's' : ''} ago
                        </span>
                      ) : isUrgent ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          {days} day{days !== 1 ? 's' : ''} remaining
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          {days} days remaining
                        </span>
                      ) : null}
                    </div>
                  )}

                  <Separator className="bg-slate-700/50" />

                  {/* Status badge */}
                  <StatusBadge status={cert.verificationStatus} />

                  {/* Action row */}
                  <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                    {cert.documentUrl && (
                      <a
                        href={cert.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Doc
                      </a>
                    )}

                    {cert.verificationStatus !== 'VERIFIED' && (
                      <>
                        <button
                          onClick={() => openEdit(cert)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>

                        {isDeleting ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <span className="text-red-400">Delete?</span>
                            <button
                              onClick={() => handleDelete(cert.id)}
                              disabled={deleting}
                              className="px-2 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                              {deleting ? '…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(cert.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-600 text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
