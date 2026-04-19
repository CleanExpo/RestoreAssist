"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const REASONS = [
  { value: "CUSTOMER_REFUND", label: "Customer Refund" },
  { value: "PRICING_ERROR", label: "Pricing Error" },
  { value: "DUPLICATE_INVOICE", label: "Duplicate Invoice" },
  { value: "SERVICE_ISSUE", label: "Service Issue" },
  { value: "GOODWILL", label: "Goodwill" },
  { value: "OTHER", label: "Other" },
];

const REFUND_METHODS = [
  { value: "", label: "— None —" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
];

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export default function NewCreditNotePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  const [form, setForm] = useState({
    invoiceId: "",
    reason: "CUSTOMER_REFUND",
    reasonNotes: "",
    creditDate: new Date().toISOString().split("T")[0],
    refundMethod: "",
    refundReference: "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, gstRate: 10 },
  ]);

  useEffect(() => {
    fetch("/api/invoices?status=SENT,PAID&limit=100")
      .then((r) => r.json())
      .then((data) => {
        setInvoices(data.invoices ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingInvoices(false));
  }, []);

  const addLineItem = () =>
    setLineItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unitPrice: 0, gstRate: 10 },
    ]);

  const removeLineItem = (idx: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const updateLineItem = (
    idx: number,
    field: keyof LineItem,
    value: string | number,
  ) =>
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const gst = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (item.gstRate / 100),
    0,
  );
  const total = subtotal + gst;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invoiceId) {
      toast.error("Please select an invoice");
      return;
    }
    if (lineItems.some((item) => !item.description.trim())) {
      toast.error("All line items must have a description");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/invoices/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lineItems: lineItems.map((item) => ({
            ...item,
            unitPrice: Math.round(item.unitPrice * 100),
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create credit note");
      }
      toast.success("Credit note created");
      router.push("/dashboard/invoices/credit-notes");
    } catch (error: any) {
      toast.error(error.message || "Failed to create credit note");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/invoices/credit-notes"
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Issue Credit Note</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Create a credit note against an existing invoice
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Invoice & Reason */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Credit Details
            </h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Invoice <span className="text-red-400">*</span>
              </label>
              <select
                value={form.invoiceId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceId: e.target.value }))
                }
                required
                disabled={loadingInvoices}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
              >
                <option value="">
                  {loadingInvoices ? "Loading invoices…" : "Select an invoice"}
                </option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {inv.customerName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Reason <span className="text-red-400">*</span>
              </label>
              <select
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notes
              </label>
              <textarea
                value={form.reasonNotes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reasonNotes: e.target.value }))
                }
                placeholder="Additional details about this credit note…"
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Credit Date
                </label>
                <input
                  type="date"
                  value={form.creditDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, creditDate: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Refund Method
                </label>
                <select
                  value={form.refundMethod}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, refundMethod: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {REFUND_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Line Items
              </h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(idx, "description", e.target.value)
                    }
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "quantity",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    min="0"
                    step="0.01"
                    placeholder="Qty"
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div className="col-span-3">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "unitPrice",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    min="0"
                    step="0.01"
                    placeholder="Unit price"
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div className="col-span-1 flex items-center justify-center pt-2">
                  <span className="text-xs text-slate-400">10%</span>
                </div>
                <div className="col-span-1 flex items-center justify-center pt-1">
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="p-1.5 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t border-slate-700/50 pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal (ex GST)</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>GST (10%)</span>
                <span>${gst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white font-semibold text-base pt-1">
                <span>Total Credit</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href="/dashboard/invoices/credit-notes"
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 rounded-xl text-slate-300 font-medium text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !form.invoiceId}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {isSubmitting ? "Creating…" : "Issue Credit Note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
