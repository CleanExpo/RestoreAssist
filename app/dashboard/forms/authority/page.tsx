"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Loader2, RefreshCw, Send } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthorityFormStatus =
  | "DRAFT"
  | "PENDING_SIGNATURES"
  | "PARTIALLY_SIGNED"
  | "COMPLETED"
  | "CANCELLED";

type StatusFilter = "ALL" | AuthorityFormStatus;

interface FormSignature {
  id: string;
  signatoryName: string;
  signatoryRole: string;
  signedAt: string | null;
  signatureRequestSentAt: string | null;
}

interface AuthorityForm {
  id: string;
  templateId: string;
  reportId: string;
  status: AuthorityFormStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  clientName: string;
  template: {
    id: string;
    name: string;
    code: string;
    description: string | null;
  };
  report: {
    id: string;
    reportNumber: string | null;
    clientName: string;
    propertyAddress: string;
  };
  signatures: FormSignature[];
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AuthorityFormStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  PENDING_SIGNATURES: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  PARTIALLY_SIGNED: {
    label: "Partially Signed",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_SIGNATURES", label: "Sent" },
  { value: "PARTIALLY_SIGNED", label: "Partially Signed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getEarliestSentDate(signatures: FormSignature[]): string | null {
  const dates = signatures
    .map((s) => s.signatureRequestSentAt)
    .filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

function getLatestSignedDate(signatures: FormSignature[]): string | null {
  const dates = signatures
    .map((s) => s.signedAt)
    .filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return dates.sort().reverse()[0];
}

// ─── Row skeleton ─────────────────────────────────────────────────────────────

function TableRowSkeleton() {
  return (
    <TableRow>
      {[...Array(6)].map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuthorityFormsPage() {
  const [forms, setForms] = useState<AuthorityForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [resending, setResending] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchForms() {
    setLoading(true);
    try {
      const res = await fetch("/api/authority-forms");
      if (!res.ok) throw new Error("Failed to fetch authority forms");
      const data = await res.json();
      setForms(data.forms ?? []);
    } catch (err) {
      console.error("[AuthorityFormsPage] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchForms();
  }, []);

  // ── Resend handler ─────────────────────────────────────────────────────────

  async function handleResend(form: AuthorityForm) {
    // Find the first signature that hasn't been signed and was already sent
    const pendingSig = form.signatures.find(
      (s) => !s.signedAt && s.signatureRequestSentAt,
    );
    if (!pendingSig) return;

    setResending(form.id);
    try {
      const res = await fetch(
        `/api/authority-forms/${form.id}/send-signature-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureId: pendingSig.id }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        console.error("[AuthorityFormsPage] resend failed:", data.error);
      } else {
        await fetchForms();
      }
    } catch (err) {
      console.error("[AuthorityFormsPage] resend error:", err);
    } finally {
      setResending(null);
    }
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered =
    statusFilter === "ALL"
      ? forms
      : forms.filter((f) => f.status === statusFilter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-cyan-500" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Authority Forms
          </h1>
          {!loading && (
            <Badge
              variant="secondary"
              className="ml-1 bg-slate-100 text-slate-600"
            >
              {forms.length}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchForms}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.value === "ALL"
              ? forms.length
              : forms.filter((f) => f.status === tab.value).length;
          const active = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-slate-700">
            {statusFilter === "ALL"
              ? "All Authority Forms"
              : `${FILTER_TABS.find((t) => t.value === statusFilter)?.label} Forms`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-6">Template</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <>
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                </>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-slate-300" />
                      <span>No authority forms found</span>
                      {statusFilter !== "ALL" && (
                        <button
                          onClick={() => setStatusFilter("ALL")}
                          className="text-sm text-cyan-600 underline underline-offset-2"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((form) => {
                  const config =
                    STATUS_CONFIG[form.status] ?? STATUS_CONFIG.DRAFT;
                  const sentDate = getEarliestSentDate(form.signatures);
                  const signedDate = getLatestSignedDate(form.signatures);
                  const canResend = form.status === "PENDING_SIGNATURES";
                  const isResending = resending === form.id;

                  return (
                    <TableRow key={form.id} className="hover:bg-slate-50/60">
                      <TableCell className="pl-6 font-medium">
                        {form.template?.name ?? "Unknown template"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/reports/${form.reportId}`}
                          className="text-cyan-600 hover:underline underline-offset-2"
                        >
                          {form.report?.reportNumber ??
                            form.reportId.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {form.report?.clientName ?? form.clientName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium ${config.className}`}
                        >
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(sentDate)}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(signedDate)}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {canResend && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isResending}
                            onClick={() => handleResend(form)}
                            className="gap-1.5 text-xs"
                          >
                            {isResending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            {isResending ? "Sending…" : "Resend"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
