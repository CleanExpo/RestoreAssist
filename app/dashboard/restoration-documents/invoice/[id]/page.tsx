"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RestorationInvoiceForm, {
  type RestorationInvoiceFormData,
} from "@/components/restoration/RestorationInvoiceForm";
import { Loader2 } from "lucide-react";

export default function EditRestorationInvoicePage() {
  const params = useParams<{ id: string }>() ?? { id: "" };
  const id = typeof params.id === "string" ? params.id : "";
  const [doc, setDoc] = useState<
    | {
        reportId: string | null;
        data: RestorationInvoiceFormData;
      }
    | null
    | "not_found"
  >(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/restoration-documents/${id}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data.document?.data) {
          setDoc({
            reportId: data.document.reportId ?? null,
            data: data.document.data as RestorationInvoiceFormData,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setDoc("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="py-12 text-center text-neutral-600 dark:text-slate-400">
        Invalid document ID
      </div>
    );
  }

  if (doc === "not_found") {
    return (
      <div className="py-12 text-center text-neutral-600 dark:text-slate-400">
        Document not found
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
      </div>
    );
  }

  const clientName = doc.data.client?.name ?? "";
  const clientEmail = doc.data.client?.email ?? "";
  const arPrefill = new URLSearchParams();
  if (clientName) arPrefill.set("customerName", clientName);
  if (clientEmail) arPrefill.set("customerEmail", clientEmail);
  arPrefill.set("notes", `From restoration document ${id}`);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 dark:bg-slate-950">
      <div className="mx-auto mb-4 max-w-5xl px-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          This is a <strong>Restoration Document</strong> (IICRC-worded), not an
          AR Billing Invoice.{" "}
          <Link
            href={`/dashboard/invoices/new?${arPrefill.toString()}`}
            className="font-medium text-teal-700 underline dark:text-teal-400"
          >
            Create AR Invoice draft with client prefill
          </Link>
        </div>
      </div>
      <RestorationInvoiceForm
        documentId={id}
        reportId={doc.reportId ?? undefined}
        initialSavedData={doc.data}
      />
    </div>
  );
}
