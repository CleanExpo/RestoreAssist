"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const FORM_TYPES = [
  { value: "INITIAL_ASSESSMENT", label: "Initial Assessment" },
  { value: "MOISTURE_MAPPING", label: "Moisture Mapping" },
  { value: "EQUIPMENT_LOG", label: "Equipment Log" },
  { value: "DAILY_MONITORING", label: "Daily Monitoring" },
  { value: "FINAL_INSPECTION", label: "Final Inspection" },
  { value: "SCOPE_OF_WORKS", label: "Scope of Works" },
  { value: "PHOTO_LOG", label: "Photo Log" },
  { value: "CLIENT_COMMUNICATION", label: "Client Communication" },
  { value: "CUSTOM", label: "Custom" },
];

const CATEGORIES = [
  { value: "ASSESSMENT", label: "Assessment" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "REPORTING", label: "Reporting" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "OTHER", label: "Other" },
];

export default function NewFormTemplatePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    formType: "CUSTOM",
    category: "OTHER",
    requiresSignatures: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/form-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          formType: form.formType,
          category: form.category,
          requiresSignatures: form.requiresSignatures,
          formSchema: JSON.stringify({ sections: [], fields: [] }),
          status: "DRAFT",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create template");
      }

      toast.success("Template created successfully");
      router.push("/dashboard/form-templates");
    } catch (error: any) {
      toast.error(error.message || "Failed to create template");
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
            href="/dashboard/form-templates"
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">New Form Template</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Create a reusable template for inspections and reports
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Template Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Water Damage Initial Assessment"
                required
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="What is this template used for?"
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
              />
            </div>

            {/* Form Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Form Type
              </label>
              <select
                value={form.formType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, formType: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
              >
                {FORM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Requires Signatures */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="requiresSignatures"
                checked={form.requiresSignatures}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    requiresSignatures: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500/50"
              />
              <label
                htmlFor="requiresSignatures"
                className="text-sm text-slate-300"
              >
                Requires client signature
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href="/dashboard/form-templates"
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 rounded-xl text-slate-300 font-medium text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !form.name.trim()}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {isSubmitting ? "Creating…" : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
