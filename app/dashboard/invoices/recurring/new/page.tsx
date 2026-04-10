"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMI_ANNUALLY", label: "Every 6 Months" },
  { value: "ANNUALLY", label: "Annually" },
];

interface Client {
  id: string;
  name: string;
  email: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export default function NewRecurringInvoicePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    templateName: "",
    description: "",
    clientId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    frequency: "MONTHLY",
    startDate: today,
    endDate: "",
    dueInDays: 30,
    terms: "",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, gstRate: 10 },
  ]);

  useEffect(() => {
    fetch("/api/clients?limit=200")
      .then((r) => r.json())
      .then((data) => setClients(data.clients ?? []))
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, []);

  // Auto-fill customer details when a client is selected
  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    setForm((f) => ({
      ...f,
      clientId,
      customerName: client?.name ?? f.customerName,
      customerEmail: client?.email ?? f.customerEmail,
    }));
  };

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
    if (!form.templateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!form.customerName.trim() || !form.customerEmail.trim()) {
      toast.error("Customer name and email are required");
      return;
    }
    if (lineItems.some((item) => !item.description.trim())) {
      toast.error("All line items must have a description");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/invoices/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          endDate: form.endDate || null,
          lineItems: lineItems.map((item) => ({
            ...item,
            unitPrice: Math.round(item.unitPrice * 100),
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create recurring invoice");
      }
      toast.success("Recurring invoice created");
      router.push("/dashboard/invoices/recurring");
    } catch (error: any) {
      toast.error(error.message || "Failed to create recurring invoice");
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
            href="/dashboard/invoices/recurring"
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Create Recurring Invoice
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Set up automatic invoice generation on a schedule
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template & Schedule */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Template & Schedule
            </h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Template Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.templateName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, templateName: e.target.value }))
                }
                placeholder="e.g. Monthly Maintenance — Smith Property"
                required
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional internal notes about this recurring invoice…"
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frequency <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.frequency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frequency: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {FREQUENCIES.map((fr) => (
                    <option key={fr.value} value={fr.value}>
                      {fr.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Start Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                  required
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                  min={form.startDate}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Due (days after issue)
              </label>
              <input
                type="number"
                value={form.dueInDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    dueInDays: parseInt(e.target.value) || 30,
                  }))
                }
                min={0}
                max={365}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          {/* Customer */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Customer
            </h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Link to Client (optional)
              </label>
              <select
                value={form.clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={loadingClients}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
              >
                <option value="">
                  {loadingClients
                    ? "Loading clients…"
                    : "— Select a client (optional) —"}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Customer Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customerName: e.target.value }))
                  }
                  placeholder="Full name or company"
                  required
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customerEmail: e.target.value }))
                  }
                  placeholder="customer@example.com"
                  required
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customerPhone: e.target.value }))
                  }
                  placeholder="04XX XXX XXX"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={form.customerAddress}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customerAddress: e.target.value }))
                  }
                  placeholder="Street address"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
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
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
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
                    placeholder="Unit price ($)"
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
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
                <span>Total per Invoice</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href="/dashboard/invoices/recurring"
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 rounded-xl text-slate-300 font-medium text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !form.templateName.trim()}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {isSubmitting ? "Creating…" : "Create Recurring Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
