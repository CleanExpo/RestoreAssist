"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  FileJson,
  FileArchive,
  FileType,
  Loader2,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";

interface DocumentExportPackageProps {
  reportId: string;
  reportNumber?: string;
  claimReference?: string;
}

type ExportFormat = "pdf" | "json" | "zip" | "word";

export default function DocumentExportPackage({
  reportId,
}: DocumentExportPackageProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const response = await fetch(
        `/api/reports/${reportId}/export-package?format=${format}`,
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(
          typeof error.error === "string"
            ? error.error
            : "Failed to export documents",
        );
        return;
      }

      if (format === "json") {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        downloadBlob(blob, `RestoreAssist-Export-${reportId}.json`);
      } else {
        const blob = await response.blob();
        const extension =
          format === "zip" ? "zip" : format === "word" ? "docx" : "pdf";
        downloadBlob(blob, `RestoreAssist-Package-${reportId}.${extension}`);
      }

      toast.success(
        `Documents exported successfully as ${format.toUpperCase()}`,
      );
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Failed to export documents");
    } finally {
      setExporting(null);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
          <Download className="w-6 h-6" />
          Document Export Package
        </h2>
        <p className="text-slate-400">
          Export claim-ready documents for delivery to clients or insurers.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Available exports</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <FileText className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h4 className="font-semibold">PDF Format</h4>
                <p className="text-xs text-slate-400">
                  Ready for insurer submission
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Formatted and ready for insurer submission. Cannot be edited.
              Professional appearance.
            </p>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === "pdf" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export PDF
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <FileType className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold">Word (.docx)</h4>
                <p className="text-xs text-slate-400">
                  Editable for insurer review
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Microsoft Word package with inspection report, scope of works, and
              cost estimation as editable sections.
            </p>
            <button
              type="button"
              onClick={() => handleExport("word")}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === "word" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileType className="w-4 h-4" />
                  Export Word
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <FileArchive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="font-semibold">ZIP Package</h4>
                <p className="text-xs text-slate-400">
                  Combined PDF package plus JSON export
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              ZIP archive with the claim PDF package and machine-readable JSON
              for your file system or CRM.
            </p>
            <button
              type="button"
              onClick={() => handleExport("zip")}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === "zip" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileArchive className="w-4 h-4" />
                  Export ZIP
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <FileJson className="w-5 h-5 text-success" />
              </div>
              <div>
                <h4 className="font-semibold">JSON Format</h4>
                <p className="text-xs text-slate-400">For CRM integration</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Machine-readable data for CRM integration or future API
              workflow.
            </p>
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === "json" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileJson className="w-4 h-4" />
                  Export JSON
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Email delivery from this screen is not available. Download PDF, Word,
          or ZIP, then share via your usual email client. AI-assisted drafts keep
          an ownership watermark until you rewrite and acknowledge the report in
          RestoreAssist.
        </p>
      </div>

      <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle className="w-5 h-5 text-success" />
          <h4 className="font-semibold text-success">Direct Download</h4>
        </div>
        <p className="text-sm text-slate-300">
          Downloads start immediately in your browser. No third-party delivery
          step.
        </p>
      </div>

      <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h4 className="font-semibold mb-3">Package Contents</h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Professional Inspection Report (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Scope of Works (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Cost Estimation (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Version history & change log</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Raw data export (all Q&A responses)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
