'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  CheckCircle,
  FileText,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  Download,
  Shield,
} from 'lucide-react'
import { SignatureCanvas } from '@/components/authority-forms/SignatureCanvas'

interface SignatoryInfo {
  id: string
  name: string
  role: string
  email: string | null
}

interface SignatureStatus {
  id: string
  signatoryName: string
  signatoryRole: string
  signedAt: string | null
}

interface FormData {
  id: string
  templateName: string
  templateCode: string
  companyName: string
  companyLogo: string | null
  companyPhone: string | null
  companyEmail: string | null
  clientName: string
  clientAddress: string
  incidentBrief: string | null
  incidentDate: string | null
  authorityDescription: string
  status: string
  signatures: SignatureStatus[]
}

type PageState = 'loading' | 'ready' | 'signing' | 'success' | 'error' | 'already_signed'

export default function PublicSigningPage() {
  const params = useParams()
  const token = params.token as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [signatory, setSignatory] = useState<SignatoryInfo | null>(null)
  const [form, setForm] = useState<FormData | null>(null)
  const [signatoryName, setSignatoryName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)

  // Load form data
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/authority-forms/sign/${token}`)
        const data = await res.json()

        if (!res.ok) {
          if (data.error === 'already_signed') {
            setPageState('already_signed')
          } else {
            setErrorMessage(data.error || 'Failed to load form')
            setPageState('error')
          }
          return
        }

        setSignatory(data.signatory)
        setForm(data.form)
        setSignatoryName(data.signatory.name)
        setPageState('ready')
      } catch {
        setErrorMessage('Unable to connect. Please try again.')
        setPageState('error')
      }
    }

    if (token) loadData()
  }, [token])

  const handleSubmit = async () => {
    if (!signatureData || !agreed || !signatoryName.trim()) return

    setPageState('signing')
    try {
      const res = await fetch(`/api/authority-forms/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData,
          signatoryName: signatoryName.trim(),
        }),
      })

      if (res.ok) {
        setPageState('success')
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMessage(data.error || 'Failed to submit signature')
        setPageState('error')
      }
    } catch {
      setErrorMessage('Unable to submit. Please try again.')
      setPageState('error')
    }
  }

  const canSubmit = agreed && signatureData && signatoryName.trim()

  const formatRole = (role: string) =>
    role
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())

  // Loading
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mx-auto" />
          <p className="mt-3 text-gray-600">Loading signing page...</p>
        </div>
      </div>
    )
  }

  // Error
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Unable to Load Form</h1>
          <p className="mt-2 text-gray-600">{errorMessage}</p>
          <p className="mt-4 text-sm text-gray-500">
            If this issue persists, please contact the party who sent you this link.
          </p>
        </div>
      </div>
    )
  }

  // Already signed
  if (pageState === 'already_signed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Already Signed</h1>
          <p className="mt-2 text-gray-600">This form has already been signed. No further action is required.</p>
        </div>
      </div>
    )
  }

  // Success
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Signature Submitted</h1>
          <p className="mt-2 text-gray-600">
            Thank you, <strong>{signatoryName}</strong>. Your signature has been recorded successfully.
          </p>
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
            <Shield className="h-4 w-4 inline-block mr-1 -mt-0.5" />
            Your signature has been securely saved with a timestamp and verification data.
          </div>
          {form && (
            <a
              href={`/api/authority-forms/${form.id}/pdf`}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Signed PDF
            </a>
          )}
        </div>
      </div>
    )
  }

  // Ready — main signing form
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Company Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          {form?.companyLogo && (
            <img
              src={form.companyLogo}
              alt={form?.companyName}
              className="h-12 mx-auto mb-3 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold">{form?.companyName}</h1>
          <p className="mt-1 text-cyan-100">Signature Request</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Role badge */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
              <FileText className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">You are signing as</p>
              <p className="font-semibold text-gray-900">
                {signatory?.name}{' '}
                <span className="text-xs font-normal px-2 py-0.5 bg-gray-100 rounded-full text-gray-500">
                  {signatory && formatRole(signatory.role)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Form Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">{form?.templateName}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-medium text-gray-500 shrink-0">Client:</span>
              <span className="text-gray-900">{form?.clientName}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-gray-900">{form?.clientAddress}</span>
            </div>
            {form?.companyPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-gray-900">{form.companyPhone}</span>
              </div>
            )}
            {form?.companyEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-gray-900">{form.companyEmail}</span>
              </div>
            )}
            {form?.incidentDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-gray-900">
                  {new Date(form.incidentDate).toLocaleDateString('en-AU')}
                </span>
              </div>
            )}
          </div>

          {form?.incidentBrief && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Incident Summary</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{form.incidentBrief}</p>
            </div>
          )}

          {/* Authority Description */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-1">Authority Description</p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
              {form?.authorityDescription}
            </div>
          </div>

          {/* Other signatories status */}
          {form && form.signatures.length > 1 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-2">Signatories</p>
              <div className="space-y-1.5">
                {form.signatures.map((sig) => (
                  <div key={sig.id} className="flex items-center gap-2 text-sm">
                    {sig.signedAt ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
                    )}
                    <span className={sig.signedAt ? 'text-gray-900' : 'text-gray-500'}>
                      {sig.signatoryName}
                    </span>
                    <span className="text-xs text-gray-400">{formatRole(sig.signatoryRole)}</span>
                    {sig.id === signatory?.id && (
                      <span className="text-xs px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded-full">You</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Agreement & Signature */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Sign Below</h3>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
            />
            <span className="text-sm text-gray-700">
              I have read and understand the authority described above, and I consent to signing this form.
            </span>
          </label>

          {/* Name confirmation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={signatoryName}
              onChange={(e) => setSignatoryName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              placeholder="Your full name"
            />
          </div>

          {/* Signature Canvas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Signature</label>
            <SignatureCanvas
              onSave={(base64) => setSignatureData(base64)}
              onClear={() => setSignatureData(null)}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || pageState === 'signing'}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pageState === 'signing' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Sign &amp; Submit
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Your signature will be securely stored with a timestamp and verification data.
            This link is unique to you and will be invalidated once signed.
          </p>
        </div>
      </div>
    </div>
  )
}
