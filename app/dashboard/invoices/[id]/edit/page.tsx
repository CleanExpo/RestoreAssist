'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, User, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Client {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  company?: string
}

interface LineItem {
  id: string
  description: string
  category?: string
  quantity: number
  unitPrice: number
  gstRate: number
}

interface FetchedInvoice {
  id: string
  invoiceNumber: string
  status: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  customerAddress?: string | null
  customerABN?: string | null
  invoiceDate: string
  dueDate: string
  lineItems: Array<{
    id: string
    description: string
    category?: string | null
    quantity: number
    unitPrice: number
    gstRate: number
  }>
  discountAmount?: number | null
  discountPercentage?: number | null
  shippingAmount?: number | null
  notes?: string | null
  terms?: string | null
  footer?: string | null
}

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loadingClients, setLoadingClients] = useState(false)

  const [customerType, setCustomerType] = useState<'client' | 'manual'>('manual')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerABN, setCustomerABN] = useState('')

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueInDays, setDueInDays] = useState(30)
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().slice(0, 10)
  })

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: '', category: '', quantity: 1, unitPrice: 0, gstRate: 10.0 }
  ])

  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount')
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [shippingAmount, setShippingAmount] = useState('')

  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(
    'Payment is due within 30 days from the date of this invoice. Late payments may incur additional charges.'
  )
  const [footer, setFooter] = useState('Thank you for your business!')

  useEffect(() => {
    const resolve = async () => {
      const { id } = await params
      setInvoiceId(id)
    }
    resolve()
  }, [params])

  useEffect(() => {
    if (!invoiceId) return
    const fetchInvoice = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setFetchError(err.error || 'Invoice not found')
          return
        }
        const data = await res.json()
        const inv: FetchedInvoice = data.invoice
        if (inv.status !== 'DRAFT') {
          setFetchError('Only draft invoices can be edited.')
          return
        }
        setCustomerName(inv.customerName || '')
        setCustomerEmail(inv.customerEmail || '')
        setCustomerPhone(inv.customerPhone || '')
        setCustomerAddress(inv.customerAddress || '')
        setCustomerABN(inv.customerABN || '')
        setInvoiceDate(inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
        setDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
        if (inv.invoiceDate && inv.dueDate) {
          const days = Math.round((new Date(inv.dueDate).getTime() - new Date(inv.invoiceDate).getTime()) / (24 * 60 * 60 * 1000))
          setDueInDays(days >= 0 ? days : 30)
        }
        setLineItems(
          inv.lineItems?.length
            ? inv.lineItems.map((li) => ({
                id: li.id || crypto.randomUUID(),
                description: li.description || '',
                category: li.category || '',
                quantity: li.quantity ?? 1,
                unitPrice: typeof li.unitPrice === 'number' ? li.unitPrice / 100 : 0,
                gstRate: li.gstRate ?? 10.0
              }))
            : [{ id: crypto.randomUUID(), description: '', category: '', quantity: 1, unitPrice: 0, gstRate: 10.0 }]
        )
        if (inv.discountAmount != null && inv.discountAmount > 0) {
          setDiscountType('amount')
          setDiscountAmount((inv.discountAmount / 100).toFixed(2))
        } else if (inv.discountPercentage != null && inv.discountPercentage > 0) {
          setDiscountType('percentage')
          setDiscountPercentage(String(inv.discountPercentage))
        }
        if (inv.shippingAmount != null && inv.shippingAmount > 0) {
          setShippingAmount((inv.shippingAmount / 100).toFixed(2))
        }
        setNotes(inv.notes || '')
        setTerms(inv.terms || 'Payment is due within 30 days from the date of this invoice. Late payments may incur additional charges.')
        setFooter(inv.footer || 'Thank you for your business!')
      } catch (e) {
        setFetchError('Failed to load invoice')
      } finally {
        setFetching(false)
      }
    }
    fetchInvoice()
  }, [invoiceId])

  useEffect(() => {
    const date = new Date(invoiceDate)
    date.setDate(date.getDate() + parseInt(String(dueInDays), 10))
    setDueDate(date.toISOString().slice(0, 10))
  }, [invoiceDate, dueInDays])

  useEffect(() => {
    if (selectedClientId && clients.length) {
      const client = clients.find((c) => c.id === selectedClientId)
      if (client) {
        setCustomerName(client.name)
        setCustomerEmail(client.email)
        setCustomerPhone(client.phone || '')
        setCustomerAddress(client.address || '')
      }
    }
  }, [selectedClientId, clients])

  useEffect(() => {
    fetch('/api/clients?limit=100')
      .then((r) => r.ok ? r.json() : { clients: [] })
      .then((d) => setClients(d.clients || []))
      .catch(() => {})
      .finally(() => setLoadingClients(false))
  }, [])

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', category: '', quantity: 1, unitPrice: 0, gstRate: 10.0 }
    ])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) {
      toast.error('At least one line item is required')
      return
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const calculateFinancials = () => {
    let subtotal = 0
    lineItems.forEach((item) => {
      subtotal += item.quantity * item.unitPrice * 100
    })
    if (discountType === 'amount' && discountAmount) {
      subtotal -= parseFloat(discountAmount) * 100
    } else if (discountType === 'percentage' && discountPercentage) {
      subtotal -= subtotal * (parseFloat(discountPercentage) / 100)
    }
    if (shippingAmount) {
      subtotal += parseFloat(shippingAmount) * 100
    }
    const gst = Math.round(subtotal * 0.1)
    return { subtotal: Math.round(subtotal), gst, total: Math.round(subtotal) + gst }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceId) return
    if (!customerName.trim()) {
      toast.error('Customer name is required')
      return
    }
    if (!customerEmail.trim()) {
      toast.error('Customer email is required')
      return
    }
    const hasValidItems = lineItems.some(
      (item) => item.description.trim() && item.quantity > 0 && item.unitPrice > 0
    )
    if (!hasValidItems) {
      toast.error('At least one valid line item is required')
      return
    }

    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || null,
        customerAddress: customerAddress.trim() || null,
        customerABN: customerABN.trim() || null,
        invoiceDate,
        dueDate,
        lineItems: lineItems
          .filter((item) => item.description.trim() && item.quantity > 0)
          .map((item) => ({
            description: item.description.trim(),
            category: item.category?.trim() || null,
            quantity: item.quantity,
            unitPrice: Math.round(item.unitPrice * 100),
            gstRate: item.gstRate
          })),
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        footer: footer.trim() || null
      }
      if (discountType === 'amount' && discountAmount) {
        payload.discountAmount = Math.round(parseFloat(discountAmount) * 100)
      } else if (discountType === 'percentage' && discountPercentage) {
        payload.discountPercentage = parseFloat(discountPercentage)
      }
      if (shippingAmount) {
        payload.shippingAmount = Math.round(parseFloat(shippingAmount) * 100)
      }

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success('Invoice updated successfully')
        router.push(`/dashboard/invoices/${invoiceId}`)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to update invoice')
      }
    } catch (err) {
      console.error(err)
      toast.error('An error occurred while updating the invoice')
    } finally {
      setLoading(false)
    }
  }

  const financials = calculateFinancials()

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent" />
      </div>
    )
  }

  if (fetchError || !invoiceId) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 mb-4">{fetchError || 'Invalid invoice'}</p>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/invoices/${invoiceId}`)}
          className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Invoice</h1>
          <p className="text-slate-600 dark:text-slate-400">Update the details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Customer Information</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Customer Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCustomerType('client')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                    customerType === 'client'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                  }`}
                >
                  <User className="h-4 w-4" />
                  Existing Client
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('manual')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                    customerType === 'manual'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Manual Entry
                </button>
              </div>
            </div>
            {customerType === 'client' && (
              <div className="space-y-4 mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Client *</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="">Choose a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email *</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ABN</label>
                <input
                  type="text"
                  value={customerABN}
                  onChange={(e) => setCustomerABN(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Line Items</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
            <div className="space-y-3">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-3 items-start p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg"
                >
                  <div className="col-span-5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description *</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      required
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Qty *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      required
                      min={0}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Unit Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      required
                      min={0}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Total</label>
                    <div className="px-2 py-1.5 bg-slate-100 dark:bg-slate-600 rounded text-sm text-slate-900 dark:text-white">
                      ${(item.quantity * item.unitPrice).toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Additional Charges & Discounts</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Discount Type</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'amount' | 'percentage')}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="amount">Fixed Amount ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Discount Value</label>
                {discountType === 'amount' ? (
                  <input
                    type="number"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                  />
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(e.target.value)}
                    placeholder="0"
                    max={100}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shipping ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={shippingAmount}
                  onChange={(e) => setShippingAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Notes & Terms</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Footer</label>
                <input
                  type="text"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Invoice Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Invoice Date *</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due In (Days)</label>
                <input
                  type="number"
                  value={dueInDays}
                  onChange={(e) => setDueInDays(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Financial Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal (Ex GST)</span>
                <span className="font-medium text-slate-900 dark:text-white">${(financials.subtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">GST (10%)</span>
                <span className="font-medium text-slate-900 dark:text-white">${(financials.gst / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-900 dark:text-white">Total</span>
                <span className="text-slate-900 dark:text-white">${(financials.total / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Invoice'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/invoices/${invoiceId}`)}
              disabled={loading}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
