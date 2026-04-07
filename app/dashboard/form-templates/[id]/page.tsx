"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileText,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  order: number;
  questionText: string;
  questionType: string;
  isRequired: boolean;
}

interface FormTemplate {
  id: string;
  name: string;
  description?: string;
  formType: string;
  isDefault: boolean;
  createdAt: string;
  questions: Question[];
}

const TYPE_COLORS: Record<string, string> = {
  TEXT: "bg-slate-100 text-slate-600",
  MULTIPLE_CHOICE: "bg-blue-100 text-blue-600",
  YES_NO: "bg-green-100 text-green-600",
  SCALE: "bg-purple-100 text-purple-600",
  DATE: "bg-amber-100 text-amber-600",
  NUMBER: "bg-orange-100 text-orange-600",
  TEXTAREA: "bg-teal-100 text-teal-600",
  SELECT: "bg-indigo-100 text-indigo-600",
  BOOLEAN: "bg-green-100 text-green-600",
  ARRAY: "bg-pink-100 text-pink-600",
};

const FORM_TYPES = [
  "WORK_ORDER",
  "AUTHORITY_TO_COMMENCE",
  "JSA",
  "SDS",
  "SWIMS",
  "SITE_INDUCTION",
  "CUSTOM",
];

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toUpperCase()] ?? "bg-slate-100 text-slate-600";
}

function formatFormType(type: string): string {
  return type.replace(/_/g, " ");
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded bg-slate-200", className)} />
  );
}

export default function FormTemplateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formType, setFormType] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/form-templates/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          toast.error("Failed to load template");
          return;
        }
        const data = await res.json();
        const t: FormTemplate = data.template ?? data;
        setTemplate(t);
        setName(t.name);
        setDescription(t.description ?? "");
        setFormType(t.formType);
      } catch {
        toast.error("Failed to load template");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleFieldChange<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setIsDirty(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/form-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, formType }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save changes");
        return;
      }
      const data = await res.json();
      const updated = data.template ?? data;
      setTemplate((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name,
              description: updated.description,
              formType: updated.formType,
            }
          : prev,
      );
      setIsDirty(false);
      toast.success("Template saved");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-9 w-64" />
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-10 w-1/2" />
            <SkeletonBlock className="h-10 w-28" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <SkeletonBlock className="h-5 w-36" />
            {[...Array(4)].map((_, i) => (
              <SkeletonBlock key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- 404 state ---
  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="text-xl font-semibold text-slate-800">
            Template not found
          </h1>
          <p className="text-slate-500">
            This form template does not exist or you do not have access to it.
          </p>
          <Link
            href="/dashboard/form-templates"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Form Templates
          </Link>
        </div>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard/form-templates"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Form Templates
        </Link>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 truncate">
              {template.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {formatFormType(template.formType)}
              </span>
              {template.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <CheckCircle className="h-3 w-3" />
                  Default
                </span>
              )}
              <span className="text-xs text-slate-400">
                Created{" "}
                {new Date(template.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <FileText className="h-8 w-8 text-slate-300 flex-shrink-0 mt-1" />
        </div>

        {/* Edit metadata form */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Template Details
            </h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="template-name"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => handleFieldChange(setName, e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Template name"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="template-description"
              >
                Description
              </label>
              <textarea
                id="template-description"
                value={description}
                onChange={(e) =>
                  handleFieldChange(setDescription, e.target.value)
                }
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition resize-none"
                placeholder="Optional description of this template"
              />
            </div>

            {/* Form type */}
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="template-form-type"
              >
                Form Type
              </label>
              <select
                id="template-form-type"
                value={formType}
                onChange={(e) => handleFieldChange(setFormType, e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              >
                {FORM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatFormType(t)}
                  </option>
                ))}
              </select>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition",
                  isDirty && !saving
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed",
                )}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>

        {/* Questions section */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Questions
              <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {template.questions.length}
              </span>
            </h2>
          </div>

          {template.questions.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">
                No questions defined for this template
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Table header */}
              <div className="grid grid-cols-[3rem_1fr_8rem_5rem] gap-3 px-6 py-2.5 bg-slate-50">
                <span className="text-xs font-medium text-slate-500">#</span>
                <span className="text-xs font-medium text-slate-500">
                  Question
                </span>
                <span className="text-xs font-medium text-slate-500">Type</span>
                <span className="text-xs font-medium text-slate-500 text-center">
                  Required
                </span>
              </div>
              {/* Rows */}
              {template.questions.map((q) => (
                <div
                  key={q.id}
                  className="grid grid-cols-[3rem_1fr_8rem_5rem] gap-3 items-center px-6 py-3 hover:bg-slate-50/60 transition-colors"
                >
                  <span className="text-xs font-mono text-slate-400">
                    {q.order}
                  </span>
                  <span
                    className="text-sm text-slate-800 truncate"
                    title={q.questionText}
                  >
                    {q.questionText}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium w-fit",
                      getTypeColor(q.questionType),
                    )}
                  >
                    {q.questionType.replace(/_/g, " ")}
                  </span>
                  <div className="flex justify-center">
                    {q.isRequired ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
