'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  FileText,
  Download,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'
import {
  getEffectiveStatus,
  getStatusConfig,
  FILTER_STATUS_OPTIONS,
} from '@/lib/invoice-status'

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

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
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
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                >
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
    </div>
  )
}
