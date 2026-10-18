"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { failedResponseMessage } from "@/lib/inspections/job-actions";
import type { InspectionReportData } from "@/lib/pdf-export";

interface ExportPdfButtonProps {
  inspectionId: string;
}

export default function ExportPdfButton({
  inspectionId,
}: ExportPdfButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/export-data`);
      if (!res.ok) {
        const message = await failedResponseMessage(
          res,
          "Failed to load report data",
        );
        console.error("[ExportPdfButton] Export refused:", res.status, message);
        toast.error(message);
        return;
      }
      const data: InspectionReportData = await res.json();

      // Dynamic import keeps jsPDF/html2canvas out of the SSR bundle
      const { exportInspectionPdf } = await import("@/lib/pdf-export");
      await exportInspectionPdf(data);
    } catch (err) {
      // Detailed context is in the console; the toast stays plain.
      console.error("[ExportPdfButton] Export failed:", err);
      toast.error("Could not export the PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
      {loading ? "Generating PDF…" : "Export PDF"}
    </Button>
  );
}
