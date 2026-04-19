"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  FileText,
  Calendar,
  Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface ScopeTemplateItem {
  id: string;
  description: string;
  unit?: string;
  quantity?: number;
  iicrcRef?: string;
}

interface ScopeTemplate {
  id: string;
  name: string;
  description?: string;
  claimType?: string;
  createdAt: string;
  items?: ScopeTemplateItem[];
  _count?: { items: number };
}

const CLAIM_TYPES = [
  { value: "water_damage", label: "Water Damage" },
  { value: "fire_damage", label: "Fire Damage" },
  { value: "mould_remediation", label: "Mould Remediation" },
  { value: "storm_damage", label: "Storm Damage" },
  { value: "general", label: "General" },
];

const CLAIM_COLORS: Record<string, string> = {
  water_damage:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  fire_damage:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  mould_remediation:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  storm_damage:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  general: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

function claimTypeLabel(value: string): string {
  return CLAIM_TYPES.find((ct) => ct.value === value)?.label ?? value;
}

const EMPTY_FORM = { name: "", description: "", claimType: "" };

// Skeleton card
function SkeletonCard() {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 space-y-3 animate-pulse",
        "bg-white dark:bg-slate-900 border-neutral-200 dark:border-slate-700",
      )}
    >
      <div className="h-4 w-2/3 rounded bg-neutral-200 dark:bg-slate-700" />
      <div className="h-3 w-1/4 rounded bg-neutral-100 dark:bg-slate-800" />
      <div className="h-3 w-full rounded bg-neutral-100 dark:bg-slate-800" />
      <div className="h-3 w-4/5 rounded bg-neutral-100 dark:bg-slate-800" />
      <div className="flex gap-2 pt-2">
        <div className="h-8 w-16 rounded bg-neutral-100 dark:bg-slate-800" />
        <div className="h-8 w-16 rounded bg-neutral-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

export default function ScopeTemplatesPage() {
  const [templates, setTemplates] = useState<ScopeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [claimTypeFilter, setClaimTypeFilter] = useState("");

  // Create / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScopeTemplate | null>(
    null,
  );
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingTemplate, setDeletingTemplate] =
    useState<ScopeTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      setLoading(true);
      const res = await fetch("/api/scope-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      } else {
        toast.error("Failed to load scope templates");
      }
    } catch {
      toast.error("Failed to load scope templates");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = claimTypeFilter
        ? t.claimType === claimTypeFilter
        : true;
      return matchesSearch && matchesType;
    });
  }, [templates, searchTerm, claimTypeFilter]);

  function openCreate() {
    setEditingTemplate(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(template: ScopeTemplate) {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description ?? "",
      claimType: template.claimType ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Template name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        claimType: formData.claimType || undefined,
      };

      const res = editingTemplate
        ? await fetch(`/api/scope-templates/${editingTemplate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/scope-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        toast.success(
          editingTemplate ? "Template updated" : "Template created",
        );
        closeForm();
        await fetchTemplates();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save template");
      }
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingTemplate) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/scope-templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Template deleted");
        setDeletingTemplate(null);
        await fetchTemplates();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to delete template");
      }
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className={cn(
              "text-2xl font-bold",
              "text-neutral-900 dark:text-slate-50",
            )}
          >
            Scope Templates
          </h1>
          <p
            className={cn(
              "text-sm mt-1",
              "text-neutral-500 dark:text-slate-400",
            )}
          >
            Reusable scope-of-works templates to speed up job scoping
          </p>
        </div>
        <button
          onClick={openCreate}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-gradient-to-r from-blue-600 to-cyan-600 text-white",
            "hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02]",
            "active:scale-[0.98]",
          )}
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none",
              "text-neutral-400 dark:text-slate-500",
            )}
          />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
              "bg-neutral-50 dark:bg-slate-800",
              "border border-neutral-300 dark:border-slate-700",
              "text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-500",
              "focus:border-cyan-500",
            )}
          />
        </div>
        <select
          value={claimTypeFilter}
          onChange={(e) => setClaimTypeFilter(e.target.value)}
          className={cn(
            "px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
            "bg-neutral-50 dark:bg-slate-800",
            "border border-neutral-300 dark:border-slate-700",
            "text-neutral-900 dark:text-white",
            "focus:border-cyan-500",
          )}
        >
          <option value="">All types</option>
          {CLAIM_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className={cn(
            "rounded-xl border p-12 text-center",
            "bg-white dark:bg-slate-900 border-neutral-200 dark:border-slate-700",
          )}
        >
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <FileText size={24} className="text-blue-500 dark:text-blue-400" />
          </div>
          <h3
            className={cn(
              "text-base font-semibold mb-1",
              "text-neutral-900 dark:text-slate-50",
            )}
          >
            {searchTerm || claimTypeFilter
              ? "No templates match your filters"
              : "No scope templates yet"}
          </h3>
          <p
            className={cn(
              "text-sm max-w-xs mx-auto",
              "text-neutral-500 dark:text-slate-400",
            )}
          >
            {searchTerm || claimTypeFilter
              ? "Try adjusting your search or filter."
              : "Create templates to speed up scope generation for new jobs."}
          </p>
          {!searchTerm && !claimTypeFilter && (
            <button
              onClick={openCreate}
              className={cn(
                "mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                "bg-gradient-to-r from-blue-600 to-cyan-600 text-white",
                "hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:scale-[1.02]",
              )}
            >
              <Plus size={16} />
              Create First Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => openEdit(template)}
              onDelete={() => setDeletingTemplate(template)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit slide-in panel */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeForm} />
          <div
            className={cn(
              "fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col shadow-2xl",
              "bg-white dark:bg-slate-900",
              "border-l border-neutral-200 dark:border-slate-700",
            )}
          >
            {/* Panel header */}
            <div
              className={cn(
                "flex items-center justify-between px-6 py-4 border-b flex-shrink-0",
                "border-neutral-200 dark:border-slate-700",
              )}
            >
              <h2
                className={cn(
                  "text-lg font-semibold",
                  "text-neutral-900 dark:text-slate-50",
                )}
              >
                {editingTemplate ? "Edit Template" : "New Template"}
              </h2>
              <button
                onClick={closeForm}
                className={cn(
                  "p-1 rounded-lg transition-colors",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-5"
            >
              {/* Name */}
              <div className="space-y-1">
                <label
                  className={cn(
                    "text-sm font-medium",
                    "text-neutral-700 dark:text-slate-300",
                  )}
                >
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Category 3 Water Damage — Residential"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, name: e.target.value }))
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
                    "bg-neutral-50 dark:bg-slate-800",
                    "border border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-500",
                    "focus:border-cyan-500",
                  )}
                />
              </div>

              {/* Claim Type */}
              <div className="space-y-1">
                <label
                  className={cn(
                    "text-sm font-medium",
                    "text-neutral-700 dark:text-slate-300",
                  )}
                >
                  Claim Type
                </label>
                <select
                  value={formData.claimType}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, claimType: e.target.value }))
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
                    "bg-neutral-50 dark:bg-slate-800",
                    "border border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-white",
                    "focus:border-cyan-500",
                  )}
                >
                  <option value="">Select type (optional)</option>
                  {CLAIM_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label
                  className={cn(
                    "text-sm font-medium",
                    "text-neutral-700 dark:text-slate-300",
                  )}
                >
                  Description
                </label>
                <textarea
                  rows={4}
                  placeholder="Brief description of when to use this template..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, description: e.target.value }))
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none",
                    "bg-neutral-50 dark:bg-slate-800",
                    "border border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-500",
                    "focus:border-cyan-500",
                  )}
                />
              </div>
            </form>

            {/* Footer buttons */}
            <div
              className={cn(
                "px-6 py-4 border-t flex gap-3 flex-shrink-0",
                "border-neutral-200 dark:border-slate-700",
              )}
            >
              <button
                type="button"
                onClick={closeForm}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  "border border-neutral-300 dark:border-slate-600",
                  "text-neutral-700 dark:text-slate-300",
                  "hover:bg-neutral-50 dark:hover:bg-slate-800",
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit as any}
                disabled={saving}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-gradient-to-r from-blue-600 to-cyan-600 text-white",
                  "hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:scale-[1.01]",
                  "disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100",
                )}
              >
                {saving
                  ? "Saving..."
                  : editingTemplate
                    ? "Save Changes"
                    : "Create Template"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deletingTemplate && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className={cn(
                "w-full max-w-sm rounded-xl shadow-2xl p-6 space-y-4",
                "bg-white dark:bg-slate-900",
                "border border-neutral-200 dark:border-slate-700",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <Trash2
                    size={20}
                    className="text-red-600 dark:text-red-400"
                  />
                </div>
                <div>
                  <h3
                    className={cn(
                      "text-base font-semibold",
                      "text-neutral-900 dark:text-slate-50",
                    )}
                  >
                    Delete Template
                  </h3>
                  <p
                    className={cn(
                      "text-sm",
                      "text-neutral-500 dark:text-slate-400",
                    )}
                  >
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              <p
                className={cn(
                  "text-sm",
                  "text-neutral-700 dark:text-slate-300",
                )}
              >
                Are you sure you want to delete{" "}
                <span className="font-semibold">"{deletingTemplate.name}"</span>
                ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingTemplate(null)}
                  disabled={deleting}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    "border border-neutral-300 dark:border-slate-600",
                    "text-neutral-700 dark:text-slate-300",
                    "hover:bg-neutral-50 dark:hover:bg-slate-800",
                    "disabled:opacity-60",
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    "bg-red-500 text-white",
                    "hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/30 hover:scale-[1.01]",
                    "disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100",
                  )}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Template card component ────────────────────────────────────────────────

interface TemplateCardProps {
  template: ScopeTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const itemCount = template._count?.items ?? template.items?.length ?? 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 flex flex-col gap-3 transition-all duration-200 group",
        "bg-white dark:bg-slate-900",
        "border-neutral-200 dark:border-slate-700",
        "hover:shadow-md hover:border-neutral-300 dark:hover:border-slate-600",
      )}
    >
      {/* Name + badge */}
      <div className="flex flex-wrap items-start gap-2">
        <h3
          className={cn(
            "text-sm font-semibold flex-1 leading-snug",
            "text-neutral-900 dark:text-slate-50",
          )}
        >
          {template.name}
        </h3>
        {template.claimType && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
              CLAIM_COLORS[template.claimType] ?? CLAIM_COLORS.general,
            )}
          >
            {claimTypeLabel(template.claimType)}
          </span>
        )}
      </div>

      {/* Description */}
      {template.description && (
        <p
          className={cn(
            "text-sm leading-relaxed line-clamp-2",
            "text-neutral-500 dark:text-slate-400",
          )}
        >
          {template.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs">
        <span
          className={cn(
            "flex items-center gap-1",
            "text-neutral-400 dark:text-slate-500",
          )}
        >
          <Layers size={12} />
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        <span
          className={cn(
            "flex items-center gap-1",
            "text-neutral-400 dark:text-slate-500",
          )}
        >
          <Calendar size={12} />
          {new Date(template.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={onEdit}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            "border border-neutral-300 dark:border-slate-600",
            "text-neutral-700 dark:text-slate-300",
            "hover:bg-neutral-50 dark:hover:bg-slate-800 hover:border-neutral-400 dark:hover:border-slate-500",
          )}
        >
          <Edit size={12} />
          Edit
        </button>
        <button
          onClick={onDelete}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            "border border-red-200 dark:border-red-900/50",
            "text-red-600 dark:text-red-400",
            "hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-800",
          )}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}
