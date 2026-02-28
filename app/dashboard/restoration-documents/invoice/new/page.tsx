"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import RestorationInvoiceForm from "@/components/restoration/RestorationInvoiceForm"
import { Loader2 } from "lucide-react"

export default function NewRestorationInvoicePage() {
  const searchParams = useSearchParams()
  const reportId = searchParams.get("reportId")
  const [seed, setSeed] = useState<{
    profile?: {
      companyName?: string
      businessAddress?: string
      abn?: string
      phone?: string
      email?: string
    }
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
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const url = reportId
      ? `/api/restoration-documents/seed?reportId=${encodeURIComponent(reportId)}`
      : "/api/restoration-documents/seed"
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSeed(data)
      })
      .catch(() => {
        if (!cancelled) setSeed({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-6 dark:bg-slate-950">
      <RestorationInvoiceForm
        reportId={reportId ?? undefined}
        initialSeed={seed ?? undefined}
        suggestedInvoiceNumber={seed?.suggestedInvoiceNumber}
        defaultInvDate={seed?.defaultInvDate}
        defaultDueDate={seed?.defaultDueDate}
      />
    </div>
  )
}
