"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  createAttemptKey,
  settleCreateAttempt,
  type CreateAttempt,
} from "@/lib/form-templates/create-attempt-key";
import type { FormCategory, FormType } from "@prisma/client";

// RA-7957: these must be the schema's FormType and FormCategory values; the
// create route rejects anything else.
const FORM_TYPES = [
  { value: "WORK_ORDER", label: "Work Order" },
  { value: "AUTHORITY_TO_COMMENCE", label: "Authority to Commence" },
  { value: "JSA", label: "JSA" },
  { value: "SDS", label: "SDS" },
  { value: "SWIMS", label: "SWIMS" },
  { value: "SITE_INDUCTION", label: "Site Induction" },
  { value: "CUSTOM", label: "Custom" },
] satisfies { value: FormType; label: string }[];

const CATEGORIES = [
  { value: "SAFETY", label: "Safety" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "CLIENT_INTAKE", label: "Client Intake" },
  { value: "JOB_DOCUMENTATION", label: "Job Documentation" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "QUALITY_CONTROL", label: "Quality Control" },
  { value: "CUSTOM", label: "Custom" },
] satisfies { value: FormCategory; label: string }[];

export default function NewFormTemplatePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createAttempt = useRef<CreateAttempt | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    formType: "CUSTOM",
    category: "CUSTOM",
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
      const body = JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        formType: form.formType,
        category: form.category,
        requiresSignatures: form.requiresSignatures,
        formSchema: JSON.stringify({ sections: [], fields: [] }),
        status: "DRAFT",
      });
      // RA-8543: one key per attempt, reused if this attempt is retried.
      const response = await fetch("/api/form-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createAttemptKey(createAttempt, body),
        },
        body,
      });
      settleCreateAttempt(createAttempt, response.status);

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        throw new Error(apiErrorMessage(data) || "Failed to create template");
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
    <div className="min-h-screen bg-white dark:bg-slate-950 text-brand-navy dark:text-white p-6">
      <div className="max-w-9xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/forms/templates"
            className="p-2 hover:bg-brand-cream dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-brand-slate dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brand-navy dark:text-white">New Form Template</h1>
            <p className="text-brand-slate dark:text-slate-400 text-sm mt-0.5">
              Create a reusable template for inspections and reports
            </p>
          </div>
        </div>

        {/* Form */}
        <form method="post" onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-slate-800/50 border border-brand-mist dark:border-slate-700/50 rounded-2xl p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-brand-slate dark:text-slate-300 mb-2">
                Template Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Water Damage Initial Assessment"
                required
                className="w-full px-4 py-2.5 bg-brand-cream dark:bg-slate-700/50 border border-slate-600/50 rounded-xl text-brand-navy dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-harbour-500/50 focus:border-brand-harbour-500/50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-brand-slate dark:text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="What is this template used for?"
                rows={3}
                className="w-full px-4 py-2.5 bg-brand-cream dark:bg-slate-700/50 border border-slate-600/50 rounded-xl text-brand-navy dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-harbour-500/50 focus:border-brand-harbour-500/50 resize-none"
              />
            </div>

            {/* Form Type */}
            <div>
              <label className="block text-sm font-medium text-brand-slate dark:text-slate-300 mb-2">
                Form Type
              </label>
              <select
                value={form.formType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, formType: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-brand-cream dark:bg-slate-700/50 border border-slate-600/50 rounded-xl text-brand-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-harbour-500/50 focus:border-brand-harbour-500/50"
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
              <label className="block text-sm font-medium text-brand-slate dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-brand-cream dark:bg-slate-700/50 border border-slate-600/50 rounded-xl text-brand-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-harbour-500/50 focus:border-brand-harbour-500/50"
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
                className="w-4 h-4 rounded border-slate-600 bg-brand-cream dark:bg-slate-700 text-brand-harbour-500 focus:ring-brand-harbour-500/50"
              />
              <label
                htmlFor="requiresSignatures"
                className="text-sm text-brand-slate dark:text-slate-300"
              >
                Requires client signature
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href="/dashboard/forms/templates"
              className="flex-1 py-3 bg-white dark:bg-slate-800 hover:bg-brand-cream dark:hover:bg-slate-700 border border-slate-600/50 rounded-xl text-brand-slate dark:text-slate-300 font-medium text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !form.name.trim()}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-brand-harbour-600 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
