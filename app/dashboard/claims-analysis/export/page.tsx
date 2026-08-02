"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Download,
  FileDown,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

interface MissingElement {
  id: string;
  category: string;
  elementType: string;
  elementName: string;
  description?: string;
  severity: string;
}

interface BatchInfo {
  id: string;
  folderName: string;
  status: string;
}

interface Analysis {
  id: string;
  fileName: string;
  claimNumber?: string;
  propertyAddress?: string;
  technicianName?: string;
  completenessScore?: number;
  complianceScore?: number;
  standardizationScore?: number;
  status: string;
  missingIICRCElements: number;
  missingOHSElements: number;
  missingBillingItems: number;
  missingDocumentation: number;
  estimatedMissingRevenue?: number;
  createdAt: string;
  missingElements: MissingElement[];
  batch: BatchInfo;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const CLAIM_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "IICRC", label: "IICRC" },
  { value: "OHS", label: "OHS / WHS" },
  { value: "BILLING", label: "Billing" },
  { value: "DOCUMENTATION", label: "Documentation" },
];

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "bg-success-subtle text-success-subtle-foreground",
  PROCESSING: "bg-info-subtle text-info-subtle-foreground",
  PENDING: "bg-warning-subtle text-warning-subtle-foreground",
  FAILED: "bg-destructive-subtle text-destructive-subtle-foreground",
};

function getOverallScore(analysis: Analysis): number | null {
  const scores = [
    analysis.completenessScore,
    analysis.complianceScore,
    analysis.standardizationScore,
  ].filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function getTotalIssues(analysis: Analysis): number {
  return (
    analysis.missingIICRCElements +
    analysis.missingOHSElements +
    analysis.missingBillingItems +
    analysis.missingDocumentation
  );
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function exportToCSV(analyses: Analysis[], filename = "claims-analyses.csv") {
  const headers = [
    "Date",
    "File Name",
    "Claim Number",
    "Property Address",
    "Technician",
    "Completeness Score",
    "Compliance Score",
    "Standardization Score",
    "Overall Score",
    "Total Issues",
    "Missing IICRC",
    "Missing OHS",
    "Missing Billing",
    "Missing Documentation",
    "Est. Missing Revenue",
    "Status",
    "Batch",
  ];

  const rows = analyses.map((a) => [
    new Date(a.createdAt).toLocaleDateString("en-AU"),
    a.fileName ?? "",
    a.claimNumber ?? "",
    a.propertyAddress ?? "",
    a.technicianName ?? "",
    a.completenessScore ?? "",
    a.complianceScore ?? "",
    a.standardizationScore ?? "",
    getOverallScore(a) ?? "",
    getTotalIssues(a),
    a.missingIICRCElements,
    a.missingOHSElements,
    a.missingBillingItems,
    a.missingDocumentation,
    a.estimatedMissingRevenue != null
      ? `$${a.estimatedMissingRevenue.toFixed(2)}`
      : "",
    a.status ?? "",
    a.batch?.folderName ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ClaimsAnalysisExportPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [claimTypeFilter, setClaimTypeFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [minScore, setMinScore] = useState("");

  // Pending filter state (applied on button click)
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    claimType: "all",
    technician: "",
    minScore: "",
  });

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100"); // fetch up to 100 for export

      if (appliedFilters.technician) {
        params.set("technicianName", appliedFilters.technician);
      }
      if (appliedFilters.minScore) {
        params.set("minScore", appliedFilters.minScore);
      }

      const res = await fetch(`/api/claims/analyses?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analyses");
      const data = await res.json();

      let filtered: Analysis[] = data.analyses ?? [];

      // Client-side date filtering (API doesn't support date range directly)
      if (appliedFilters.dateFrom) {
        const from = new Date(appliedFilters.dateFrom);
        filtered = filtered.filter((a) => new Date(a.createdAt) >= from);
      }
      if (appliedFilters.dateTo) {
        const to = new Date(appliedFilters.dateTo);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter((a) => new Date(a.createdAt) <= to);
      }

      // Client-side claim type filter (filter by missing element category)
      if (appliedFilters.claimType !== "all") {
        filtered = filtered.filter((a) => {
          if (appliedFilters.claimType === "IICRC")
            return a.missingIICRCElements > 0;
          if (appliedFilters.claimType === "OHS")
            return a.missingOHSElements > 0;
          if (appliedFilters.claimType === "BILLING")
            return a.missingBillingItems > 0;
          if (appliedFilters.claimType === "DOCUMENTATION")
            return a.missingDocumentation > 0;
          return true;
        });
      }

      setAnalyses(filtered);
      setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || "Failed to load analyses");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const applyFilters = () => {
    setAppliedFilters({
      dateFrom,
      dateTo,
      claimType: claimTypeFilter,
      technician: technicianFilter,
      minScore,
    });
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setClaimTypeFilter("all");
    setTechnicianFilter("");
    setMinScore("");
    setAppliedFilters({
      dateFrom: "",
      dateTo: "",
      claimType: "all",
      technician: "",
      minScore: "",
    });
    setSelectedIds(new Set());
  };

  const allSelected =
    analyses.length > 0 && analyses.every((a) => selectedIds.has(a.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(analyses.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedAnalyses = analyses.filter((a) => selectedIds.has(a.id));

  const handleExportSelected = () => {
    if (selectedAnalyses.length === 0) {
      toast.error("No analyses selected");
      return;
    }
    exportToCSV(selectedAnalyses, "claims-analyses-selected.csv");
    toast.success(`Exported ${selectedAnalyses.length} analyses`);
  };

  const handleExportAll = () => {
    if (analyses.length === 0) {
      toast.error("No analyses to export");
      return;
    }
    exportToCSV(analyses, "claims-analyses-all.csv");
    toast.success(`Exported ${analyses.length} analyses`);
  };

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            href="/dashboard/claims-analysis"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Claims Analysis
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <FileDown className="h-6 w-6 text-cyan-500 shrink-0" aria-hidden />
              Past Analyses
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse, filter, and export saved claim gap analyses.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportSelected}
            disabled={!someSelected || loading}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            Export selected ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            onClick={handleExportAll}
            disabled={analyses.length === 0 || loading}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export all ({analyses.length})
          </Button>
        </div>
      </header>

      <DashboardPanel className="w-full">
        <DashboardPanelHeader
          title="Filters"
          action={<Filter className="h-4 w-4 text-muted-foreground" />}
        />
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date-from" className="text-xs">
                Date from
              </Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date-to" className="text-xs">
                Date to
              </Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="claim-type" className="text-xs">
                Issue category
              </Label>
              <Select
                value={claimTypeFilter}
                onValueChange={setClaimTypeFilter}
              >
                <SelectTrigger id="claim-type" className="h-9 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  {CLAIM_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="technician" className="text-xs">
                Technician
              </Label>
              <Input
                id="technician"
                type="text"
                placeholder="Filter by name"
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min-score" className="text-xs">
                Min score
              </Label>
              <Input
                id="min-score"
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button
              size="sm"
              onClick={applyFilters}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Filter className="h-3.5 w-3.5" />
              )}
              Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={loading}
              className="gap-2 text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </DashboardPanel>

      <DashboardPanel padded={false} className="w-full">
        <div className="p-4 sm:p-6 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-medium text-foreground">
              {loading ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : (
                <span>
                  Showing{" "}
                  <span className="font-semibold tabular-nums">
                    {analyses.length}
                  </span>{" "}
                  {pagination && pagination.total !== analyses.length ? (
                    <span className="text-muted-foreground text-sm font-normal">
                      (filtered from {pagination.total} total)
                    </span>
                  ) : null}{" "}
                  {analyses.length === 1 ? "analysis" : "analyses"}
                </span>
              )}
            </h3>
            {someSelected ? (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {selectedIds.size} selected
              </Badge>
            ) : null}
          </div>
        </div>
        <div>
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : analyses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <FileDown className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No analyses match your filters
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Try adjusting your filters or{" "}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="underline hover:text-foreground"
                >
                  reset to show all
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) =>
                          toggleAll(Boolean(checked))
                        }
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">
                      File / Claim
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Property
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Technician
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-center">
                      Score
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-center">
                      Issues
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-center">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((analysis) => {
                    const score = getOverallScore(analysis);
                    const issues = getTotalIssues(analysis);
                    const isSelected = selectedIds.has(analysis.id);

                    return (
                      <TableRow
                        key={analysis.id}
                        className={
                          isSelected
                            ? "bg-cyan-500/5 hover:bg-cyan-500/10"
                            : "hover:bg-muted/40"
                        }
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              toggleRow(analysis.id, Boolean(checked))
                            }
                            aria-label={`Select ${analysis.fileName}`}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {new Date(analysis.createdAt).toLocaleDateString(
                            "en-AU",
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="text-sm font-medium text-foreground truncate">
                            {analysis.fileName}
                          </p>
                          {analysis.claimNumber ? (
                            <p className="text-xs text-muted-foreground">
                              #{analysis.claimNumber}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-sm text-foreground/80 truncate block">
                            {analysis.propertyAddress ?? (
                              <span className="text-muted-foreground italic">
                                —
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-foreground/80">
                          {analysis.technicianName ?? (
                            <span className="text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {score !== null ? (
                            <span
                              className={`text-sm font-semibold tabular-nums ${scoreColor(score)}`}
                            >
                              {score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {issues > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                            >
                              {issues}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs border-success-subtle-foreground/30 text-success-subtle-foreground bg-success-subtle"
                            >
                              0
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_COLOR[analysis.status] ??
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            {analysis.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DashboardPanel>
    </div>
  );
}
