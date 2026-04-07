"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  PlayCircle,
  Loader2,
  X,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormType =
  | "WORK_ORDER"
  | "AUTHORITY_TO_COMMENCE"
  | "JSA"
  | "SDS"
  | "SWIMS"
  | "SITE_INDUCTION"
  | "CUSTOM";

const FORM_TYPES: FormType[] = [
  "WORK_ORDER",
  "AUTHORITY_TO_COMMENCE",
  "JSA",
  "SDS",
  "SWIMS",
  "SITE_INDUCTION",
  "CUSTOM",
];

const FORM_CATEGORIES = [
  "SAFETY",
  "COMPLIANCE",
  "CLIENT_INTAKE",
  "JOB_DOCUMENTATION",
  "INSURANCE",
  "QUALITY_CONTROL",
  "CUSTOM",
] as const;

interface FormTemplate {
  id: string;
  name: string;
  formType: FormType;
  category: string;
  description?: string | null;
  isActive?: boolean;
  formSchema?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<FormType, string> = {
  WORK_ORDER: "Work Order",
  AUTHORITY_TO_COMMENCE: "Authority to Commence",
  JSA: "JSA",
  SDS: "SDS",
  SWIMS: "SWIMS",
  SITE_INDUCTION: "Site Induction",
  CUSTOM: "Custom",
};

const FORM_TYPE_COLOURS: Record<FormType, string> = {
  WORK_ORDER:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  AUTHORITY_TO_COMMENCE:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  JSA: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  SDS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  SWIMS:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  SITE_INDUCTION:
    "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  CUSTOM:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
};

function countQuestions(formSchema: string | null | undefined): number | null {
  if (!formSchema) return null;
  try {
    const parsed = JSON.parse(formSchema);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed?.questions && Array.isArray(parsed.questions))
      return parsed.questions.length;
    if (parsed?.fields && Array.isArray(parsed.fields))
      return parsed.fields.length;
    return null;
  } catch {
    return null;
  }
}

// ─── Create Template Form ─────────────────────────────────────────────────────

interface CreateFormState {
  name: string;
  formType: FormType | "";
  category: string;
  description: string;
}

const EMPTY_FORM: CreateFormState = {
  name: "",
  formType: "",
  category: "",
  description: "",
};

interface CreateTemplateFormProps {
  onCreated: (template: FormTemplate) => void;
  onCancel: () => void;
}

function CreateTemplateForm({ onCreated, onCancel }: CreateTemplateFormProps) {
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.formType) {
      setError("Form type is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/form-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          formType: form.formType,
          category: form.category || "CUSTOM",
          description: form.description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      onCreated(data.template ?? data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create template.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          New Template
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name" className="text-xs">
            Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="tpl-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Water Damage Work Order"
            className="h-8 text-sm"
          />
        </div>

        {/* Form Type */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-type" className="text-xs">
            Form Type <span className="text-red-500">*</span>
          </Label>
          <Select
            value={form.formType}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, formType: v as FormType }))
            }
          >
            <SelectTrigger id="tpl-type" className="h-8 text-sm">
              <SelectValue placeholder="Select type…" />
            </SelectTrigger>
            <SelectContent>
              {FORM_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft} className="text-sm">
                  {FORM_TYPE_LABELS[ft]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-category" className="text-xs">
            Category
          </Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
          >
            <SelectTrigger id="tpl-category" className="h-8 text-sm">
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              {FORM_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-sm">
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="tpl-desc" className="text-xs">
          Description
        </Label>
        <Textarea
          id="tpl-desc"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Optional description…"
          className="text-sm resize-none h-20"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save Template
        </Button>
      </div>
    </form>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

interface DeleteConfirmProps {
  templateName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteConfirm({
  templateName,
  onConfirm,
  onCancel,
  deleting,
}: DeleteConfirmProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-600 dark:text-slate-400">
        Delete &ldquo;{templateName}&rdquo;?
      </span>
      <Button
        size="sm"
        variant="destructive"
        className="h-6 text-xs px-2"
        onClick={onConfirm}
        disabled={deleting}
      >
        {deleting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        onClick={onCancel}
        disabled={deleting}
      >
        Cancel
      </Button>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function TemplateSkeleton() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FormTemplatesPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FormType | "ALL">("ALL");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Per-row state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/form-templates");
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        if (!cancelled) setTemplates(data.templates ?? []);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load templates.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        search.trim() === "" ||
        t.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesType = typeFilter === "ALL" || t.formType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [templates, search, typeFilter]);

  // Collect types actually present for the filter tabs
  const presentTypes = useMemo(() => {
    const set = new Set(templates.map((t) => t.formType));
    return FORM_TYPES.filter((ft) => set.has(ft));
  }, [templates]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleToggleActive(template: FormTemplate) {
    setTogglingId(template.id);
    const optimistic = templates.map((t) =>
      t.id === template.id ? { ...t, isActive: !t.isActive } : t,
    );
    setTemplates(optimistic);
    try {
      const res = await fetch(`/api/form-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      if (!res.ok) throw new Error("Toggle failed");
    } catch {
      // Revert on failure
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, isActive: template.isActive } : t,
        ),
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/form-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Keep row on failure, clear confirm state
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function handleCreated(template: FormTemplate) {
    setTemplates((prev) => [template, ...prev]);
    setShowCreateForm(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Form Templates
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Manage and configure your inspection form templates.
            </p>
          </div>
          {!loading && (
            <Badge
              variant="secondary"
              className="h-6 text-xs tabular-nums ml-1"
            >
              {templates.length}
            </Badge>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => setShowCreateForm((v) => !v)}
          variant={showCreateForm ? "outline" : "default"}
        >
          {showCreateForm ? (
            <>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Template
            </>
          )}
        </Button>
      </div>

      <Separator />

      {/* Create form (inline) */}
      {showCreateForm && (
        <CreateTemplateForm
          onCreated={handleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Form type tabs — only shown if more than one type exists */}
        {presentTypes.length > 1 && (
          <Tabs
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as FormType | "ALL")}
            className="overflow-x-auto"
          >
            <TabsList className="h-9">
              <TabsTrigger value="ALL" className="text-xs px-3">
                All
              </TabsTrigger>
              {presentTypes.map((ft) => (
                <TabsTrigger key={ft} value={ft} className="text-xs px-3">
                  {FORM_TYPE_LABELS[ft]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead className="text-xs font-semibold">Name</TableHead>
              <TableHead className="text-xs font-semibold">Type</TableHead>
              <TableHead className="text-xs font-semibold">Category</TableHead>
              <TableHead className="text-xs font-semibold text-center">
                Questions
              </TableHead>
              <TableHead className="text-xs font-semibold text-center">
                Active
              </TableHead>
              <TableHead className="text-xs font-semibold text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Loading skeletons */}
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TemplateSkeleton key={i} />
              ))}

            {/* Empty state */}
            {!loading && filteredTemplates.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-16 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    {templates.length === 0 ? (
                      <span>
                        No form templates yet. Create a custom template for your
                        inspection forms.
                      </span>
                    ) : (
                      <span>No templates match your current filters.</span>
                    )}
                    {templates.length === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCreateForm(true)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Create your first template
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Rows */}
            {!loading &&
              filteredTemplates.map((template) => {
                const qCount = countQuestions(template.formSchema);
                const isDeleting = deletingId === template.id;
                const isConfirming = confirmDeleteId === template.id;
                const isToggling = togglingId === template.id;

                return (
                  <TableRow
                    key={template.id}
                    className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Name */}
                    <TableCell className="py-3">
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-white">
                          {template.name}
                        </p>
                        {template.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 max-w-xs">
                            {template.description}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Type */}
                    <TableCell className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FORM_TYPE_COLOURS[template.formType]}`}
                      >
                        {FORM_TYPE_LABELS[template.formType]}
                      </span>
                    </TableCell>

                    {/* Category */}
                    <TableCell className="py-3">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {template.category
                          ? template.category.replace(/_/g, " ")
                          : "—"}
                      </span>
                    </TableCell>

                    {/* Question count */}
                    <TableCell className="py-3 text-center">
                      <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        {qCount !== null ? qCount : "—"}
                      </span>
                    </TableCell>

                    {/* Active toggle */}
                    <TableCell className="py-3 text-center">
                      <Switch
                        checked={template.isActive ?? true}
                        onCheckedChange={() => handleToggleActive(template)}
                        disabled={isToggling}
                        aria-label={`Toggle ${template.name} active state`}
                        className="data-[state=checked]:bg-cyan-500"
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3">
                      {isConfirming ? (
                        <DeleteConfirm
                          templateName={template.name}
                          onConfirm={() => handleDelete(template.id)}
                          onCancel={() => setConfirmDeleteId(null)}
                          deleting={isDeleting}
                        />
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Use Template */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5"
                            asChild
                          >
                            <Link
                              href={`/dashboard/forms/interview?formTemplateId=${template.id}`}
                            >
                              <PlayCircle className="mr-1 h-3.5 w-3.5" />
                              Use
                            </Link>
                          </Button>

                          {/* Edit */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            asChild
                          >
                            <Link
                              href={`/dashboard/form-templates/${template.id}`}
                              aria-label={`Edit ${template.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>

                          {/* Delete */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => setConfirmDeleteId(template.id)}
                            aria-label={`Delete ${template.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
