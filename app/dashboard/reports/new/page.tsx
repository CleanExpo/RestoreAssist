"use client"

import { useRouter } from "next/navigation"
import ReportWorkflow from "@/components/ReportWorkflow"

export default function NewReportPage() {
  const router = useRouter()

  const handleComplete = () => {
    // Report workflow is complete, redirect to reports list
    router.push("/dashboard/reports")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-8xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
          <p className="text-slate-400">Complete the workflow to generate professional inspection reports, scope of works, and cost estimations</p>
        </div>

        <ReportWorkflow onComplete={handleComplete} />
      </div>
    </div>
  )
}
