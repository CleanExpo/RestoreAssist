"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Inbox,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle,
  Loader2,
  AlertCircle,
  TicketIcon,
  Wand2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import toast from "react-hot-toast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportStatus = "open" | "in_progress" | "resolved" | "closed"
type SupportPriority = "low" | "normal" | "high" | "urgent"
type SupportCategory =
  | "general"
  | "billing"
  | "technical"
  | "feature_request"
  | "bug"

interface SupportTicket {
  id: string
  email: string
  name: string
  subject: string
  body: string
  category: SupportCategory
  priority: SupportPriority
  status: SupportStatus
  responseDraft: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string | null; email: string } | null
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SupportStatus }) {
  const map: Record<SupportStatus, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    in_progress: {
      label: "In Progress",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    },
    resolved: {
      label: "Resolved",
      className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    closed: {
      label: "Closed",
      className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    },
  }
  const { label, className } = map[status] ?? map.open
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: SupportPriority }) {
  const map: Record<SupportPriority, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
    normal: { label: "Normal", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
    high: {
      label: "High",
      className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    },
    urgent: {
      label: "Urgent",
      className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    },
  }
  const { label, className } = map[priority] ?? map.normal
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  )
}

function CategoryBadge({ category }: { category: SupportCategory }) {
  const labels: Record<SupportCategory, string> = {
    general: "General",
    billing: "Billing",
    technical: "Technical",
    feature_request: "Feature Request",
    bug: "Bug",
  }
  return (
    <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2.5 py-0.5 text-xs font-medium">
      {labels[category] ?? category}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
]

// ---------------------------------------------------------------------------
// TicketRow — expandable row component
// ---------------------------------------------------------------------------

function TicketRow({
  ticket,
  onResolve,
  onRegenerateDraft,
}: {
  ticket: SupportTicket
  onResolve: (id: string) => Promise<void>
  onRegenerateDraft: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const handleResolve = async () => {
    setResolving(true)
    try {
      await onResolve(ticket.id)
    } finally {
      setResolving(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await onRegenerateDraft(ticket.id)
    } finally {
      setRegenerating(false)
    }
  }

  const createdDate = new Date(ticket.createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  return (
    <div className="border-b border-border last:border-0">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="w-24 text-xs text-muted-foreground font-mono truncate" title={ticket.id}>
          {ticket.id.slice(0, 8)}…
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{ticket.subject}</div>
          <div className="text-xs text-muted-foreground truncate">
            {ticket.name} &lt;{ticket.email}&gt;
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <CategoryBadge category={ticket.category} />
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
        <div className="text-xs text-muted-foreground shrink-0 hidden md:block">{createdDate}</div>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 bg-muted/20 space-y-4">
          {/* Mobile badges */}
          <div className="flex sm:hidden flex-wrap gap-2 pt-2">
            <CategoryBadge category={ticket.category} />
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>

          {/* Body */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Customer Message
            </div>
            <div className="text-sm whitespace-pre-wrap rounded-md bg-background border border-border p-3">
              {ticket.body}
            </div>
          </div>

          {/* Response draft */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Response Draft (Claude-generated)
            </div>
            {ticket.responseDraft ? (
              <div className="text-sm whitespace-pre-wrap rounded-md bg-background border border-border p-3 text-foreground">
                {ticket.responseDraft}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic rounded-md bg-background border border-dashed border-border p-3">
                No draft generated yet.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {ticket.status !== "resolved" && ticket.status !== "closed" && (
              <Button
                size="sm"
                variant="default"
                onClick={handleResolve}
                disabled={resolving}
                className="gap-1.5"
              >
                {resolving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                Mark Resolved
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="gap-1.5"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Regenerate Draft
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SupportTicketsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState("")

  // ---------------------------------------------------------------------------
  // Auth guard — admin only
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (authStatus === "loading") return
    if (authStatus === "unauthenticated") {
      router.push("/login")
      return
    }
    if (session?.user?.role !== "ADMIN") {
      router.push("/dashboard")
    }
  }, [authStatus, session, router])

  // ---------------------------------------------------------------------------
  // Fetch tickets
  // ---------------------------------------------------------------------------
  const fetchTickets = useCallback(
    async (cursor?: string, append = false) => {
      if (!append) setLoading(true)
      else setLoadingMore(true)

      try {
        const params = new URLSearchParams({ limit: "20" })
        if (activeTab) params.set("status", activeTab)
        if (cursor) params.set("cursor", cursor)

        const res = await fetch(`/api/support/tickets?${params.toString()}`)
        if (!res.ok) throw new Error("Failed to load tickets")
        const data: { tickets: SupportTicket[]; nextCursor?: string; total: number } =
          await res.json()

        setTickets((prev) => (append ? [...prev, ...data.tickets] : data.tickets))
        setNextCursor(data.nextCursor)
        setTotal(data.total)
      } catch {
        toast.error("Failed to load support tickets.")
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [activeTab]
  )

  useEffect(() => {
    if (session?.user?.role === "ADMIN") {
      fetchTickets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })
      if (!res.ok) throw new Error("Failed to update ticket")
      toast.success("Ticket marked as resolved.")
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: "resolved", resolvedAt: new Date().toISOString() } : t
        )
      )
    } catch {
      toast.error("Failed to resolve ticket.")
    }
  }

  const handleRegenerateDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/support/tickets/${id}/draft`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to regenerate draft")
      const data: { responseDraft: string } = await res.json()
      toast.success("Response draft regenerated.")
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, responseDraft: data.responseDraft } : t))
      )
    } catch {
      toast.error("Failed to regenerate draft.")
    }
  }

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (authStatus === "loading" || (authStatus === "authenticated" && session?.user?.role !== "ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
            <p className="text-sm text-muted-foreground">
              Customer support requests — auto-categorised and drafted by Claude
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchTickets()}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {activeTab ? `${TABS.find((t) => t.value === activeTab)?.label} tickets` : "All tickets"}
          </CardTitle>
          <CardDescription>{total} ticket{total !== 1 ? "s" : ""} total</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading tickets…</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Inbox className="h-8 w-8 opacity-40" />
              <span className="text-sm">No tickets found.</span>
            </div>
          ) : (
            <div>
              {tickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  onResolve={handleResolve}
                  onRegenerateDraft={handleRegenerateDraft}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchTickets(nextCursor, true)}
            disabled={loadingMore}
            className="gap-1.5"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <div>
          <span className="font-medium text-foreground">Auto-categorisation active.</span> Each new
          ticket is automatically classified and a response draft is generated by Claude
          (claude-3-5-haiku). Drafts are for guidance only — review before sending.
        </div>
      </div>
    </div>
  )
}
