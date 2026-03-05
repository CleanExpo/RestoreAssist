"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, Plus, Loader2, Receipt } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocSummary {
  id: string
  documentType: string
  documentNumber: string
  title: string | null
  reportId: string | null
  createdAt: string
  updatedAt: string
}

export default function RestorationDocumentsPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchDocs() {
      try {
        const res = await fetch("/api/restoration-documents", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setDocuments(data.documents ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDocs()
    return () => {
      cancelled = true
    }
  }, [])

  const typeLabel = (type: string) => {
    if (type === "RESTORATION_INVOICE") return "Tax Invoice"
    return type.replace(/_/g, " ")
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950">
      <div className="mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Restoration Documents
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">
              Australian-law tax invoices and restoration documentation. Auto-filled from your
              profile and linked reports.
            </p>
          </div>
          <Link
            href="/dashboard/restoration-documents/invoice/new"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700",
              "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            )}
          >
            <Plus className="h-4 w-4" />
            New Restoration Invoice
          </Link>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="mx-auto h-12 w-12 text-neutral-300 dark:text-slate-600" />
              <p className="mt-4 text-neutral-600 dark:text-slate-400">
                No restoration documents yet
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-slate-500">
                Create a Tax Invoice (Water, Fire, Mould, BioClean, etc.) to get started.
              </p>
              <Link
                href="/dashboard/restoration-documents/invoice/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                New Restoration Invoice
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-700">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() =>
                      doc.documentType === "RESTORATION_INVOICE"
                        ? router.push(`/dashboard/restoration-documents/invoice/${doc.id}`)
                        : null
                    }
                    className={cn(
                      "flex w-full items-center gap-4 px-4 py-4 text-left transition-colors",
                      doc.documentType === "RESTORATION_INVOICE"
                        ? "hover:bg-neutral-50 dark:hover:bg-slate-800/50"
                        : ""
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                      <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {doc.title || doc.documentNumber}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-slate-400">
                        {typeLabel(doc.documentType)} · {doc.documentNumber}
                      </p>
                    </div>
                    <div className="text-right text-xs text-neutral-500 dark:text-slate-400">
                      <p>
                        {new Date(doc.createdAt).toLocaleDateString("en-AU", {
                          dateStyle: "medium",
                        })}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
