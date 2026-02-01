"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, useEffect } from "react"
import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm"
import { ArrowLeft, Loader2 } from "lucide-react"

export default function NewInspectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")
  const interviewDataParam = searchParams.get("interviewData")

  const [initialDataFromApi, setInitialDataFromApi] = useState<Record<string, unknown> | null | undefined>(undefined)
  const [loadingPrefill, setLoadingPrefill] = useState(!!sessionId)

  const initialDataFromUrl = useMemo(() => {
    if (!interviewDataParam) return undefined
    try {
      return JSON.parse(decodeURIComponent(interviewDataParam)) as Record<string, unknown>
    } catch {
      return undefined
    }
  }, [interviewDataParam])

  useEffect(() => {
    if (!sessionId) {
      setLoadingPrefill(false)
      return
    }
    let cancelled = false
    setLoadingPrefill(true)
    fetch(`/api/interviews/${sessionId}/inspection-prefill`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load prefill")
        return res.json()
      })
      .then((data) => {
        if (!cancelled && data?.prefill) setInitialDataFromApi(data.prefill)
        else if (!cancelled) setInitialDataFromApi({})
      })
      .catch(() => {
        if (!cancelled) setInitialDataFromApi(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingPrefill(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const initialData =
    initialDataFromApi !== undefined
      ? initialDataFromApi ?? undefined
      : initialDataFromUrl

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/inspections")}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            New Inspection
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            Capture field data for a National Inspection Report (NIR)
          </p>
        </div>
      </div>

      {loadingPrefill ? (
        <div className="flex items-center justify-center py-20 gap-3 rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
          <Loader2 className="animate-spin text-cyan-500" size={28} />
          <span className="text-neutral-600 dark:text-slate-400">Loading interview data...</span>
        </div>
      ) : (
        <NIRTechnicianInputForm
          initialData={initialData ?? undefined}
          onComplete={(inspectionId: string) => {
            router.push(`/dashboard/inspections/${inspectionId}`)
          }}
        />
      )}
    </div>
  )
}
