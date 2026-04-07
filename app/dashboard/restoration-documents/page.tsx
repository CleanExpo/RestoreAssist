"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, Loader2, Receipt, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DocSummary {
  id: string;
  documentType: string;
  documentNumber: string;
  title: string | null;
  reportId: string | null;
  createdAt: string;
  updatedAt: string;
}

type FilterType = "ALL" | "RESTORATION_INVOICE" | "ESTIMATE" | "OTHER";

const FILTER_TABS: { value: FilterType; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RESTORATION_INVOICE", label: "Tax Invoice" },
  { value: "ESTIMATE", label: "Estimate" },
  { value: "OTHER", label: "Other" },
];

export default function RestorationDocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchDocs() {
      try {
        const res = await fetch("/api/restoration-documents", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDocuments(data.documents ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDocs();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDocuments = useMemo(() => {
    if (activeFilter === "ALL") return documents;
    if (activeFilter === "OTHER") {
      return documents.filter(
        (d) =>
          d.documentType !== "RESTORATION_INVOICE" &&
          d.documentType !== "ESTIMATE",
      );
    }
    return documents.filter((d) => d.documentType === activeFilter);
  }, [documents, activeFilter]);

  const typeLabel = (type: string) => {
    if (type === "RESTORATION_INVOICE") return "Tax Invoice";
    if (type === "ESTIMATE") return "Estimate";
    return type.replace(/_/g, " ");
  };

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/restoration-documents/${id}`, {
        method: "DELETE",
      });
      if (res.ok) setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const getDocHref = (doc: DocSummary) => {
    if (doc.documentType === "RESTORATION_INVOICE") {
      return `/dashboard/restoration-documents/invoice/${doc.id}`;
    }
    return `/dashboard/restoration-documents/${doc.id}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950">
      <div className="mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Restoration Documents
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">
              Australian-law tax invoices and restoration documentation.
              Auto-filled from your profile and linked reports.
            </p>
          </div>
          <Link
            href="/dashboard/restoration-documents/invoice/new"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700",
              "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
            )}
          >
            <Plus className="h-4 w-4" />
            New Restoration Invoice
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeFilter === tab.value
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800",
              )}
            >
              {tab.label}
              {tab.value !== "ALL" && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                    activeFilter === tab.value
                      ? "bg-teal-500 text-white"
                      : "bg-neutral-100 text-neutral-600 dark:bg-slate-700 dark:text-slate-400",
                  )}
                >
                  {tab.value === "OTHER"
                    ? documents.filter(
                        (d) =>
                          d.documentType !== "RESTORATION_INVOICE" &&
                          d.documentType !== "ESTIMATE",
                      ).length
                    : documents.filter((d) => d.documentType === tab.value)
                        .length}
                </span>
              )}
              {tab.value === "ALL" && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                    activeFilter === "ALL"
                      ? "bg-teal-500 text-white"
                      : "bg-neutral-100 text-neutral-600 dark:bg-slate-700 dark:text-slate-400",
                  )}
                >
                  {documents.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="mx-auto h-12 w-12 text-neutral-300 dark:text-slate-600" />
              <p className="mt-4 text-neutral-600 dark:text-slate-400">
                {activeFilter === "ALL"
                  ? "No restoration documents yet"
                  : `No ${FILTER_TABS.find((t) => t.value === activeFilter)?.label ?? ""} documents`}
              </p>
              {activeFilter === "ALL" && (
                <>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-slate-500">
                    Create a Tax Invoice (Water, Fire, Mould, BioClean, etc.) to
                    get started.
                  </p>
                  <Link
                    href="/dashboard/restoration-documents/invoice/new"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    <Plus className="h-4 w-4" />
                    New Restoration Invoice
                  </Link>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-slate-700">
              {filteredDocuments.map((doc) => (
                <li key={doc.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => router.push(getDocHref(doc))}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-4 px-4 py-4 text-left transition-colors",
                      "hover:bg-neutral-50 dark:hover:bg-slate-800/50",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                      <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {doc.title || doc.documentNumber}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-slate-400">
                        {typeLabel(doc.documentType)} · {doc.documentNumber}
                      </p>
                    </div>
                    <div className="text-right text-xs text-neutral-500 dark:text-slate-400">
                      <p>
                        {new Date(doc.createdAt).toLocaleDateString("en-AU", {
                          dateStyle: "medium",
                        })}
                      </p>
                    </div>
                  </button>

                  {/* Delete button with AlertDialog confirmation */}
                  <div className="shrink-0 px-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Delete ${doc.title || doc.documentNumber}`}
                          disabled={deletingId === doc.id}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors",
                            "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400",
                            "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {deletingId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete &quot;
                            {doc.title || doc.documentNumber}&quot;. This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(doc.id)}
                            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
