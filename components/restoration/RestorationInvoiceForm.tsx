"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  RESTORATION_INVOICE_TYPES,
  getRestorationInvoiceTypeById,
  type RestorationInvoiceTypeLineItem,
} from "@/lib/restoration-invoice-types"
import { cn } from "@/lib/utils"
import { Printer, Save, Loader2, ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"

export interface RestorationInvoiceFormData {
  invoiceTypeId: string
  companyName: string
  invNum: string
  invDate: string
  dueDate: string
  contractor: {
    business: string
    abn: string
    qbccLic: string
    address: string
    phone: string
    email: string
  }
  client: {
    name: string
    address: string
    phone: string
    email: string
    insurer: string
    policyNum: string
    claimNum: string
  }
  event: {
    lossDate: string
    lossCause: string
    pdsEvent: string
    waterCat: string
    damageClass: string
    affectedArea: string
  }
  lineItems: RestorationInvoiceTypeLineItem[]
  excessAmt: string
  cert: {
    standardApplied: string
    technicianCert: string
    preLossMoisture: string
    postDryMoisture: string
    dryingDays: string
    equipmentUsed: string
    publicLiability: string
    contractorInsurer: string
  }
  payment: {
    bankName: string
    bsb: string
    accountNum: string
    accountName: string
    reference: string
  }
}

const defaultFormData: RestorationInvoiceFormData = {
  invoiceTypeId: "water",
  companyName: "[Your Company Name Pty Ltd]",
  invNum: "",
  invDate: "",
  dueDate: "",
  contractor: {
    business: "[Your Company Name Pty Ltd]",
    abn: "XX XXX XXX XXX",
    qbccLic: "[Licence Number]",
    address: "[Business Address, QLD]",
    phone: "[Phone Number]",
    email: "[Email Address]",
  },
  client: {
    name: "[Client Full Name]",
    address: "[Insured Property Address]",
    phone: "[Client Phone]",
    email: "[Client Email]",
    insurer: "[Insurance Company Name]",
    policyNum: "[Policy Number]",
    claimNum: "[Claim Number if known]",
  },
  event: {
    lossDate: "",
    lossCause: "Escape of liquid — burst flexi hose",
    pdsEvent: "Escape of Liquid (Event 10)",
    waterCat: "Category 1 — Clean Water",
    damageClass: "Class 1 — Least amount of absorption",
    affectedArea: "[e.g., Kitchen, Bathroom, Hallway — approx 45m²]",
  },
  lineItems: [],
  excessAmt: "0.00",
  cert: {
    standardApplied: "AS-IICRC S500:2025",
    technicianCert: "[IICRC WRT #]",
    preLossMoisture: "[Readings / Baseline]",
    postDryMoisture: "[Readings / Confirmation]",
    dryingDays: "[Number of days]",
    equipmentUsed: "[e.g., 4x Air Movers, 2x LGR Dehumidifiers, 1x Air Scrubber]",
    publicLiability: "$20,000,000",
    contractorInsurer: "[Contractor's Insurer]",
  },
  payment: {
    bankName: "[Bank Name]",
    bsb: "[BSB]",
    accountNum: "[Account Number]",
    accountName: "[Account Name]",
    reference: "[Invoice Number]",
  },
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export default function RestorationInvoiceForm({
  documentId,
  reportId,
  initialSeed,
  initialSavedData,
  suggestedInvoiceNumber,
  defaultInvDate,
  defaultDueDate,
}: {
  documentId?: string
  reportId?: string | null
  initialSeed?: {
    profile?: { companyName?: string; businessAddress?: string; abn?: string; phone?: string; email?: string }
    report?: {
      clientName?: string
      propertyAddress?: string
      clientContact?: string
      insurerName?: string
      claimReferenceNumber?: string
      incidentDate?: string
      waterCategory?: string
      waterClass?: string
      sourceOfWater?: string
      affectedArea?: string
    }
    suggestedInvoiceNumber?: string
    defaultInvDate?: string
    defaultDueDate?: string
  }
  initialSavedData?: RestorationInvoiceFormData | null
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<RestorationInvoiceFormData>(() => {
    const base = initialSavedData
      ? { ...defaultFormData, ...initialSavedData }
      : { ...defaultFormData }
    if (initialSeed?.profile) {
      base.companyName = initialSeed.profile.companyName ?? base.companyName
      base.contractor.business = initialSeed.profile.companyName ?? base.contractor.business
      base.contractor.address = initialSeed.profile.businessAddress ?? base.contractor.address
      base.contractor.abn = initialSeed.profile.abn ?? base.contractor.abn
      base.contractor.phone = initialSeed.profile.phone ?? base.contractor.phone
      base.contractor.email = initialSeed.profile.email ?? base.contractor.email
    }
    if (initialSeed?.report) {
      base.client.name = initialSeed.report.clientName ?? base.client.name
      base.client.address = initialSeed.report.propertyAddress ?? base.client.address
      base.client.insurer = initialSeed.report.insurerName ?? base.client.insurer
      base.client.claimNum = initialSeed.report.claimReferenceNumber ?? base.client.claimNum
      base.event.lossDate = initialSeed.report.incidentDate ?? base.event.lossDate
      base.event.waterCat = initialSeed.report.waterCategory ?? base.event.waterCat
      base.event.damageClass = initialSeed.report.waterClass ?? base.event.damageClass
      base.event.affectedArea = initialSeed.report.affectedArea ?? base.event.affectedArea
    }
    if (initialSeed?.suggestedInvoiceNumber) base.invNum = initialSeed.suggestedInvoiceNumber
    if (initialSeed?.defaultInvDate) base.invDate = initialSeed.defaultInvDate
    if (initialSeed?.defaultDueDate) base.dueDate = initialSeed.defaultDueDate
    if (!initialSavedData && base.lineItems.length === 0) {
      const typeConfig = getRestorationInvoiceTypeById(base.invoiceTypeId)
      base.lineItems = typeConfig ? [...typeConfig.defaultLineItems] : []
    }
    return base
  })

  const typeConfig = getRestorationInvoiceTypeById(data.invoiceTypeId)

  const setInvoiceType = useCallback((id: string) => {
    const config = getRestorationInvoiceTypeById(id)
    setData((prev) => ({
      ...prev,
      invoiceTypeId: id,
      lineItems: config ? config.defaultLineItems.map((i) => ({ ...i })) : prev.lineItems,
      cert: {
        ...prev.cert,
        standardApplied: config?.standardApplied ?? prev.cert.standardApplied,
      },
    }))
  }, [])

  useEffect(() => {
    if (!typeConfig) return
    setData((prev) => ({
      ...prev,
      cert: { ...prev.cert, standardApplied: typeConfig.standardApplied },
    }))
  }, [data.invoiceTypeId])

  const update = useCallback((updates: Partial<RestorationInvoiceFormData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }, [])

  const updateContractor = useCallback((k: keyof RestorationInvoiceFormData["contractor"], v: string) => {
    setData((prev) => ({ ...prev, contractor: { ...prev.contractor, [k]: v } }))
  }, [])

  const updateClient = useCallback((k: keyof RestorationInvoiceFormData["client"], v: string) => {
    setData((prev) => ({ ...prev, client: { ...prev.client, [k]: v } }))
  }, [])

  const updateEvent = useCallback((k: keyof RestorationInvoiceFormData["event"], v: string) => {
    setData((prev) => ({ ...prev, event: { ...prev.event, [k]: v } }))
  }, [])

  const updateCert = useCallback((k: keyof RestorationInvoiceFormData["cert"], v: string) => {
    setData((prev) => ({ ...prev, cert: { ...prev.cert, [k]: v } }))
  }, [])

  const updatePayment = useCallback((k: keyof RestorationInvoiceFormData["payment"], v: string) => {
    setData((prev) => ({ ...prev, payment: { ...prev.payment, [k]: v } }))
  }, [])

  const setLineItem = useCallback((index: number, item: RestorationInvoiceTypeLineItem) => {
    setData((prev) => {
      const next = [...prev.lineItems]
      next[index] = item
      return { ...prev, lineItems: next }
    })
  }, [])

  const addLineItem = useCallback(() => {
    setData((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { description: "", qty: "1", unit: "EA", rate: "0.00" }],
    }))
  }, [])

  const removeLineItem = useCallback((index: number) => {
    setData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }))
  }, [])

  const subtotal = data.lineItems.reduce(
    (sum, i) => sum + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0),
    0
  )
  const gst = round2(subtotal * 0.1)
  const total = round2(subtotal + gst)
  const excess = parseFloat(data.excessAmt) || 0
  const netReimburse = Math.max(0, total - excess)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        documentType: "RESTORATION_INVOICE",
        documentNumber: data.invNum,
        title: typeConfig?.title ?? "Restoration Tax Invoice",
        reportId: reportId || null,
        data: { ...data, invoiceTypeId: data.invoiceTypeId },
      }
      if (documentId) {
        const res = await fetch(`/api/restoration-documents/${documentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentNumber: data.invNum,
            title: payload.title,
            reportId: payload.reportId,
            data: payload.data,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update")
        toast.success("Document saved")
      } else {
        const res = await fetch("/api/restoration-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
        const { document } = await res.json()
        toast.success("Document saved")
        router.replace(`/dashboard/restoration-documents/invoice/${document.id}`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Print styles: show only invoice (same pattern as inspection report) */}
      <style dangerouslySetInnerHTML={{ __html: `
@media print {
  @page {
    size: A4 portrait;
    margin: 20mm;
    marks: none;
  }
  body::after, body::before, html::after, html::before {
    display: none !important;
    content: none !important;
  }
  html, body {
    width: 210mm;
    height: auto;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }
  /* Hide fixed/sticky UI (header, sidebar, toasts) so they never show in print (avoids e.g. time/badge overlay) */
  body header,
  body aside,
  body [role="status"],
  body [aria-live],
  body [class*="fixed"],
  body [class*="sticky"]:not(#restoration-invoice-print-content *),
  body > div > div[style*="position: fixed"],
  body > div > div[style*="position:fixed"] {
    display: none !important;
    visibility: hidden !important;
  }
  body * {
    visibility: hidden !important;
  }
  #restoration-invoice-print-content,
  #restoration-invoice-print-content * {
    visibility: visible !important;
  }
  #restoration-invoice-print-content {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 210mm !important;
    max-width: 210mm !important;
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
    color: #111 !important;
  }
  .print\\:max-w-none { max-width: 100% !important; }
  .print\\:border-0 { border: 0 !important; }
  .print\\:shadow-none { box-shadow: none !important; }
  .print\\:p-6 { padding: 1.5rem !important; }
  * { box-shadow: none !important; }
}
      ` }} />
      {/* Top actions - hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <button
          type="button"
          onClick={() => router.push("/dashboard/restoration-documents")}
          className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to documents
        </button>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-700 dark:text-slate-300">
            Invoice type:
          </label>
          <select
            value={data.invoiceTypeId}
            onChange={(e) => setInvoiceType(e.target.value)}
            className={cn(
              "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            )}
          >
            {RESTORATION_INVOICE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {/* Invoice document - print container (id targeted by @media print) */}
      <div
        id="restoration-invoice-print-content"
        className={cn(
          "mx-auto max-w-9xl rounded-lg border border-neutral-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
          "print:max-w-none print:border-0 print:shadow-none print:p-6"
        )}
      >
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {typeConfig?.title ?? "Tax Invoice (Cost Incurred)"}
            </h1>
            <p className="mt-1 text-lg font-bold tracking-wide text-neutral-900 dark:text-white">
              TAX INVOICE
            </p>
          </div>
          <div className="text-right text-sm text-neutral-500 dark:text-slate-400">
            <p className="text-base font-bold text-neutral-900 dark:text-white">
              Invoice #: {data.invNum}
            </p>
            <p className="mt-1">
              Date Issued:{" "}
              <input
                type="date"
                value={data.invDate}
                onChange={(e) => update({ invDate: e.target.value })}
                className="ml-1 inline-block border-b border-dashed border-neutral-400 bg-transparent print:border-none"
              />
            </p>
            <p>
              Due Date:{" "}
              <input
                type="date"
                value={data.dueDate}
                onChange={(e) => update({ dueDate: e.target.value })}
                className="ml-1 inline-block border-b border-dashed border-neutral-400 bg-transparent print:border-none"
              />
            </p>
          </div>
        </div>

        {/* Legal banner */}
        <div className="mb-7 border-l-4 border-teal-500 bg-teal-50/80 py-3 px-4 rounded-r-lg dark:bg-teal-900/20">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            ⚖️ Invoice Settlement Basis — &quot;Reasonable Costs You Actually Incur&quot;
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-700 dark:text-slate-300">
            This Tax Invoice documents the <strong>reasonable costs actually incurred</strong> by the
            Client (the Insured / Policyholder) for professional property restoration services
            performed at the insured property. This invoice is issued to the Client in their
            capacity as the Insured under their Home Building Insurance Policy. Upon payment by the
            Client, this invoice constitutes evidence of{" "}
            <strong>out-of-pocket expenses actually incurred</strong> by the Insured, recoverable
            under the &quot;costs you actually incur&quot; settlement provision of their insurance
            policy, subject to policy terms, conditions, and the applicable sum insured.
          </p>
        </div>

        {/* Parties */}
        <div className="mb-7 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-slate-600">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Contractor (Service Provider)
            </h4>
            {[
              { label: "Business", key: "business" as const },
              { label: "ABN", key: "abn" as const },
              { label: "QBCC Lic #", key: "qbccLic" as const },
              { label: "Address", key: "address" as const },
              { label: "Phone", key: "phone" as const },
              { label: "Email", key: "email" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex gap-2 text-sm">
                <span className="min-w-[80px] shrink-0 text-neutral-500 dark:text-slate-400">
                  {label}:
                </span>
                <input
                  type="text"
                  value={data.contractor[key]}
                  onChange={(e) => updateContractor(key, e.target.value)}
                  className="flex-1 border-b border-dashed border-neutral-300 bg-transparent py-0.5 focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-slate-600">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Client (The Insured / Policyholder)
            </h4>
            {[
              { label: "Name", key: "name" as const },
              { label: "Address", key: "address" as const },
              { label: "Phone", key: "phone" as const },
              { label: "Email", key: "email" as const },
              { label: "Insurer", key: "insurer" as const },
              { label: "Policy #", key: "policyNum" as const },
              { label: "Claim #", key: "claimNum" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex gap-2 text-sm">
                <span className="min-w-[80px] shrink-0 text-neutral-500 dark:text-slate-400">
                  {label}:
                </span>
                <input
                  type="text"
                  value={data.client[key]}
                  onChange={(e) => updateClient(key, e.target.value)}
                  className="flex-1 border-b border-dashed border-neutral-300 bg-transparent py-0.5 focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Insured Event Details */}
        <h3 className="border-b-2 border-teal-500 pb-1.5 text-sm font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Insured Event Details
        </h3>
        <div className="mb-6 mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">Date of Loss</label>
            <input
              type="date"
              value={data.event.lossDate}
              onChange={(e) => updateEvent("lossDate", e.target.value)}
              className="mt-0.5 w-full border-b border-dashed border-neutral-300 bg-transparent py-1 text-sm focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">Cause of Loss</label>
            <input
              type="text"
              value={data.event.lossCause}
              onChange={(e) => updateEvent("lossCause", e.target.value)}
              className="mt-0.5 w-full border-b border-dashed border-neutral-300 bg-transparent py-1 text-sm focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">PDS Event Ref</label>
            <input
              type="text"
              value={data.event.pdsEvent}
              onChange={(e) => updateEvent("pdsEvent", e.target.value)}
              className="mt-0.5 w-full border-b border-dashed border-neutral-300 bg-transparent py-1 text-sm focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">Water Category</label>
            <select
              value={data.event.waterCat}
              onChange={(e) => updateEvent("waterCat", e.target.value)}
              className="mt-0.5 w-full rounded border border-neutral-300 bg-white py-1 text-sm dark:border-slate-500 dark:bg-slate-800"
            >
              <option>Category 1 — Clean Water</option>
              <option>Category 2 — Grey Water</option>
              <option>Category 3 — Black Water</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">Class of Damage</label>
            <select
              value={data.event.damageClass}
              onChange={(e) => updateEvent("damageClass", e.target.value)}
              className="mt-0.5 w-full rounded border border-neutral-300 bg-white py-1 text-sm dark:border-slate-500 dark:bg-slate-800"
            >
              <option>Class 1 — Least amount of absorption</option>
              <option>Class 2 — Significant absorption</option>
              <option>Class 3 — Greatest absorption</option>
              <option>Class 4 — Specialty drying</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-slate-400">Affected Area</label>
            <input
              type="text"
              value={data.event.affectedArea}
              onChange={(e) => updateEvent("affectedArea", e.target.value)}
              className="mt-0.5 w-full border-b border-dashed border-neutral-300 bg-transparent py-1 text-sm focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
            />
          </div>
        </div>

        {/* Scope of Works — Line Items */}
        <h3 className="border-b-2 border-teal-500 pb-1.5 text-sm font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Scope of Works — Itemised Costs
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100 dark:bg-slate-700/50">
                <th className="border border-neutral-200 px-2 py-2 text-left text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  #
                </th>
                <th className="border border-neutral-200 px-2 py-2 text-left text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  Description of Service / Works
                </th>
                <th className="border border-neutral-200 px-2 py-2 text-right text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  Qty
                </th>
                <th className="border border-neutral-200 px-2 py-2 text-right text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  Unit
                </th>
                <th className="border border-neutral-200 px-2 py-2 text-right text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  Rate (ex GST)
                </th>
                <th className="border border-neutral-200 px-2 py-2 text-right text-xs font-bold uppercase text-neutral-600 dark:border-slate-600 dark:text-slate-300">
                  Amount (ex GST)
                </th>
                <th className="w-8 border border-neutral-200 px-1 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {data.lineItems.map((item, idx) => {
                const qty = parseFloat(item.qty) || 0
                const rate = parseFloat(item.rate) || 0
                const amt = round2(qty * rate)
                return (
                  <tr key={idx} className="dark:border-slate-600">
                    <td className="border border-neutral-200 px-2 py-1.5 text-center text-neutral-500 dark:border-slate-600">
                      {idx + 1}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1.5 dark:border-slate-600">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          setLineItem(idx, { ...item, description: e.target.value })
                        }
                        className="w-full border-0 border-b border-dashed bg-transparent focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                      />
                    </td>
                    <td className="border border-neutral-200 px-2 py-1.5 text-right dark:border-slate-600">
                      <input
                        type="text"
                        value={item.qty}
                        onChange={(e) => setLineItem(idx, { ...item, qty: e.target.value })}
                        className="w-14 border-0 border-b border-dashed bg-transparent text-right focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                      />
                    </td>
                    <td className="border border-neutral-200 px-2 py-1.5 dark:border-slate-600">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => setLineItem(idx, { ...item, unit: e.target.value })}
                        className="w-full border-0 border-b border-dashed bg-transparent text-center focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                      />
                    </td>
                    <td className="border border-neutral-200 px-2 py-1.5 text-right dark:border-slate-600">
                      <input
                        type="text"
                        value={item.rate}
                        onChange={(e) => setLineItem(idx, { ...item, rate: e.target.value })}
                        className="w-20 border-0 border-b border-dashed bg-transparent text-right focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                      />
                    </td>
                    <td className="border border-neutral-200 px-2 py-1.5 text-right font-medium dark:border-slate-600">
                      ${amt.toFixed(2)}
                    </td>
                    <td className="border border-neutral-200 px-1 print:hidden dark:border-slate-600">
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addLineItem}
          className="mt-2 border border-dashed border-teal-500 bg-transparent px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 print:hidden"
        >
          + Add Line Item
        </button>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-80 text-sm">
            <div className="flex justify-between border-b border-neutral-200 py-1.5 dark:border-slate-600">
              <span>Subtotal (ex GST):</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-200 py-1.5 text-neutral-500 dark:border-slate-600 dark:text-slate-400">
              <span>GST (10%):</span>
              <span>${gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b-2 border-double border-neutral-900 py-2.5 text-base font-bold dark:border-slate-100">
              <span>TOTAL AMOUNT (inc GST):</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-200 py-1.5 text-xs text-neutral-500 dark:border-slate-600">
              <span>Less Policy Excess (if applicable):</span>
              <input
                type="text"
                value={data.excessAmt}
                onChange={(e) => update({ excessAmt: e.target.value })}
                className="w-16 border-0 border-b border-dashed bg-transparent text-right print:border-none dark:border-slate-500"
              />
            </div>
            <div className="flex justify-between border-b-2 border-teal-500 py-2 font-semibold">
              <span>Net Reimbursable by Insurer:</span>
              <span>${netReimburse.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Policy wording - fixed legal text */}
        <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-xs leading-relaxed text-neutral-700 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-900 dark:text-white">
            📋 Insurance Policy Wording Reference — Basis of Claim
          </h4>
          <p className="mb-2">
            This invoice is issued in accordance with the settlement provisions of standard
            Australian Home Building Insurance policies, which provide (in relevant part):
          </p>
          <p className="mb-2 italic">
            &quot;If we agree to pay a claim for loss or damage to the home, we may choose to: …{" "}
            <strong>pay the reasonable costs you actually incur</strong> in repairing the home if
            it is damaged.&quot;
          </p>
          <p className="mb-2">
            The Insured (Client) has exercised their right to engage their own contractor for the
            repair and restoration of their insured property following a covered insured event. This
            right is consistent with: Insurance Contracts Act 1984 (Cth) §§13, 54, 57; ACCC
            Northern Australia Insurance Inquiry Recommendation 20.2; General Insurance Code of
            Practice (2020); AFCA Approach; AS-IICRC S500:2025 (and applicable IICRC Standards).
          </p>
          <p>
            Upon payment by the Client, this invoice constitutes documentary evidence of{" "}
            <strong>costs actually incurred</strong> by the Insured for submission to their
            insurance carrier as an out-of-pocket expense claim, recoverable under the terms and
            conditions of their policy.
          </p>
        </div>

        {/* Technical Certification */}
        <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-slate-600">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            🔬 Technical Certification &amp; Compliance
          </h4>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {[
              { label: "Standard Applied", key: "standardApplied" as const },
              { label: "Technician Cert #", key: "technicianCert" as const },
              { label: "Pre-Loss Moisture", key: "preLossMoisture" as const },
              { label: "Post-Dry Moisture", key: "postDryMoisture" as const },
              { label: "Drying Days", key: "dryingDays" as const },
              { label: "Equipment Used", key: "equipmentUsed" as const },
              { label: "Public Liability", key: "publicLiability" as const },
              { label: "Insurer of Contractor", key: "contractorInsurer" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex gap-2 text-sm">
                <span className="min-w-[110px] shrink-0 text-neutral-500 dark:text-slate-400">
                  {label}:
                </span>
                <input
                  type="text"
                  value={data.cert[key]}
                  onChange={(e) => updateCert(key, e.target.value)}
                  className="flex-1 border-b border-dashed border-neutral-300 bg-transparent py-0.5 focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neutral-500 dark:text-slate-400">
            Supporting documentation attached: Moisture mapping reports, daily psychrometric /
            drying logs, photographic evidence (before, during, after), equipment deployment
            records, and Certificate of Completion / Drying Certificate.
          </p>
        </div>

        {/* Payment Terms */}
        <div className="mt-6 rounded-lg border-2 border-teal-500 p-4">
          <h4 className="mb-2 text-sm font-bold text-teal-600 dark:text-teal-400">
            💳 Payment Terms
          </h4>
          <p className="text-xs leading-relaxed">
            <strong>Payment Due:</strong> Within 7 days of invoice date. Payment by the Client
            constitutes the <strong>&quot;costs actually incurred&quot;</strong> by the Insured as
            contemplated by their Home Building Insurance Policy.
          </p>
          <div className="mt-3 space-y-1 text-sm">
            {[
              { label: "Bank Name", key: "bankName" as const },
              { label: "BSB", key: "bsb" as const },
              { label: "Account #", key: "accountNum" as const },
              { label: "Account Name", key: "accountName" as const },
              { label: "Reference", key: "reference" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex gap-2">
                <span className="min-w-[100px] text-neutral-500 dark:text-slate-400">{label}:</span>
                <input
                  type="text"
                  value={data.payment[key]}
                  onChange={(e) => updatePayment(key, e.target.value)}
                  className="flex-1 border-b border-dashed border-neutral-300 bg-transparent py-0.5 focus:border-teal-500 focus:outline-none print:border-none dark:border-slate-500"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-600 dark:text-slate-400">
            <strong>Important:</strong> Upon receipt of payment, the Contractor will issue a
            Payment Receipt confirming the costs incurred. The Client should retain this receipt
            together with this Tax Invoice as supporting documentation when submitting their
            out-of-pocket expense reimbursement claim to their insurance carrier.
          </p>
        </div>

        {/* Client Acknowledgement - fixed legal text */}
        <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-slate-600">
          <h4 className="mb-3 text-sm font-bold text-neutral-900 dark:text-white">
            ✍️ Client Acknowledgement &amp; Authorisation
          </h4>
          <p className="mb-2 text-xs leading-relaxed text-neutral-600 dark:text-slate-300">
            I, the undersigned Client (the Insured / Policyholder), acknowledge and confirm that:
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-neutral-600 dark:text-slate-300">
            <li>
              I have engaged the above-named Contractor to perform property restoration services at
              my insured property following the insured event described above.
            </li>
            <li>
              The Scope of Works and costs detailed in this Tax Invoice are a true and accurate
              record of the services performed and the reasonable costs for those services.
            </li>
            <li>
              I understand that by paying this Tax Invoice, I am incurring an{" "}
              <strong>out-of-pocket expense</strong> that I may be entitled to recover from my
              insurer under the <strong>&quot;reasonable costs you actually incur&quot;</strong>{" "}
              provision of my Home Building Insurance Policy, subject to my policy terms, conditions,
              sum insured, and any applicable excess.
            </li>
            <li>
              I understand that the Contractor is not a party to my insurance contract and makes no
              representation regarding the extent of my insurance coverage or the amount my insurer
              will reimburse.
            </li>
            <li>
              I am satisfied that the works have been completed to a professional standard in
              accordance with the applicable IICRC/Australian Standard.
            </li>
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="border-b border-neutral-800 dark:border-slate-400" />
              <div className="mt-1 text-[10px] text-neutral-500 dark:text-slate-400">
                Client Signature
              </div>
            </div>
            <div>
              <div className="border-b border-neutral-800 dark:border-slate-400" />
              <div className="mt-1 text-[10px] text-neutral-500 dark:text-slate-400">Date</div>
            </div>
            <div>
              <div className="border-b border-neutral-800 dark:border-slate-400" />
              <div className="mt-1 text-[10px] text-neutral-500 dark:text-slate-400">Print Name</div>
            </div>
            <div>
              <div className="border-b border-neutral-800 dark:border-slate-400" />
              <div className="mt-1 text-[10px] text-neutral-500 dark:text-slate-400">
                Contractor Representative Signature
              </div>
            </div>
          </div>
        </div>

        {/* Footer legal */}
        <div className="mt-6 border-t border-neutral-200 pt-4 text-[10px] leading-relaxed text-neutral-500 dark:border-slate-600 dark:text-slate-400">
          <p className="mb-1">
            <strong>Disclaimer:</strong> This Tax Invoice is a commercial document between the
            Contractor and the Client. The Contractor makes no warranty or representation regarding
            the Client&apos;s insurance coverage, the outcome of any insurance claim, or the amount
            recoverable from the Client&apos;s insurer. The Client is responsible for lodging their
            claim with their insurer and providing this invoice and supporting documentation as
            evidence of costs actually incurred. This document does not constitute legal or financial
            advice.
          </p>
          <p className="mb-1">
            This Tax Invoice complies with the requirements of the{" "}
            <em>A New Tax System (Goods and Services Tax) Act 1999</em> (Cth) and the Australian
            Taxation Office requirements for valid tax invoices. ABN verified at abn.business.gov.au.
          </p>
          <p>
            <strong>Applicable Legislation &amp; Standards:</strong> Insurance Contracts Act 1984
            (Cth) §§13, 54, 57 · Competition and Consumer Act 2010 (Cth) Sch 2 §§100–101 · General
            Insurance Code of Practice (2020) · AS-IICRC S500:2025 · QBCC Act 1991 (Qld)
          </p>
        </div>
      </div>
    </div>
  )
}
