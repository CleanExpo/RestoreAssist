"use client"

import { useRouter } from "next/navigation"
import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm"
import { ArrowLeft } from "lucide-react"

export default function NewInspectionPage() {
  const router = useRouter()

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

      <NIRTechnicianInputForm
        onComplete={(inspectionId: string) => {
          router.push(`/dashboard/inspections/${inspectionId}`)
        }}
      />
    </div>
  )
}
