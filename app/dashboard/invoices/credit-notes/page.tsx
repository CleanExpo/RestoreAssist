'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileX,
  Plus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ---------------------------------------------------------------------------
// Types (derived from Prisma schema — no imports needed at runtime)
// ---------------------------------------------------------------------------

type CreditNoteStatus = 'DRAFT' | 'ISSUED' | 'APPLIED' | 'REFUNDED' | 'CANCELLED'
type CreditNoteReason =
  | 'CUSTOMER_REFUND'
  | 'PRICING_ERROR'
  | 'DUPLICATE_INVOICE'
  | 'SERVICE_ISSUE'
  | 'GOODWILL'
  | 'OTHER'

interface CreditNoteLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  gstRate: number
  gstAmount: number
  total: number
  sortOrder: number
}

interface CreditNote {
  id: string
  creditNoteNumber: string
  status: CreditNoteStatus
  creditDate: string
  appliedDate: string | null
  subtotalExGST: number
  gstAmount: number
  totalIncGST: number
  reason: CreditNoteReason
  reasonNotes: string | null
  refundMethod: string | null
  refundReference: string | null
  refundedAt: string | null
  invoiceId: string
  invoice: {
    invoiceNumber: string
    customerName: string
  } | null
  lineItems: CreditNoteLineItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_TABS: { label: string; value: CreditNoteStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Issued', value: 'ISSUED' },
  { label: 'Applied', value: 'APPLIED' },
  { label: 'Refunded', value: 'REFUNDED' },
  { label: 'Voided', value: 'CANCELLED' },
]

function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Status badge config
const STATUS_CONFIG: Record<
  CreditNoteStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Draft',
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-0',
  },
  ISSUED: {
    label: 'Issued',
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0',
  },
  APPLIED: {
    label: 'Applied',
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0',
  },
  REFUNDED: {
    label: 'Refunded',
    className:
      'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-0',
  },
  CANCELLED: {
    label: 'Voided',
    className:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0',
  },
}

// Reason badge config
const REASON_CONFIG: Record<CreditNoteReason, { label: string; className: string }> = {
  CUSTOMER_REFUND: {
    label: 'Customer Refund',
    className:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0',
  },
  PRICING_ERROR: {
    label: 'Pricing Error',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0',
  },
  DUPLICATE_INVOICE: {
    label: 'Duplicate Invoice',
    className:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-0',
  },
  SERVICE_ISSUE: {
    label: 'Service Issue',
    className:
      'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-0',
  },
  GOODWILL: {
    label: 'Goodwill',
    className:
      'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-0',
  },
  OTHER: {
    label: 'Other',
    className:
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-0',
  },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-40" />
      </CardContent>
    </Card>
  )
}

function TableRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-4" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-28" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-24 rounded-full" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-20 rounded-full" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
    </TableRow>
  )
}

interface ExpandedRowProps {
  creditNote: CreditNote
}

function ExpandedDetailRow({ creditNote }: ExpandedRowProps) {
  return (
    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
      <TableCell colSpan={8} className="py-4 px-6">
        <div className="space-y-4">
          {/* Line items sub-table */}
          {creditNote.lineItems.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Line Items
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Unit Price
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {creditNote.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                          {item.description}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">
                          {formatAUD(item.unitPrice)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                          {formatAUD(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              No line items recorded.
            </p>
          )}

          {/* Refund method */}
          {creditNote.refundMethod && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Refund Method
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {creditNote.refundMethod.replace(/_/g, ' ')}
                {creditNote.refundReference && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    (Ref: {creditNote.refundReference})
                  </span>
                )}
                {creditNote.refundedAt && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    — {formatDate(creditNote.refundedAt)}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Notes */}
          {creditNote.reasonNotes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Notes
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {creditNote.reasonNotes}
              </p>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CreditNotesPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<CreditNoteStatus | 'ALL'>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Redirect if unauthenticated
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login')
    } else if (authStatus === 'authenticated') {
      fetchCreditNotes()
    }
  }, [authStatus])

  async function fetchCreditNotes() {
    setLoading(true)
    try {
      const res = await fetch('/api/invoices/credit-notes')
      if (!res.ok) throw new Error('Failed to fetch credit notes')
      const data = await res.json()
      setCreditNotes(data.creditNotes ?? [])
    } catch (err) {
      console.error('[CreditNotesPage] fetch error:', err)
      setCreditNotes([])
    } finally {
      setLoading(false)
    }
  }

  // Derived values
  const filteredNotes =
    activeTab === 'ALL'
      ? creditNotes
      : creditNotes.filter((cn) => cn.status === activeTab)

  const totalCreditsIssued = creditNotes
    .filter((cn) => cn.status !== 'CANCELLED')
    .reduce((sum, cn) => sum + cn.totalIncGST, 0)

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="max-w-9xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Credit Notes
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage adjustments and refunds issued against invoices.
          </p>
        </div>
        <Button asChild className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-90">
          <Link href="/dashboard/invoices/credit-notes/new">
            <Plus className="h-4 w-4" />
            Issue New Credit Note
          </Link>
        </Button>
      </div>

      {/* Summary card */}
      {loading ? (
        <div className="mb-6">
          <SummaryCardSkeleton />
        </div>
      ) : (
        <div className="mb-6">
          <Card className="max-w-xs border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                <DollarSign className="h-4 w-4 text-cyan-500" />
                Total Credits Issued
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatAUD(totalCreditsIssued)}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Excludes voided credit notes
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === 'ALL'
              ? creditNotes.length
              : creditNotes.filter((cn) => cn.status === tab.value).length
          const isActive = activeTab === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value)
                setExpandedId(null)
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors relative -mb-px ${
                isActive
                  ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Credit Note #</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          <FileX className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-base font-medium">
            No credit notes issued yet.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Use the button above to issue your first credit note.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-700/50">
                <TableHead className="w-8" />
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Credit Note #
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Invoice #
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Client
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Reason
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Status
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs text-right">
                  Amount
                </TableHead>
                <TableHead className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs">
                  Date Issued
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNotes.map((cn) => {
                const isExpanded = expandedId === cn.id
                const statusCfg = STATUS_CONFIG[cn.status]
                const reasonCfg = REASON_CONFIG[cn.reason]
                return [
                  <TableRow
                    key={cn.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    onClick={() => toggleRow(cn.id)}
                  >
                    {/* Expand toggle */}
                    <TableCell className="pr-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </TableCell>

                    {/* Credit note number */}
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {cn.creditNoteNumber}
                      </span>
                    </TableCell>

                    {/* Linked invoice number */}
                    <TableCell>
                      {cn.invoice ? (
                        <Link
                          href={`/dashboard/invoices/${cn.invoiceId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-cyan-600 dark:text-cyan-400 hover:underline text-sm font-mono"
                        >
                          {cn.invoice.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Client name */}
                    <TableCell>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {cn.invoice?.customerName ?? '—'}
                      </span>
                    </TableCell>

                    {/* Reason badge */}
                    <TableCell>
                      <Badge className={reasonCfg.className}>
                        {reasonCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      <Badge className={statusCfg.className}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatAUD(cn.totalIncGST)}
                      </span>
                    </TableCell>

                    {/* Date issued */}
                    <TableCell>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {formatDate(cn.creditDate)}
                      </span>
                    </TableCell>
                  </TableRow>,

                  // Expanded detail row
                  isExpanded ? (
                    <ExpandedDetailRow key={`${cn.id}-expanded`} creditNote={cn} />
                  ) : null,
                ]
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
