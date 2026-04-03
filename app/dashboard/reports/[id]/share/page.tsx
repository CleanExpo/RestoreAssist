"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Lock,
  Users,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import toast from "react-hot-toast"

interface Report {
  id: string
  title: string
  reportNumber?: string
  status: string
  clientName: string
  propertyAddress: string
  clientId?: string | null
}

interface Invitation {
  id: string
  email: string
  token: string
  status: string
  expiresAt: string
  createdAt: string
}

export default function ReportSharePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Portal invitation state
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Copy state
  const [copied, setCopied] = useState(false)

  // Build the portal URL (client logs in first, then sees this report)
  const portalBaseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const portalUrl = invitation
    ? `${portalBaseUrl}/portal/signup?token=${invitation.token}`
    : `${portalBaseUrl}/portal`

  // Portal preview URL for the contractor (logged-in as client-type)
  const portalReportUrl = `${portalBaseUrl}/portal/reports/${id}`

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const res = await fetch(`/api/reports/${id}`)
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (!res.ok) throw new Error("Failed to fetch report")
        const data = await res.json()
        setReport(data)

        // Load any existing invitations for this client
        if (data.clientId) {
          setInvitationsLoading(true)
          try {
            const invRes = await fetch(`/api/portal/invitations?clientId=${data.clientId}`)
            if (invRes.ok) {
              const invData = await invRes.json()
              const active = (invData.invitations as Invitation[]).find(
                (inv) => inv.status === "PENDING" && new Date(inv.expiresAt) > new Date()
              )
              if (active) setInvitation(active)
            }
          } catch {
            // Silently ignore — invitation load is non-critical
          } finally {
            setInvitationsLoading(false)
          }
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea")
      el.value = portalUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleGenerateLink = async () => {
    if (!report?.clientId) {
      toast.error("This report is not linked to a client. Link a client first to generate a share link.")
      return
    }
    setGenerating(true)
    try {
      const res = await fetch("/api/portal/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: report.clientId }),
      })
      if (res.status === 400) {
        const data = await res.json()
        // If invitation already exists, reload
        if (data.error?.includes("already")) {
          const invRes = await fetch(`/api/portal/invitations?clientId=${report.clientId}`)
          if (invRes.ok) {
            const invData = await invRes.json()
            const active = (invData.invitations as Invitation[]).find(
              (inv) => inv.status === "PENDING" && new Date(inv.expiresAt) > new Date()
            )
            if (active) {
              setInvitation(active)
              toast.success("Existing share link loaded!")
              return
            }
          }
        }
        toast.error(data.error || "Failed to generate link")
        return
      }
      if (!res.ok) throw new Error("Failed to generate")
      const data = await res.json()
      setInvitation(data.invitation)
      toast.success("Share link generated!")
    } catch {
      toast.error("Failed to generate share link. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse mb-6" />
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-10 bg-slate-100 rounded w-full" />
          <div className="h-10 bg-slate-100 rounded w-full" />
        </div>
      </div>
    )
  }

  if (notFound || !report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Report Not Found</h2>
        <p className="text-slate-500 mb-6">This report does not exist or you do not have access.</p>
        <Link
          href="/dashboard/reports"
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Reports
        </Link>
      </div>
    )
  }

  const isExpired = invitation && new Date(invitation.expiresAt) <= new Date()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href={`/dashboard/reports/${id}`}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Report</span>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Share2 size={20} className="text-cyan-500" />
          <h1 className="text-2xl font-bold text-slate-800">Share Report</h1>
        </div>
        <p className="text-slate-500 text-sm">
          {report.title}
          {report.reportNumber && ` · #${report.reportNumber}`}
        </p>
      </div>

      <div className="space-y-4">
        {/* Portal link card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Client Portal Link</h2>
          </div>

          {invitationsLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-4">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading share link...</span>
            </div>
          ) : invitation && !isExpired ? (
            <>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={portalUrl}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono truncate"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium shrink-0"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Expires{" "}
                  {new Date(invitation.expiresAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              {isExpired && (
                <p className="text-sm text-amber-600 mb-3">Your previous share link has expired.</p>
              )}
              {!report.clientId ? (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg text-left">
                  <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">No client linked</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Link a client to this report before generating a share link. You can do this from the report
                      detail page.
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateLink}
                  disabled={generating}
                  className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Share2 size={15} />
                      Generate Share Link
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Open portal preview */}
        {invitation && !isExpired && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-800">Preview Portal</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Open the portal report view to see exactly what your client sees. You must be logged in as a client
              account to view this page.
            </p>
            <a
              href={portalReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            >
              <ExternalLink size={14} />
              Open Portal Preview
            </a>
          </div>
        )}

        {/* What the client sees */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">What Your Client Sees</h2>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {[
              "Report title, status, and property address",
              "Damage classification (water category and class)",
              "Scope of work and cost estimate",
              "Approval request buttons for scope and cost",
              "Your contractor contact details",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-cyan-500 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              The share link takes your client through account creation. Once signed up, they can view all reports
              linked to their client profile, not just this one.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
