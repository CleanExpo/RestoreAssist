"use client";

import { useState, useMemo } from "react";
import { useFetch } from "@/lib/hooks/useFetch";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  CheckSquare,
  Square,
  X,
  GitBranch,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  EvaluatorScoreBadge,
  PhaseProgressBar,
} from "@/components/SessionMetadataCard";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { formatDate } from "@/lib/formatters";
import type { ReportWithSessionData } from "@/lib/session-types";

const REPORT_STATUS_TONES: Record<string, StatusTone> = {
  COMPLETED: "success",
  APPROVED: "success",
  PENDING: "warning",
  "In Progress": "info",
  DRAFT: "neutral",
  ARCHIVED: "neutral",
};

export default function ReportsPage() {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const {
    data: reportsData,
    loading,
    refetch: refetchReports,
  } = useFetch<{ reports: ReportWithSessionData[] }>("/api/reports");
  const reports = reportsData?.reports ?? [];
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  // RA-1192: per-row synopsis generation. Keyed by report id so multiple rows
  // can be generated in parallel without stepping on each other's state.
  const [synopsising, setSynopsising] = useState<string | null>(null);
  const [localSynopsis, setLocalSynopsis] = useState<Record<string, string>>(
    {},
  );
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    hazard: "all",
    insurance: "all",
    dateFrom: "",
    dateTo: "",
  });

  const itemsPerPage = 10;

  // Duplicate report function
  const duplicateReport = async (reportId: string) => {
    try {
      setDuplicating(reportId);
      const response = await fetch(`/api/reports/${reportId}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const newReport = await response.json();
        toast.success("Report duplicated successfully!", {
          duration: 4000,
          style: {
            background: "#1e293b",
            color: "#10b981",
            border: "1px solid #059669",
          },
        });
        refetchReports();
      } else {
        const errorData = await response.json();

        // Handle credit-related errors
        if (response.status === 402 && errorData.upgradeRequired) {
          toast.error(
            `Insufficient credits! You have ${errorData.creditsRemaining} credits remaining. Please upgrade your plan to create more reports.`,
            {
              duration: 6000,
              style: {
                background: "#1e293b",
                color: "#f87171",
                border: "1px solid #dc2626",
              },
            },
          );
          // Redirect to pricing page
          setTimeout(() => {
            router.push("/dashboard/pricing");
          }, 2000);
          return;
        }

        // Handle other errors
        toast.error(
          errorData.error || "Failed to duplicate report. Please try again.",
        );
      }
    } catch (error) {
      console.error("Error duplicating report:", error);
      toast.error("Failed to duplicate report. Please try again.");
    } finally {
      setDuplicating(null);
    }
  };

  // RA-1192: Generate AI one-line synopsis for a row. Cached for 24h server-side.
  const generateSynopsis = async (reportId: string) => {
    try {
      setSynopsising(reportId);
      const response = await fetch(`/api/reports/${reportId}/synopsis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402 && payload.upgradeRequired) {
          toast.error(
            payload.error || "Active subscription required for AI summaries.",
          );
          setTimeout(() => router.push("/dashboard/pricing"), 1500);
          return;
        }
        if (response.status === 400) {
          toast.error(
            payload.error ||
              "Connect an AI integration first in Settings → Integrations.",
          );
          return;
        }
        if (response.status === 429) {
          toast.error("Too many requests. Try again in a minute.");
          return;
        }
        toast.error(payload.error || "Failed to generate AI summary.");
        return;
      }
      const synopsis = payload?.data?.aiSynopsis as string | undefined;
      if (synopsis) {
        setLocalSynopsis((prev) => ({ ...prev, [reportId]: synopsis }));
        toast.success(
          payload.data.cached
            ? "Loaded cached summary."
            : "AI summary generated.",
        );
      }
    } catch (error) {
      console.error("Error generating synopsis:", error);
      toast.error("Failed to generate AI summary.");
    } finally {
      setSynopsising(null);
    }
  };

  // Download report function
  const downloadReport = async (reportId: string) => {
    try {
      setDownloading(reportId);
      const response = await fetch(`/api/reports/${reportId}/download`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `water-damage-report-${reportId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error("Failed to download report");
      }
    } catch (error) {
      console.error("Error downloading report:", error);
    } finally {
      setDownloading(null);
    }
  };

  // RA-916: Batch download selected reports as ZIP
  const handleBatchDownload = async () => {
    if (selectedReports.length === 0) {
      toast.error("Select at least one report to download.");
      return;
    }
    if (selectedReports.length > 25) {
      toast.error(
        "Maximum 25 reports per batch download. Please narrow your selection.",
      );
      return;
    }

    const loadingToast = toast.loading(
      `Preparing ${selectedReports.length} PDF${selectedReports.length > 1 ? "s" : ""}…`,
    );
    setBatchDownloading(true);

    try {
      const response = await fetch("/api/reports/bulk-export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedReports, pdfType: "basic" }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use the filename from the Content-Disposition header if present
      const disposition = response.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      a.download =
        match?.[1] ??
        `RestoreAssist_PDFs_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss(loadingToast);
      toast.success(
        `Downloaded ${selectedReports.length} report${selectedReports.length > 1 ? "s" : ""} as ZIP.`,
      );
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(
        error instanceof Error
          ? error.message
          : "Batch download failed. Please try again.",
      );
    } finally {
      setBatchDownloading(false);
    }
  };

  // Bulk delete functions
  const handleBulkDelete = async () => {
    if (selectedReports.length === 0) return;

    try {
      const response = await fetch("/api/reports/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedReports }),
      });

      if (response.ok) {
        setSelectedReports([]);
        setShowBulkDeleteModal(false);
        refetchReports();
      } else {
        console.error("Failed to delete reports");
      }
    } catch (error) {
      console.error("Error deleting reports:", error);
    }
  };

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports((prev) =>
      prev.includes(reportId)
        ? prev.filter((id) => id !== reportId)
        : [...prev, reportId],
    );
  };

  const selectAllReports = () => {
    setSelectedReports(paginatedReports.map((r) => r.id));
  };

  const clearSelection = () => {
    setSelectedReports([]);
  };

  // Data fetching handled by useFetch above — auto-fetches on mount + abort on unmount

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch =
        report.reportNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.propertyAddress
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesStatus =
        filters.status === "all" || report.status === filters.status;
      const matchesHazard =
        filters.hazard === "all" || report.waterCategory === filters.hazard;
      const matchesInsurance =
        filters.insurance === "all" || report.policyType === filters.insurance;

      return (
        matchesSearch && matchesStatus && matchesHazard && matchesInsurance
      );
    });
  }, [reports, searchTerm, filters]);

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );


  const hazardIcons = {
    "Category 1": "💧",
    "Category 2": "🔥",
    "Category 3": "☣️",
    Fire: "🔥",
    Storm: "⛈️",
    Mould: "🍄",
    Flood: "🌊",
    Biohazard: "☣️",
    Impact: "💥",
  };

  const formatCost = (cost: number | string | null | undefined) => {
    if (cost == null || cost === "") return "N/A";
    return typeof cost === "number" ? `$${cost.toLocaleString()}` : cost;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Reports</h1>
          <p className="text-slate-300">
            Manage and view all restoration reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedReports.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">
                {selectedReports.length} selected
              </span>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                <Trash2 size={16} />
                Delete Selected
              </button>
              <button
                onClick={clearSelection}
                className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          <Link
            href="/dashboard/reports/new"
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
          >
            New Report
          </Link>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-4 items-center mb-4">
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by ID, client, address..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-white placeholder-slate-500"
          />
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Filter size={20} />
        </button>
        <button
          onClick={handleBatchDownload}
          disabled={batchDownloading || selectedReports.length === 0}
          className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            selectedReports.length > 0
              ? `Download ${selectedReports.length} selected report(s) as ZIP`
              : "Select reports to download"
          }
        >
          {batchDownloading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500" />
          ) : (
            <Download size={20} />
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-4 animate-fade-in">
          <div className="grid md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Status</option>
                <option value="COMPLETED">Completed</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Water Category
              </label>
              <select
                value={filters.hazard}
                onChange={(e) => {
                  setFilters({ ...filters, hazard: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Categories</option>
                <option value="Category 1">Category 1</option>
                <option value="Category 2">Category 2</option>
                <option value="Category 3">Category 3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Insurance Type
              </label>
              <select
                value={filters.insurance}
                onChange={(e) => {
                  setFilters({ ...filters, insurance: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Types</option>
                <option value="Building & Contents">Building & Contents</option>
                <option value="Standalone Building">Standalone Building</option>
                <option value="Standalone Contents">Standalone Contents</option>
                <option value="Landlord Insurance">Landlord Insurance</option>
                <option value="Portable Valuables">Portable Valuables</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                From Date
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {/* RA-1190: "Apply Filters" button removed — filters auto-apply
                on change via onChange handlers above. The button was a dead
                no-op that misled users into thinking they had to click it. */}
            <button
              onClick={() => {
                setFilters({
                  status: "all",
                  hazard: "all",
                  insurance: "all",
                  dateFrom: "",
                  dateTo: "",
                });
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-800"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden mb-4">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-slate-300">Loading reports...</p>
          </div>
        ) : (
          <>
            {/* RA-1217 — mobile card layout below sm breakpoint.
                Matches the data in the table below but stacks for phones so
                field techs aren't horizontally-scrolling through 11 columns. */}
            <div className="sm:hidden space-y-3 px-4 py-4">
              {paginatedReports.length === 0 ? (
                <div className="text-center py-8 text-slate-300">
                  No reports found.{" "}
                  <Link
                    href="/dashboard/reports/new"
                    className="text-cyan-400 hover:underline"
                  >
                    Create your first report
                  </Link>
                </div>
              ) : (
                paginatedReports.map((report, i) => (
                  <div
                    key={report.id || i}
                    className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleReportSelection(report.id)}
                        aria-label={
                          selectedReports.includes(report.id)
                            ? "Deselect report"
                            : "Select report"
                        }
                        className="mt-1 flex-shrink-0 text-slate-400 hover:text-white transition-colors min-h-[24px] min-w-[24px]"
                      >
                        {selectedReports.includes(report.id) ? (
                          <CheckSquare size={20} className="text-cyan-400" />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className="font-mono text-sm font-semibold text-cyan-400 hover:underline"
                          >
                            {report.reportNumber || report.id}
                          </Link>
                          <StatusBadge
                            tone={REPORT_STATUS_TONES[report.status ?? ""] ?? "neutral"}
                          >
                            {report.status || "COMPLETED"}
                          </StatusBadge>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 flex items-center gap-1">
                            <span>
                              {hazardIcons[
                                report.waterCategory as keyof typeof hazardIcons
                              ] || "💧"}
                            </span>
                            {report.waterCategory || "—"}
                          </span>
                        </div>
                        <div className="text-sm text-white font-medium truncate">
                          {report.clientName || "N/A"}
                        </div>
                        {/* RA-1192: AI one-liner (mobile). Shown only when present. */}
                        {(localSynopsis[report.id] || report.aiSynopsis) && (
                          <p className="text-xs text-slate-400 italic mt-0.5 mb-1 line-clamp-2">
                            {localSynopsis[report.id] || report.aiSynopsis}
                          </p>
                        )}
                        <div className="text-xs text-slate-300 truncate mb-2">
                          {report.propertyAddress || "No address"}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                          <span className="font-medium text-slate-300">
                            {formatCost(report.estimatedCost)}
                          </span>
                          <span>{formatDate(report.createdAt)}</span>
                          {report.policyType && (
                            <span>{report.policyType}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs"
                            aria-label="View report"
                          >
                            <Eye size={16} />
                          </Link>
                          <Link
                            href={`/dashboard/reports/${report.id}/edit`}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs"
                            aria-label="Edit report"
                          >
                            <Edit size={16} />
                          </Link>
                          <button
                            onClick={() => duplicateReport(report.id)}
                            disabled={duplicating === report.id}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs disabled:opacity-50"
                            aria-label="Duplicate report"
                          >
                            {duplicating === report.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                          {/* RA-1192: generate AI summary (mobile). Hidden once populated. */}
                          {!(localSynopsis[report.id] || report.aiSynopsis) && (
                            <button
                              onClick={() => generateSynopsis(report.id)}
                              disabled={synopsising === report.id}
                              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs disabled:opacity-50"
                              aria-label="Generate AI summary"
                            >
                              {synopsising === report.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500" />
                              ) : (
                                <Sparkles size={16} className="text-cyan-400" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop/tablet table — hidden on phone. Keeps the existing
                11-column experience for sm+ screens unchanged. */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                {/* RA-1189 — sticky header so column labels persist when
                    scrolling a long report list. backdrop-blur avoids a
                    hard visual break when rows scroll behind it. */}
                <thead className="sticky top-0 z-10 backdrop-blur-sm bg-slate-900/80">
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      <button
                        onClick={
                          selectedReports.length === paginatedReports.length
                            ? clearSelection
                            : selectAllReports
                        }
                        className="flex items-center gap-2 hover:text-white transition-colors"
                      >
                        {selectedReports.length === paginatedReports.length ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Square size={16} />
                        )}
                        Select All
                      </button>
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Report ID
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Client
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Property
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Category
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Insurance
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Status
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Cost
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Session
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Date
                    </th>
                    <th className="text-left py-4 px-6 text-slate-300 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReports.length === 0 ? (
                    // RA-1193 — proper empty state panel matching
                    // dashboard/inspections pattern: icon + headline +
                    // primary CTA, not a single line in a table cell.
                    <tr>
                      <td colSpan={11} className="py-16 px-6">
                        <div className="flex flex-col items-center justify-center text-center space-y-4">
                          <div className="rounded-full bg-slate-800/50 p-4">
                            <GitBranch
                              size={32}
                              className="text-cyan-400"
                              aria-hidden
                            />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-white">
                              No reports yet
                            </h3>
                            <p className="text-sm text-slate-400 max-w-sm">
                              Water-damage reports appear here once you complete
                              an inspection. Start one to generate your first
                              IICRC-compliant report.
                            </p>
                          </div>
                          <Link
                            href="/dashboard/reports/new"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:from-blue-700 hover:to-cyan-700 transition-colors"
                          >
                            Create your first report
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedReports.map((report, i) => (
                      <tr
                        key={report.id || i}
                        className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                      >
                        <td className="py-4 px-6">
                          <button
                            onClick={() => toggleReportSelection(report.id)}
                            className="flex items-center gap-2 hover:text-white transition-colors"
                          >
                            {selectedReports.includes(report.id) ? (
                              <CheckSquare
                                size={16}
                                className="text-cyan-400"
                              />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td>
                        <td className="py-4 px-6 font-medium text-cyan-400">
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className="hover:underline"
                          >
                            {report.reportNumber || report.id}
                          </Link>
                        </td>
                        <td className="py-4 px-6 max-w-[260px]">
                          <div className="font-medium">
                            {report.clientName || "N/A"}
                          </div>
                          {/* RA-1192: AI one-liner beneath the client name. */}
                          {(localSynopsis[report.id] || report.aiSynopsis) && (
                            <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-2">
                              {localSynopsis[report.id] || report.aiSynopsis}
                            </p>
                          )}
                          {!(localSynopsis[report.id] || report.aiSynopsis) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={synopsising === report.id}
                              onClick={() => generateSynopsis(report.id)}
                              className="mt-1 h-6 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-slate-700/40"
                            >
                              {synopsising === report.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-cyan-500" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              {synopsising === report.id
                                ? "Generating…"
                                : "Generate AI summary"}
                            </Button>
                          )}
                        </td>
                        <td className="py-4 px-6 text-slate-300 text-xs">
                          {report.propertyAddress || "N/A"}
                        </td>
                        <td className="py-4 px-6">
                          <span className="flex items-center gap-2">
                            <span>
                              {hazardIcons[
                                report.waterCategory as keyof typeof hazardIcons
                              ] || "💧"}
                            </span>
                            {report.waterCategory || "N/A"}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs">
                          {report.policyType || "N/A"}
                        </td>
                        <td className="py-4 px-6">
                          <StatusBadge
                            tone={REPORT_STATUS_TONES[report.status ?? ""] ?? "neutral"}
                          >
                            {report.status || "COMPLETED"}
                          </StatusBadge>
                        </td>
                        <td className="py-4 px-6 font-medium">
                          {formatCost(report.estimatedCost)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col gap-1 min-w-[130px]">
                            {/* Phase progress mini-bar */}
                            {report.phases && report.phases.length > 0 && (
                              <div className="flex items-center gap-1">
                                <div className="flex gap-0.5 flex-1">
                                  {report.phases.map((p) => (
                                    <div
                                      key={p.phase}
                                      title={p.label}
                                      className={`flex-1 h-1.5 rounded-sm ${
                                        p.completed
                                          ? "bg-cyan-500"
                                          : "bg-slate-700"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-slate-300 flex-shrink-0">
                                  {
                                    report.phases.filter((p) => p.completed)
                                      .length
                                  }
                                  /{report.phases.length}
                                </span>
                              </div>
                            )}
                            {/* Evaluator score badge */}
                            {report.evaluatorScores != null && (
                              <EvaluatorScoreBadge
                                scores={report.evaluatorScores}
                              />
                            )}
                            {/* Fan-out count + retry count */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(report.fanOutSessions?.length ?? 0) > 0 && (
                                <span className="flex items-center gap-0.5 text-xs text-slate-300">
                                  <GitBranch size={10} />
                                  {report.fanOutSessions!.length}
                                </span>
                              )}
                              {(report.evaluatorScores?.retryCount ?? 0) >
                                0 && (
                                <span className="flex items-center gap-0.5 text-xs text-orange-400">
                                  <RefreshCw size={10} />
                                  {report.evaluatorScores!.retryCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-300">
                          {formatDate(report.createdAt)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/reports/${report.id}`}
                              className="p-1 hover:bg-slate-700 rounded transition-colors"
                              title="View"
                            >
                              <Eye size={16} />
                            </Link>
                            <Link
                              href={`/dashboard/reports/${report.id}/edit`}
                              className="p-1 hover:bg-slate-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </Link>
                            <button
                              onClick={() => duplicateReport(report.id)}
                              disabled={duplicating === report.id}
                              className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                              title="Duplicate"
                            >
                              {duplicating === report.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                            {/* <button 
                            onClick={() => downloadReport(report.id)}
                            disabled={downloading === report.id}
                            className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                            title="Download PDF"
                          >
                            {downloading === report.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
                            ) : (
                              <Download size={16} />
                            )}
                          </button>
                          <button className="p-1 hover:bg-slate-700 rounded transition-colors" title="More">
                            <MoreVertical size={16} />
                          </button> */}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-slate-300 text-sm">
          Showing {(currentPage - 1) * itemsPerPage + 1}-
          {Math.min(currentPage * itemsPerPage, filteredReports.length)} of{" "}
          {filteredReports.length} reports
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-4 py-0 rounded-lg transition-colors text-sm ${
                  pageNum === currentPage
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600"
                    : "border border-slate-700 hover:bg-slate-800"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          {totalPages > 5 && <span className="px-3 py-2">...</span>}
          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* RA-1191 — replaced custom bulk-delete modal with shared shadcn
          AlertDialog-based DeleteConfirmationDialog (focus trap, Esc,
          consistent with dashboard/inspections). */}
      <DeleteConfirmationDialog
        open={showBulkDeleteModal}
        onOpenChange={setShowBulkDeleteModal}
        onConfirm={handleBulkDelete}
        title="Delete selected reports?"
        description="This will permanently delete the selected reports and all associated data. This action cannot be undone."
        itemCount={selectedReports.length}
        itemName="report"
      />
    </div>
  );
}
