"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "AWAITING_SIGNATURE"
  | "COMPLETED"
  | "CANCELLED";
type FormType =
  | "WORK_ORDER"
  | "JSA"
  | "AUTHORITY_TO_COMMENCE"
  | "SITE_INDUCTION"
  | "CUSTOM";

interface Submission {
  id: string;
  submissionNumber: string;
  formType: FormType;
  templateName: string;
  reportAddress: string;
  completenessScore: number;
  signaturesRequired: number;
  signaturesCompleted: number;
  status: FormStatus;
  submittedAt?: string | null;
  startedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Mock data (fallback when API is unavailable)
// ---------------------------------------------------------------------------

const MOCK_SUBMISSIONS: Submission[] = [
  {
    id: "1",
    submissionNumber: "FS-001",
    formType: "WORK_ORDER",
    templateName: "Standard Work Order",
    reportAddress: "42 Smith St, Melbourne VIC",
    completenessScore: 95,
    signaturesRequired: 2,
    signaturesCompleted: 2,
    status: "COMPLETED",
    submittedAt: "2026-03-28T10:00:00Z",
  },
  {
    id: "2",
    submissionNumber: "FS-002",
    formType: "JSA",
    templateName: "Job Safety Analysis",
    reportAddress: "15 Queen Rd, Sydney NSW",
    completenessScore: 60,
    signaturesRequired: 1,
    signaturesCompleted: 0,
    status: "AWAITING_SIGNATURE",
    submittedAt: null,
    startedAt: "2026-03-30T09:00:00Z",
  },
  {
    id: "3",
    submissionNumber: "FS-003",
    formType: "AUTHORITY_TO_COMMENCE",
    templateName: "Authority to Commence",
    reportAddress: "8 Park Ave, Brisbane QLD",
    completenessScore: 30,
    signaturesRequired: 3,
    signaturesCompleted: 0,
    status: "IN_PROGRESS",
    startedAt: "2026-03-31T08:00:00Z",
  },
  {
    id: "4",
    submissionNumber: "FS-004",
    formType: "SITE_INDUCTION",
    templateName: "Site Induction",
    reportAddress: "22 Main St, Adelaide SA",
    completenessScore: 0,
    signaturesRequired: 1,
    signaturesCompleted: 0,
    status: "DRAFT",
    startedAt: "2026-03-31T07:00:00Z",
  },
  {
    id: "5",
    submissionNumber: "FS-005",
    formType: "WORK_ORDER",
    templateName: "Emergency Work Order",
    reportAddress: "5 River Rd, Perth WA",
    completenessScore: 100,
    signaturesRequired: 2,
    signaturesCompleted: 2,
    status: "COMPLETED",
    submittedAt: "2026-03-25T14:00:00Z",
  },
  {
    id: "6",
    submissionNumber: "FS-006",
    formType: "CUSTOM",
    templateName: "Custom Remediation Form",
    reportAddress: "101 Ocean Dr, Gold Coast QLD",
    completenessScore: 75,
    signaturesRequired: 2,
    signaturesCompleted: 1,
    status: "AWAITING_SIGNATURE",
    startedAt: "2026-03-29T11:00:00Z",
  },
  {
    id: "7",
    submissionNumber: "FS-007",
    formType: "JSA",
    templateName: "High-Risk JSA",
    reportAddress: "3 Industrial Way, Hobart TAS",
    completenessScore: 50,
    signaturesRequired: 2,
    signaturesCompleted: 0,
    status: "IN_PROGRESS",
    startedAt: "2026-03-31T06:30:00Z",
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITEMS_PER_PAGE = 20;

const STATUS_LABELS: Record<FormStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  AWAITING_SIGNATURE: "Awaiting Signature",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const FORM_TYPE_LABELS: Record<FormType, string> = {
  WORK_ORDER: "Work Order",
  JSA: "Job Safety Analysis",
  AUTHORITY_TO_COMMENCE: "Authority to Commence",
  SITE_INDUCTION: "Site Induction",
  CUSTOM: "Custom",
};

const ALL_STATUSES: FormStatus[] = [
  "DRAFT",
  "IN_PROGRESS",
  "AWAITING_SIGNATURE",
  "COMPLETED",
  "CANCELLED",
];
const ALL_FORM_TYPES: FormType[] = [
  "WORK_ORDER",
  "JSA",
  "AUTHORITY_TO_COMMENCE",
  "SITE_INDUCTION",
  "CUSTOM",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: FormStatus }) {
  const colourMap: Record<FormStatus, string> = {
    DRAFT: "border-transparent bg-gray-100 text-gray-700",
    IN_PROGRESS: "border-transparent bg-blue-100 text-blue-700",
    AWAITING_SIGNATURE: "border-transparent bg-amber-100 text-amber-700",
    COMPLETED: "border-transparent bg-green-100 text-green-700",
    CANCELLED: "border-transparent bg-red-100 text-red-700",
  };
  return <Badge className={colourMap[status]}>{STATUS_LABELS[status]}</Badge>;
}

function CompletenessBar({ score }: { score: number }) {
  const isGreen = score >= 80;
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="relative h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${isGreen ? "bg-green-500" : "bg-amber-400"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">
        {score}%
      </span>
    </div>
  );
}

function SignatureBadge({
  required,
  completed,
  status,
}: {
  required: number;
  completed: number;
  status: FormStatus;
}) {
  if (status !== "AWAITING_SIGNATURE") return null;
  const allSigned = completed >= required;
  return (
    <Badge
      className={
        allSigned
          ? "border-transparent bg-green-100 text-green-700"
          : "border-transparent bg-amber-100 text-amber-700"
      }
    >
      {completed}/{required} signed
    </Badge>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={7} className="py-16 text-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-40" />
          <p className="text-sm font-medium">No submissions found</p>
          <p className="text-xs">
            Adjust your filters or create a new submission from a template.
          </p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/dashboard/forms/templates">
              <Plus className="h-4 w-4 mr-1" />
              Create from Template
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FormSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeStatusChip, setActiveStatusChip] = useState<FormStatus | "ALL">(
    "ALL",
  );
  const [formTypeFilter, setFormTypeFilter] = useState<FormType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<FormStatus | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch data
  useEffect(() => {
    const controller = new AbortController();
    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (formTypeFilter !== "ALL") params.set("formType", formTypeFilter);
        if (searchText) params.set("search", searchText);

        const res = await fetch(`/api/forms/submissions?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSubmissions(data.submissions ?? []);
      } catch {
        // API unavailable — fall back to mock data
        setSubmissions(MOCK_SUBMISSIONS);
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
    return () => controller.abort();
  }, [statusFilter, formTypeFilter, searchText]);

  // Status counts for chips
  const statusCounts = useMemo(() => {
    const counts: Record<FormStatus, number> = {
      DRAFT: 0,
      IN_PROGRESS: 0,
      AWAITING_SIGNATURE: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    submissions.forEach((s) => {
      if (s.status in counts) counts[s.status]++;
    });
    return counts;
  }, [submissions]);

  // Apply client-side filters
  const filtered = useMemo(() => {
    let items = submissions;

    // Status chip filter (takes precedence over dropdown if set)
    const effectiveStatus =
      activeStatusChip !== "ALL"
        ? activeStatusChip
        : statusFilter !== "ALL"
          ? statusFilter
          : null;
    if (effectiveStatus) {
      items = items.filter((s) => s.status === effectiveStatus);
    }

    if (formTypeFilter !== "ALL") {
      items = items.filter((s) => s.formType === formTypeFilter);
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.submissionNumber.toLowerCase().includes(q) ||
          s.reportAddress.toLowerCase().includes(q),
      );
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      items = items.filter((s) => {
        const d = s.submittedAt ?? s.startedAt;
        return d ? new Date(d).getTime() >= from : false;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000; // inclusive end of day
      items = items.filter((s) => {
        const d = s.submittedAt ?? s.startedAt;
        return d ? new Date(d).getTime() <= to : false;
      });
    }

    return items;
  }, [
    submissions,
    activeStatusChip,
    statusFilter,
    formTypeFilter,
    searchText,
    dateFrom,
    dateTo,
  ]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeStatusChip,
    statusFilter,
    formTypeFilter,
    searchText,
    dateFrom,
    dateTo,
  ]);

  const handleChipClick = (status: FormStatus | "ALL") => {
    setActiveStatusChip(status);
    // Sync dropdown to match
    if (status !== "ALL") setStatusFilter(status);
    else setStatusFilter("ALL");
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Breadcrumb + heading */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/dashboard/forms/templates"
            className="hover:text-foreground transition-colors"
          >
            Forms
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Submissions</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Form Submissions
        </h1>
      </div>

      {/* Status chip strip */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleChipClick("ALL")}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
            activeStatusChip === "ALL"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-accent"
          }`}
        >
          All
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs leading-none">
            {submissions.length}
          </span>
        </button>
        {ALL_STATUSES.filter((s) => s !== "CANCELLED").map((status) => {
          const chipColour: Record<
            FormStatus,
            { active: string; inactive: string }
          > = {
            DRAFT: {
              active: "border-gray-600 bg-gray-600 text-white",
              inactive:
                "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
            },
            IN_PROGRESS: {
              active: "border-blue-600 bg-blue-600 text-white",
              inactive:
                "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
            },
            AWAITING_SIGNATURE: {
              active: "border-amber-600 bg-amber-600 text-white",
              inactive:
                "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
            },
            COMPLETED: {
              active: "border-green-600 bg-green-600 text-white",
              inactive:
                "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
            },
            CANCELLED: {
              active: "border-red-600 bg-red-600 text-white",
              inactive:
                "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
            },
          };
          const isActive = activeStatusChip === status;
          return (
            <button
              key={status}
              onClick={() => handleChipClick(status)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? chipColour[status].active
                  : chipColour[status].inactive
              }`}
            >
              {STATUS_LABELS[status]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs leading-none ${isActive ? "bg-white/25" : "bg-black/10"}`}
              >
                {statusCounts[status]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap gap-3 p-4 items-end">
          {/* Text search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by submission # or address…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Form type dropdown */}
          <div className="min-w-[180px]">
            <Select
              value={formTypeFilter}
              onValueChange={(val) =>
                setFormTypeFilter(val as FormType | "ALL")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All form types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All form types</SelectItem>
                {ALL_FORM_TYPES.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {FORM_TYPE_LABELS[ft]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status dropdown */}
          <div className="min-w-[170px]">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val as FormStatus | "ALL");
                setActiveStatusChip(val as FormStatus | "ALL");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36"
              aria-label="Date from"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36"
              aria-label="Date to"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="gap-0 py-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Submission #
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Form Type
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Linked Report
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Completeness
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Signatures
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : paginated.length === 0 ? (
                <EmptyState />
              ) : (
                paginated.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {sub.submissionNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {FORM_TYPE_LABELS[sub.formType]}
                      </span>
                      <br />
                      <span className="text-xs">{sub.templateName}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                      {sub.reportAddress}
                    </td>
                    <td className="px-4 py-3 w-36">
                      <CompletenessBar score={sub.completenessScore} />
                    </td>
                    <td className="px-4 py-3">
                      <SignatureBadge
                        required={sub.signaturesRequired}
                        completed={sub.signaturesCompleted}
                        status={sub.status}
                      />
                      {sub.status !== "AWAITING_SIGNATURE" && (
                        <span className="text-xs text-muted-foreground">
                          {sub.signaturesCompleted}/{sub.signaturesRequired}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(sub.submittedAt ?? sub.startedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
              {filtered.length} submissions
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - currentPage) <= 1,
                )
                .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                    acc.push("ellipsis");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "ellipsis" ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1.5 text-muted-foreground text-sm"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={currentPage === item ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(item as number)}
                      className="min-w-[32px]"
                    >
                      {item}
                    </Button>
                  ),
                )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
