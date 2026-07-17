"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileText,
  FileJson,
  FileArchive,
  FileType,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import AiOwnershipBadge from "@/components/AiOwnershipBadge";
import {
  AI_OWNERSHIP_EXPORT_READY,
  AI_OWNERSHIP_EXPORT_WATERMARKED,
  getAiOwnershipStatusMeta,
  type AiOwnershipFields,
} from "@/lib/reports/ai-ownership";

interface DocumentExportPackageProps {
  reportId: string;
  reportNumber?: string;
  claimReference?: string;
  /** When omitted, ownership is loaded from GET /api/reports/:id */
  ownership?: AiOwnershipFields | null;
}

type ExportFormat = "pdf" | "json" | "zip" | "word";

export default function DocumentExportPackage({
  reportId,
  ownership: ownershipProp,
}: DocumentExportPackageProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<AiOwnershipFields | null>(
    ownershipProp ?? null,
  );
  const [ownershipLoadError, setOwnershipLoadError] = useState<string | null>(
    null,
  );
  const [ownershipLoading, setOwnershipLoading] = useState(
    ownershipProp === undefined,
  );

  useEffect(() => {
    if (ownershipProp !== undefined) {
      setOwnership(ownershipProp);
      setOwnershipLoading(false);
      setOwnershipLoadError(null);
      return;
    }

    let cancelled = false;
    setOwnershipLoading(true);
    setOwnershipLoadError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/reports/${reportId}`);
        if (!res.ok) {
          if (!cancelled) {
            setOwnershipLoadError(
              "Could not load ownership status for this report.",
            );
            setOwnership(null);
          }
          return;
        }
        const data = (await res.json()) as AiOwnershipFields;
        if (!cancelled) {
          setOwnership({
            detailedReport: data.detailedReport,
            aiDraftGeneratedAt: data.aiDraftGeneratedAt,
            aiDraftHumanEditedAt: data.aiDraftHumanEditedAt,
            reportOwnershipAcknowledgedAt: data.reportOwnershipAcknowledgedAt,
          });
        }
      } catch {
        if (!cancelled) {
          setOwnershipLoadError(
            "Could not load ownership status for this report.",
          );
          setOwnership(null);
        }
      } finally {
        if (!cancelled) setOwnershipLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId, ownershipProp]);

  const meta = ownership ? getAiOwnershipStatusMeta(ownership) : null;
  const watermarked = meta
    ? !meta.exportReady && meta.status !== "no_content"
    : true;

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
        watermarked
          ? `Exported as ${format.toUpperCase()} with AI-draft watermark — confirm ownership to issue cleanly`
          : `Documents exported successfully as ${format.toUpperCase()}`,
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

  const packageItemLabel = (base: string) =>
    watermarked ? `${base} (AI-draft watermark)` : `${base} (holder-owned)`;

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

      <div
        className={
          "rounded-[10px] border p-4 space-y-2 " +
          (meta?.exportReady
            ? "border-success/40 bg-success/10"
            : "border-warning/40 bg-warning/10")
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {meta?.exportReady ? (
            <CheckCircle className="h-5 w-5 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
          )}
          <h3 className="font-semibold text-slate-100">Ownership status</h3>
          {ownership && <AiOwnershipBadge report={ownership} variant="full" />}
        </div>
        {ownershipLoading && (
          <p className="text-sm text-slate-400">Checking ownership…</p>
        )}
        {ownershipLoadError && (
          <p className="text-sm text-destructive" role="alert">
            {ownershipLoadError}
          </p>
        )}
        {!ownershipLoading && !ownershipLoadError && meta && (
          <p className="text-sm text-slate-300">
            {meta.exportReady
              ? AI_OWNERSHIP_EXPORT_READY
              : AI_OWNERSHIP_EXPORT_WATERMARKED}
          </p>
        )}
        {meta?.nextAction && (
          <p className="text-sm text-amber-100/90">{meta.nextAction}</p>
        )}
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
              className="w-full min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
              className="w-full min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
              className="w-full min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                <p className="text-xs text-slate-400">Machine-readable export</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Structured data for integrations, archives, and audit trails.
            </p>
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting !== null}
              className="w-full min-h-[44px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
          an ownership watermark until you rewrite and acknowledge ownership —
          the AI is only an assistant; the issued report must be your words.
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
            <span>{packageItemLabel("Professional Inspection Report")}</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>{packageItemLabel("Scope of Works")}</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>{packageItemLabel("Cost Estimation")}</span>
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
