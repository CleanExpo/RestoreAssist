'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  Download,
  Mail,
  DollarSign,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  CreditCard,
  RefreshCw,
  ExternalLink,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

interface LineItem {
  id: string
  description: string
  category?: string
  quantity: number
  unitPrice: number
  subtotal: number
  gstRate: number
  gstAmount: number
  total: number
}

interface Payment {
  id: string
  amount: number
  paymentMethod: string
  paymentDate: string
  reference?: string
  notes?: string
}

interface AuditLog {
  id: string
  action: string
  description: string
  createdAt: string
  user?: {
    name: string
    email: string
  }
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  invoiceDate: string
  dueDate: string
  paidDate?: string
  sentDate?: string

  customerName: string
  customerEmail: string
  customerPhone?: string
  customerAddress?: string
  customerABN?: string

  subtotalExGST: number
  gstAmount: number
  totalIncGST: number
  amountPaid: number
  amountDue: number

  discountAmount?: number
  discountPercentage?: number
  shippingAmount?: number

  notes?: string
  terms?: string
  footer?: string

  // External sync fields
  externalInvoiceId?: string
  externalSyncProvider?: string
  externalSyncStatus?: string
  externalSyncedAt?: string
  externalSyncError?: string

  lineItems: LineItem[]
  payments: Payment[]
  auditLogs: AuditLog[]

  contact?: {
    id: string
    fullName: string
  }
  company?: {
    id: string
    name: string
  }
  report?: {
    id: string
    title: string
  }
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showSyncMenu, setShowSyncMenu] = useState(false)

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setInvoiceId(resolvedParams.id)
    }
    getParams()
  }, [params])

  useEffect(() => {
    if (!invoiceId) return
    fetchInvoice()
  }, [invoiceId])

  const fetchInvoice = async () => {
    if (!invoiceId) return

    try {
      setLoading(true)
      const response = await fetch(`/api/invoices/${invoiceId}`)
      if (response.ok) {
        const data = await response.json()
        setInvoice(data.invoice)
      } else {
        toast.error('Invoice not found')
        router.push('/dashboard/invoices')
      }
    } catch (error) {
      console.error('Failed to fetch invoice:', error)
      toast.error('Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }

  const handleSendInvoice = async () => {
    if (!invoiceId) return

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Invoice sent successfully')
        fetchInvoice()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to send invoice')
      }
    } catch (error) {
      console.error('Failed to send invoice:', error)
      toast.error('An error occurred while sending the invoice')
    }
  }

  const handlePayOnline = async () => {
    if (!invoiceId) return

    try {
      setCreatingCheckout(true)
      const response = await fetch(`/api/invoices/${invoiceId}/checkout`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create checkout session')
        setCreatingCheckout(false)
      }
    } catch (error) {
      console.error('Failed to create checkout:', error)
      toast.error('An error occurred while creating the checkout session')
      setCreatingCheckout(false)
    }
  }

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceId || !invoice) return

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (amount > invoice.amountDue / 100) {
      toast.error('Payment amount exceeds amount due')
      return
    }

    try {
      setRecordingPayment(true)

      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          paymentMethod,
          reference: paymentReference || null,
          notes: paymentNotes || null
        })
      })

      if (response.ok) {
        toast.success('Payment recorded successfully')
        setShowRecordPayment(false)
        setPaymentAmount('')
        setPaymentReference('')
        setPaymentNotes('')
        fetchInvoice()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to record payment')
      }
    } catch (error) {
      console.error('Failed to record payment:', error)
      toast.error('An error occurred while recording the payment')
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleSyncToAccounting = async (provider: string) => {
    if (!invoiceId) return

    try {
      setSyncing(true)
      setShowSyncMenu(false)

      const response = await fetch(`/api/invoices/${invoiceId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.toLowerCase() })
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Invoice synced successfully to ${provider}`)
        fetchInvoice()
      } else {
        const error = await response.json()
        toast.error(error.error || `Failed to sync to ${provider}`)
      }
    } catch (error) {
      console.error('Failed to sync invoice:', error)
      toast.error('An error occurred while syncing the invoice')
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async () => {
    if (!invoiceId || !invoice) return

    if (!confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast.success('Invoice deleted successfully')
        router.push('/dashboard/invoices')
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to delete invoice')
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error)
      toast.error('An error occurred while deleting the invoice')
    }
  }

  const downloadPDF = () => {
    if (!invoiceId) return
    window.open(`/api/invoices/${invoiceId}/pdf`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Invoice Not Found</h2>
          <p className="text-slate-400 mb-4">The requested invoice could not be found.</p>
          <button
            onClick={() => router.push('/dashboard/invoices')}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      DRAFT: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', icon: Clock },
      SENT: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: Mail },
      VIEWED: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', icon: FileText },
      PARTIALLY_PAID: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', icon: DollarSign },
      PAID: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle },
      OVERDUE: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', icon: AlertCircle },
      CANCELLED: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', icon: Clock }
    }

    const style = styles[status as keyof typeof styles] || styles.DRAFT
    const Icon = style.icon

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${style.bg} ${style.text}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{status.replace(/_/g, ' ')}</span>
      </div>
    )
  }

  const isDraft = invoice.status === 'DRAFT'
  const canEdit = isDraft
  const canDelete = isDraft || invoice.status === 'CANCELLED'
  const canSend = isDraft
  const canRecordPayment = invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && invoice.amountDue > 0

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/invoices')}
            className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Invoice {invoice.invoiceNumber}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Created {new Date(invoice.invoiceDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSend && (
            <button
              onClick={handleSendInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <Mail className="h-4 w-4" />
              <span>Send Invoice</span>
            </button>
          )}
          {canRecordPayment && (
            <>
              <button
                onClick={handlePayOnline}
                disabled={creatingCheckout}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                <span>{creatingCheckout ? 'Loading...' : 'Pay Online'}</span>
              </button>
              <button
                onClick={() => setShowRecordPayment(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
              >
                <DollarSign className="h-4 w-4" />
                <span>Record Payment</span>
              </button>
            </>
          )}
          {!isDraft && (
            <div className="relative">
              <button
                onClick={() => setShowSyncMenu(!showSyncMenu)}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync to Accounting'}</span>
              </button>
              {showSyncMenu && !syncing && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
                  <div className="py-1">
                    <button
                      onClick={() => handleSyncToAccounting('xero')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Sync to Xero
                    </button>
                    <button
                      onClick={() => handleSyncToAccounting('quickbooks')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Sync to QuickBooks
                    </button>
                    <button
                      onClick={() => handleSyncToAccounting('myob')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Sync to MYOB
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Download PDF</span>
          </button>
          {canEdit && (
            <button
              onClick={() => router.push(`/dashboard/invoices/${invoice.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
            >
              <Edit className="h-4 w-4" />
              <span>Edit</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg transition-colors"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-4 flex-wrap">
        {getStatusBadge(invoice.status)}
        {invoice.sentDate && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Mail className="h-4 w-4" />
            <span>Sent {new Date(invoice.sentDate).toLocaleDateString()}</span>
          </div>
        )}
        {invoice.paidDate && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            <span>Paid {new Date(invoice.paidDate).toLocaleDateString()}</span>
          </div>
        )}
        {/* External Sync Status */}
        {invoice.externalSyncStatus === 'SYNCED' && invoice.externalSyncProvider && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">
              Synced to {invoice.externalSyncProvider.charAt(0).toUpperCase() + invoice.externalSyncProvider.slice(1)}
            </span>
            {invoice.externalInvoiceId && (
              <ExternalLink className="h-3 w-3" />
            )}
          </div>
        )}
        {invoice.externalSyncStatus === 'PENDING' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Syncing...</span>
          </div>
        )}
        {invoice.externalSyncStatus === 'FAILED' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Sync Failed</span>
          </div>
        )}
      </div>

      {/* Sync Error Display */}
      {invoice.externalSyncStatus === 'FAILED' && invoice.externalSyncError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-600 dark:text-red-400 mb-1">
                Sync Error
              </h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80">
                {invoice.externalSyncError}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Information */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Customer Information
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-slate-600 dark:text-slate-400 mt-0.5" />
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {invoice.customerName}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <a
                  href={`mailto:${invoice.customerEmail}`}
                  className="text-cyan-500 hover:text-cyan-600 transition-colors"
                >
                  {invoice.customerEmail}
                </a>
              </div>
              {invoice.customerPhone && (
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">{invoice.customerPhone}</span>
                </div>
              )}
              {invoice.customerAddress && (
                <div className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                  {invoice.customerAddress}
                </div>
              )}
              {invoice.customerABN && (
                <div className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                  ABN: {invoice.customerABN}
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Line Items
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Qty
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Unit Price
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      GST
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {item.description}
                        </div>
                        {item.category && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {item.category}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-900 dark:text-white">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-900 dark:text-white">
                        ${(item.unitPrice / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-400">
                        ${(item.gstAmount / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-slate-900 dark:text-white">
                        ${(item.total / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="p-6 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-200 dark:border-slate-700">
              <div className="max-w-sm ml-auto space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal (Ex GST)</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    ${(invoice.subtotalExGST / 100).toFixed(2)}
                  </span>
                </div>
                {invoice.discountAmount && invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span>-${(invoice.discountAmount / 100).toFixed(2)}</span>
                  </div>
                )}
                {invoice.shippingAmount && invoice.shippingAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Shipping</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      ${(invoice.shippingAmount / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">GST (10%)</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    ${(invoice.gstAmount / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-900 dark:text-white">Total</span>
                  <span className="text-slate-900 dark:text-white">
                    ${(invoice.totalIncGST / 100).toFixed(2)}
                  </span>
                </div>
                {invoice.amountPaid > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                      <span>Amount Paid</span>
                      <span>-${(invoice.amountPaid / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-amber-600 dark:text-amber-400">
                      <span>Amount Due</span>
                      <span>${(invoice.amountDue / 100).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Payment History */}
          {invoice.payments.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Payment History
              </h2>
              <div className="space-y-3">
                {invoice.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <CreditCard className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          ${(payment.amount / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {payment.paymentMethod.replace(/_/g, ' ')}
                          {payment.reference && ` • ${payment.reference}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {new Date(payment.paymentDate).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {(invoice.notes || invoice.terms) && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Additional Information
              </h2>
              {invoice.notes && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Notes
                  </div>
                  <div className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                    {invoice.notes}
                  </div>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Payment Terms
                  </div>
                  <div className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                    {invoice.terms}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Due Date Card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Payment Due
            </h2>
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Due Date</div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </div>
              </div>
            </div>
            {invoice.report && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Related Report
                </div>
                <button
                  onClick={() => router.push(`/dashboard/reports/${invoice.report?.id}`)}
                  className="text-sm text-cyan-500 hover:text-cyan-600 transition-colors"
                >
                  {invoice.report.title}
                </button>
              </div>
            )}
          </div>

          {/* Activity Log */}
          {invoice.auditLogs.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Activity Log
              </h2>
              <div className="space-y-3">
                {invoice.auditLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="text-sm">
                    <div className="text-slate-900 dark:text-white">{log.description}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.user && ` • ${log.user.name}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {showRecordPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Record Payment
            </h2>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Amount Due: ${(invoice.amountDue / 100).toFixed(2)}
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  max={(invoice.amountDue / 100).toFixed(2)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="PAYPAL">PayPal</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Transaction ID, Cheque #, etc."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRecordPayment(false)}
                  disabled={recordingPayment}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPayment}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {recordingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
