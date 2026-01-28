'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, User, Building2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

interface Contact {
  id: string
  fullName: string
  email: string
  phone?: string
  company?: {
    id: string
    name: string
  }
}

interface Company {
  id: string
  name: string
  email?: string
}

interface LineItem {
  id: string
  description: string
  category?: string
  quantity: number
  unitPrice: number
  gstRate: number
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [loadingCompanies, setLoadingCompanies] = useState(false)

  // Customer selection
  const [customerType, setCustomerType] = useState<'contact' | 'company' | 'manual'>('manual')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedContactId, setSelectedContactId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  // Manual customer details
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerABN, setCustomerABN] = useState('')

  // Invoice details
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueInDays, setDueInDays] = useState(30)
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().slice(0, 10)
  })

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      description: '',
      category: '',
      quantity: 1,
      unitPrice: 0,
      gstRate: 10.0
    }
  ])

  // Additional charges
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount')
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [shippingAmount, setShippingAmount] = useState('')

  // Notes
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(
    'Payment is due within 30 days from the date of this invoice. Late payments may incur additional charges.'
  )
  const [footer, setFooter] = useState('Thank you for your business!')

  useEffect(() => {
    fetchContacts()
    fetchCompanies()
  }, [])

  useEffect(() => {
    // Auto-calculate due date when invoice date or due in days changes
    const date = new Date(invoiceDate)
    date.setDate(date.getDate() + parseInt(dueInDays.toString()))
    setDueDate(date.toISOString().slice(0, 10))
  }, [invoiceDate, dueInDays])

  useEffect(() => {
    // Auto-fill customer details when contact is selected
    if (selectedContactId) {
      const contact = contacts.find((c) => c.id === selectedContactId)
      if (contact) {
        setCustomerName(contact.company ? contact.company.name : contact.fullName)
        setCustomerEmail(contact.email)
        setCustomerPhone(contact.phone || '')
      }
    }
  }, [selectedContactId, contacts])

  useEffect(() => {
    // Auto-fill customer details when company is selected
    if (selectedCompanyId) {
      const company = companies.find((c) => c.id === selectedCompanyId)
      if (company) {
        setCustomerName(company.name)
        setCustomerEmail(company.email || '')
      }
    }
  }, [selectedCompanyId, companies])

  const fetchContacts = async () => {
    setLoadingContacts(true)
    try {
      const response = await fetch('/api/crm/contacts?limit=100')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const fetchCompanies = async () => {
    setLoadingCompanies(true)
    try {
      const response = await fetch('/api/crm/companies?limit=100')
      if (response.ok) {
        const data = await response.json()
        setCompanies(data.companies || [])
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error)
    } finally {
      setLoadingCompanies(false)
    }
  }

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        description: '',
        category: '',
        quantity: 1,
        unitPrice: 0,
        gstRate: 10.0
      }
    ])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length === 1) {
      toast.error('At least one line item is required')
      return
    }
    setLineItems(lineItems.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  const calculateFinancials = () => {
    let subtotal = 0

    lineItems.forEach((item) => {
      subtotal += item.quantity * item.unitPrice * 100
    })

    // Apply discount
    if (discountType === 'amount' && discountAmount) {
      subtotal -= parseFloat(discountAmount) * 100
    } else if (discountType === 'percentage' && discountPercentage) {
      const discount = subtotal * (parseFloat(discountPercentage) / 100)
      subtotal -= discount
    }

    // Add shipping
    if (shippingAmount) {
      subtotal += parseFloat(shippingAmount) * 100
    }

    const gst = Math.round(subtotal * 0.1)
    const total = subtotal + gst

    return {
      subtotal: Math.round(subtotal),
      gst,
      total
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
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

    try {
      setLoading(true)

      const payload: any = {
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
            unitPrice: Math.round(item.unitPrice * 100), // Convert to cents
            gstRate: item.gstRate
          })),
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        footer: footer.trim() || null
      }

      // Add CRM relationships
      if (customerType === 'contact' && selectedContactId) {
        const contact = contacts.find((c) => c.id === selectedContactId)
        payload.contactId = selectedContactId
        if (contact?.company) {
          payload.companyId = contact.company.id
        }
      } else if (customerType === 'company' && selectedCompanyId) {
        payload.companyId = selectedCompanyId
      }

      // Add discounts
      if (discountType === 'amount' && discountAmount) {
        payload.discountAmount = Math.round(parseFloat(discountAmount) * 100)
      } else if (discountType === 'percentage' && discountPercentage) {
        payload.discountPercentage = parseFloat(discountPercentage)
      }

      // Add shipping
      if (shippingAmount) {
        payload.shippingAmount = Math.round(parseFloat(shippingAmount) * 100)
      }

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Invoice created successfully')
        router.push(`/dashboard/invoices/${data.invoice.id}`)
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Failed to create invoice:', error)
      toast.error('An error occurred while creating the invoice')
    } finally {
      setLoading(false)
    }
  }

  const financials = calculateFinancials()

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/invoices')}
          className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Create New Invoice
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Fill in the details below to create a new invoice
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Customer Information
            </h2>

            {/* Customer Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Customer Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCustomerType('contact')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                    customerType === 'contact'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                  }`}
                >
                  <User className="h-4 w-4" />
                  <span>Contact</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('company')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                    customerType === 'company'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  <span>Company</span>
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
                  <span>Manual Entry</span>
                </button>
              </div>
            </div>

            {/* Contact Selection */}
            {customerType === 'contact' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Select Contact *
                  </label>
                  <select
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Choose a contact...</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.fullName}
                        {contact.company && ` (${contact.company.name})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Company Selection */}
            {customerType === 'company' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Select Company *
                  </label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Choose a company...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Manual Entry or Auto-filled Fields */}
            {(customerType === 'manual' || selectedContactId || selectedCompanyId) && (
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Address
                  </label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ABN
                  </label>
                  <input
                    type="text"
                    value={customerABN}
                    onChange={(e) => setCustomerABN(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Line Items
              </h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-3 items-start p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg"
                >
                  <div className="col-span-5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Description *
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(item.id, 'description', e.target.value)
                      }
                      required
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      required
                      min="0"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Unit Price ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      required
                      min="0"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Total
                    </label>
                    <div className="px-2 py-1.5 bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white">
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

          {/* Additional Charges */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Additional Charges & Discounts
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Discount Type
                </label>
                <select
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as 'amount' | 'percentage')
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="amount">Fixed Amount ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Discount Value
                </label>
                {discountType === 'amount' ? (
                  <input
                    type="number"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(e.target.value)}
                    placeholder="0"
                    max="100"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Shipping/Delivery ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={shippingAmount}
                  onChange={(e) => setShippingAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Notes & Terms
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Internal Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes (not visible to customer)"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Terms
                </label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Footer
                </label>
                <input
                  type="text"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Invoice Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Invoice Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Due In (Days)
                </label>
                <input
                  type="number"
                  value={dueInDays}
                  onChange={(e) => setDueInDays(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Financial Summary
            </h2>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal (Ex GST)</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  ${(financials.subtotal / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">GST (10%)</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  ${(financials.gst / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-900 dark:text-white">Total</span>
                <span className="text-slate-900 dark:text-white">
                  ${(financials.total / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Creating Invoice...' : 'Create Invoice'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/invoices')}
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
