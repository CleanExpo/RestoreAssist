"use client"

import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { InspectionReportData } from "@/lib/pdf-export"

interface ExportPdfButtonProps {
  inspectionId: string
}

export default function ExportPdfButton({ inspectionId }: ExportPdfButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/export-data`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load report data' }))
        throw new Error((err as { error?: string }).error ?? 'Failed to load report data')
      }
      const data: InspectionReportData = await res.json()

      // Dynamic import keeps jsPDF/html2canvas out of the SSR bundle
      const { exportInspectionPdf } = await import('@/lib/pdf-export')
      await exportInspectionPdf(data)
    } catch (err) {
      console.error('[ExportPdfButton] Export failed:', err)
      // Surface error to user in a non-blocking way — rely on console/toast elsewhere
      alert(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <FileDown size={16} />
      )}
      {loading ? 'Generating PDF…' : 'Export PDF'}
    </Button>
  )
}
