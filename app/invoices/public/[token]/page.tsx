"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Loader2, AlertCircle } from "lucide-react";

interface PublicLineItem {
  id: string;
  description: string;
  category?: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

interface PublicInvoice {
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: string | null;
  customerABN?: string | null;
  subtotalExGST: number;
  gstAmount: number;
  totalIncGST: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  footer?: string | null;
  expiresAt?: string | null;
  contractor?: {
    businessName?: string | null;
    businessABN?: string | null;
    businessAddress?: string | null;
    businessPhone?: string | null;
    businessEmail?: string | null;
    businessLogo?: string | null;
  } | null;
  lineItems: PublicLineItem[];
}

function cents(n: number, currency = "AUD") {
  return (n / 100).toLocaleString("en-AU", {
    style: "currency",
    currency,
  });
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>() ?? { token: "" };
  const token = typeof params.token === "string" ? params.token : "";
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Invalid invoice link");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/public/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setError(
              data?.error?.message ||
                data?.message ||
                "This invoice link is invalid or has expired.",
            );
          }
          return;
        }
        if (!cancelled) setInvoice(data.invoice);
      } catch {
        if (!cancelled) setError("Unable to load invoice. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            Invoice unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || "This invoice link is invalid or has expired."}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Contact the business that sent this invoice for a new link.
          </p>
        </div>
      </div>
    );
  }

  const c = invoice.contractor;
  const currency = invoice.currency || "AUD";

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none print:border-0">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {c?.businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.businessLogo}
                alt={c.businessName || "Business logo"}
                className="h-12 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                <FileText className="h-6 w-6 text-slate-500" />
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {c?.businessName || "Tax Invoice"}
              </p>
              {c?.businessABN && (
                <p className="text-xs text-slate-500">ABN {c.businessABN}</p>
              )}
              {c?.businessAddress && (
                <p className="text-xs text-slate-500 whitespace-pre-line">
                  {c.businessAddress}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Tax Invoice
            </p>
            <p className="text-xl font-bold text-slate-900">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Status: {invoice.status.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Bill to
            </p>
            <p className="mt-1 font-medium text-slate-900">
              {invoice.customerName}
            </p>
            {invoice.customerEmail && (
              <p className="text-sm text-slate-600">{invoice.customerEmail}</p>
            )}
            {invoice.customerAddress && (
              <p className="text-sm text-slate-600 whitespace-pre-line">
                {invoice.customerAddress}
              </p>
            )}
            {invoice.customerABN && (
              <p className="text-sm text-slate-500">ABN {invoice.customerABN}</p>
            )}
          </div>
          <div className="sm:text-right space-y-1 text-sm text-slate-600">
            <p>
              <span className="text-slate-400">Invoice date: </span>
              {fmtDate(invoice.invoiceDate)}
            </p>
            <p>
              <span className="text-slate-400">Due date: </span>
              {fmtDate(invoice.dueDate)}
            </p>
            {c?.businessEmail && (
              <p>
                <span className="text-slate-400">From: </span>
                {c.businessEmail}
              </p>
            )}
            {c?.businessPhone && (
              <p>
                <span className="text-slate-400">Phone: </span>
                {c.businessPhone}
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto px-6 sm:px-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Unit</th>
                <th className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-b border-slate-100">
                  <td className="py-3 pr-2 text-slate-800">{li.description}</td>
                  <td className="py-3 px-2 text-right text-slate-600">
                    {li.quantity}
                  </td>
                  <td className="py-3 px-2 text-right text-slate-600">
                    {cents(li.unitPrice, currency)}
                  </td>
                  <td className="py-3 pl-2 text-right font-medium text-slate-900">
                    {cents(li.subtotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end px-6 py-6 sm:px-8">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal (ex GST)</span>
              <span>{cents(invoice.subtotalExGST, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST</span>
              <span>{cents(invoice.gstAmount, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{cents(invoice.totalIncGST, currency)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Amount paid</span>
                  <span>{cents(invoice.amountPaid, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Amount due</span>
                  <span>{cents(invoice.amountDue, currency)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {(invoice.terms || invoice.footer || invoice.notes) && (
          <div className="border-t border-slate-100 px-6 py-5 sm:px-8 space-y-2 text-xs text-slate-500">
            {invoice.terms && (
              <p>
                <span className="font-semibold text-slate-600">Terms: </span>
                {invoice.terms}
              </p>
            )}
            {invoice.footer && <p>{invoice.footer}</p>}
          </div>
        )}

        <div className="border-t border-slate-100 px-6 py-4 sm:px-8 text-center text-[11px] text-slate-400 print:hidden">
          Powered by RestoreAssist · This is a secure invoice view link
          {invoice.expiresAt
            ? ` · Link expires ${fmtDate(invoice.expiresAt)}`
            : ""}
        </div>
      </div>
    </div>
  );
}
