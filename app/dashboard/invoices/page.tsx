'use client'

import {
  getEffectiveStatus,
  getStatusConfig,
  isDraft,
  isCancelled,
} from '@/lib/invoice-status'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  FileText,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  customerName: string
  invoiceDate: string
  dueDate: string
  totalIncGST: number
  amountPaid: number
  amountDue: number
  _count: {
    lineItems: number
    payments: number
  }
}

export default function InvoicesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Stats (amounts in cents from API)
  const [stats, setStats] = useState({
    totalRevenue: 0,
    outstanding: 0,
    overdue: 0,
    paidThisMonth: 0,
    draftTotal: 0
  })

  // Bulk delete: selected invoice IDs (only DRAFT/CANCELLED can be deleted)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canDeleteInvoice = (invoice: Invoice) => isDraft(invoice.status) || isCancelled(invoice.status)
  const deletableInvoices = invoices.filter(canDeleteInvoice)
  const selectedCount = selectedIds.size
  const allDeletableSelected =
    deletableInvoices.length > 0 &&
    deletableInvoices.every((inv) => selectedIds.has(inv.id))

  const toggleSelect = (id: string, invoice: Invoice) => {
    if (!canDeleteInvoice(invoice)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllDeletable = () => {
    if (allDeletableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(deletableInvoices.map((inv) => inv.id)))
    }
  }

  const openDeleteDialog = () => {
    if (selectedCount === 0) return
    setShowDeleteDialog(true)
  }

  const handleBulkDelete = async () => {
    if (selectedCount === 0) return
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/invoices/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
      const succeeded = results.length - failed.length
      if (succeeded > 0) {
        setSelectedIds(new Set())
        setShowDeleteDialog(false)
        toast.success(
          succeeded === 1
            ? 'Invoice deleted successfully'
            : `${succeeded} invoices deleted successfully`
        )
        fetchInvoices()
        fetchStats()
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? 'Failed to delete one invoice'
            : `Failed to delete ${failed.length} invoices`
        )
      }
    } catch (e) {
      console.error('Bulk delete error:', e)
      toast.error('An error occurred while deleting invoices')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchInvoices()
      fetchStats()
    }
  }, [status, search, statusFilter])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statusFilter) params.append('status', statusFilter)

      const res = await fetch(`/api/invoices?${params}`)
      const data = await res.json()
      setInvoices(data.invoices || [])
    } catch (error) {
      console.error('Failed to fetch invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/invoices/analytics')
      const data = await res.json()
      setStats({
        totalRevenue: data.stats?.totalRevenue ?? 0,
        outstanding: data.stats?.outstanding ?? 0,
        overdue: data.stats?.overdue ?? 0,
        paidThisMonth: data.stats?.paidThisMonth ?? 0,
        draftTotal: data.stats?.draftTotal ?? 0
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const getStatusBadge = (invoice: { status: string; dueDate: string; amountDue: number }) => {
    const effective = getEffectiveStatus(invoice)
    const config = getStatusConfig(effective)
    return (
      <span className={`text-xs px-2 py-1 rounded ${config.badgeClass}`} title={config.description}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="max-w-9xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Invoices
        </h1>
        <Link
          href="/dashboard/invoices/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:scale-[1.02] transition-transform"
        >
          <Plus className="h-5 w-5" />
          New Invoice
        </Link>
      </div>

      {/* Stats Cards (amounts in cents, divide by 100 for display) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(stats.totalRevenue / 100).toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Total Revenue
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-500/10 rounded-lg">
              <FileText className="h-6 w-6 text-slate-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(stats.draftTotal / 100).toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Drafts
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(stats.outstanding / 100).toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Outstanding
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(stats.overdue / 100).toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Overdue
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 rounded-lg">
              <CheckCircle className="h-6 w-6 text-cyan-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(stats.paidThisMonth / 100).toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Paid This Month
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filters, and Bulk Actions */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center">
        <div className="flex-1 w-full md:max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="VIEWED">Viewed</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
        </select>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {selectedCount} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={openDeleteDialog}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete selected
            </button>
          </div>
        )}
      </div>

      {/* Invoice Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          Loading invoices...
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            No invoices found
          </p>
          <Link
            href="/dashboard/invoices/new"
            className="inline-block mt-4 text-cyan-500 hover:text-cyan-600"
          >
            Create your first invoice
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  {deletableInvoices.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={allDeletableSelected}
                      onChange={toggleSelectAllDeletable}
                      className="rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500"
                      aria-label="Select all deletable invoices"
                    />
                  ) : null}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer ${selectedIds.has(invoice.id) ? 'bg-cyan-500/5 dark:bg-cyan-500/10' : ''}`}
                  onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                >
                  <td
                    className="px-4 py-4 whitespace-nowrap w-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canDeleteInvoice(invoice) ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(invoice.id)}
                        onChange={() => toggleSelect(invoice.id, invoice)}
                        className="rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500"
                        aria-label={`Select ${invoice.invoiceNumber}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {invoice.invoiceNumber}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {invoice._count.lineItems} items
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 dark:text-white">
                      {invoice.customerName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {new Date(invoice.invoiceDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {new Date(invoice.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      ${(invoice.totalIncGST / 100).toFixed(2)}
                    </div>
                    {invoice.amountPaid > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        ${(invoice.amountPaid / 100).toFixed(2)} paid
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge({
                      status: invoice.status,
                      dueDate: invoice.dueDate,
                      amountDue: invoice.amountDue,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')
                      }}
                      className="text-cyan-500 hover:text-cyan-600"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete selected confirmation dialog */}
      {showDeleteDialog && selectedCount > 0 && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleting && setShowDeleteDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-dialog-title"
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                id="bulk-delete-dialog-title"
                className="text-xl font-semibold text-red-600 dark:text-red-400"
              >
                Delete {selectedCount} invoice{selectedCount !== 1 ? 's' : ''}?
              </h2>
              <button
                type="button"
                onClick={() => !deleting && setShowDeleteDialog(false)}
                disabled={deleting}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              This action cannot be undone. Only draft and cancelled invoices can be deleted.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !deleting && setShowDeleteDialog(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
