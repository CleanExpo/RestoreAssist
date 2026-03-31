"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { ArrowLeft, ExternalLink, FileText, Loader2, Receipt } from "lucide-react"
import { cn } from "@/lib/utils"

interface LineItem {
  id: string
  description: string
  category: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  gstRate: number
  gstAmount: number
  total: number
  sortOrder: number
}

interface InvoiceSummary {
  id: string
  invoiceNumber: string
  status: string
  customerName: string
  customerEmail: string
  subtotalExGST: number
  gstAmount: number
  totalIncGST: number
  amountDue: number
  dueDate: string
  lineItems: LineItem[]
}

function centsToAud(cents: number): string {
  return (cents / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD"
  })
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300",
    SENT: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    PAID: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    OVERDUE: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    CANCELLED: "bg-neutral-100 dark:bg-slate-800 text-neutral-400"
  }
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", colors[status] ?? colors.DRAFT)}>
      {status}
    </span>
  )
}

export default function InspectionInvoicePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [id])

  const fetchInvoice = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/inspections/${id}/generate-invoice`)
      if (res.ok) {
        const data = await res.json()
        setInvoice(data.invoice ?? null)
      } else {
        toast.error("Failed to load invoice data")
      }
    } catch {
      toast.error("Failed to load invoice data")
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      const res = await fetch(`/api/inspections/${id}/generate-invoice`, {
        method: "POST"
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate invoice")
        return
      }
      toast.success(`Invoice ${data.invoiceNumber} created`)
      await fetchInvoice()
    } catch {
      toast.error("Failed to generate invoice")
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/dashboard/inspections/${id}`)}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Receipt size={22} className="text-cyan-500" />
            Invoice from Scope Items
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
            Generate a draft invoice from this inspection&apos;s selected scope items
          </p>
        </div>

        {!invoice && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {generating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {generating ? "Generating…" : "Generate Invoice"}
          </button>
        )}

        {invoice && (
          <Link
            href={`/dashboard/invoices/${invoice.id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 text-sm font-semibold transition-colors"
          >
            <ExternalLink size={16} />
            View Full Invoice
          </Link>
        )}
      </div>

      {!invoice ? (
        <div className="p-12 rounded-xl border border-dashed border-neutral-300 dark:border-slate-700 text-center space-y-3">
          <Receipt size={40} className="mx-auto text-neutral-300 dark:text-slate-600" />
          <p className="text-neutral-500 dark:text-slate-400 font-medium">No invoice generated yet</p>
          <p className="text-sm text-neutral-400 dark:text-slate-500">
            Click &quot;Generate Invoice&quot; to create a draft invoice from this inspection&apos;s selected scope items.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 mt-2"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {generating ? "Generating…" : "Generate Invoice"}
          </button>
        </div>
      ) : (
        <>
          {/* Invoice Summary Card */}
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                    {invoice.invoiceNumber}
                  </h2>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="text-sm text-neutral-500 dark:text-slate-400">
                  {invoice.customerName} &bull; {invoice.customerEmail}
                </p>
                <p className="text-sm text-neutral-400 dark:text-slate-500 mt-0.5">
                  Due: {new Date(invoice.dueDate).toLocaleDateString("en-AU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">Total inc. GST</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {centsToAud(invoice.totalIncGST)}
                </p>
              </div>
            </div>

            {/* Totals row */}
            <div className="flex gap-6 pt-3 border-t border-neutral-100 dark:border-slate-800 text-sm">
              <div>
                <span className="text-neutral-400 text-xs uppercase tracking-wider block">Subtotal ex. GST</span>
                <span className="font-semibold">{centsToAud(invoice.subtotalExGST)}</span>
              </div>
              <div>
                <span className="text-neutral-400 text-xs uppercase tracking-wider block">GST (10%)</span>
                <span className="font-semibold">{centsToAud(invoice.gstAmount)}</span>
              </div>
              <div>
                <span className="text-neutral-400 text-xs uppercase tracking-wider block">Amount Due</span>
                <span className="font-semibold text-cyan-600 dark:text-cyan-400">{centsToAud(invoice.amountDue)}</span>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-50 dark:bg-slate-800/50 border-b border-neutral-200 dark:border-slate-700/50">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-slate-300">
                Line Items ({invoice.lineItems.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50/50 dark:bg-slate-800/30">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      GST
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white max-w-[300px]">
                        <span className="block truncate">{item.description}</span>
                        {item.category && (
                          <span className="text-xs text-neutral-400 dark:text-slate-500">{item.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-slate-300">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-slate-300">
                        {centsToAud(item.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500 dark:text-slate-400">
                        {centsToAud(item.gstAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-900 dark:text-white">
                        {centsToAud(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-neutral-50 dark:bg-slate-800/50 border-t border-neutral-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-neutral-600 dark:text-slate-300">
                      Total inc. GST
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {centsToAud(invoice.totalIncGST)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-xs text-neutral-400 dark:text-slate-500 text-center pb-4">
            Unit prices default to $50.00 — edit line items in the full invoice view to set actual rates.
          </p>
        </>
      )}
    </div>
  )
}
