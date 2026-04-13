"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface InvoiceTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateFormData {
  name: string;
  description: string;
  isDefault: boolean;
}

const defaultFormData: TemplateFormData = {
  name: "",
  description: "",
  isDefault: false,
};

export default function InvoiceTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<TemplateFormData>(defaultFormData);
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<InvoiceTemplate | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormData>(defaultFormData);
  const [editing, setEditing] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] =
    useState<InvoiceTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Duplicate loading state
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Set default loading state
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
    }
  }, [status]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      toast.error("Failed to load invoice templates");
    } finally {
      setLoading(false);
    }
  }

  // ---- Create ----
  function openCreateDialog() {
    setCreateForm(defaultFormData);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/invoices/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          isDefault: createForm.isDefault,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create template");
      }
      const data = await res.json();
      // If new template is default, clear old defaults in local state
      let updated = templates;
      if (createForm.isDefault) {
        updated = updated.map((t) => ({ ...t, isDefault: false }));
      }
      setTemplates([data.template, ...updated]);
      setCreateOpen(false);
      toast.success("Template created");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create template",
      );
    } finally {
      setCreating(false);
    }
  }

  // ---- Edit ----
  function openEditDialog(template: InvoiceTemplate) {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      description: template.description ?? "",
      isDefault: template.isDefault,
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editingTemplate) return;
    if (!editForm.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setEditing(true);
    try {
      const res = await fetch(`/api/invoices/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          isDefault: editForm.isDefault,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update template");
      }
      const data = await res.json();
      let updated = templates.map((t) =>
        t.id === editingTemplate.id ? data.template : t,
      );
      // If set as default, clear other defaults
      if (editForm.isDefault) {
        updated = updated.map((t) =>
          t.id === editingTemplate.id ? t : { ...t, isDefault: false },
        );
      }
      setTemplates(updated);
      setEditOpen(false);
      toast.success("Template updated");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update template",
      );
    } finally {
      setEditing(false);
    }
  }

  // ---- Delete ----
  function openDeleteDialog(template: InvoiceTemplate) {
    setDeletingTemplate(template);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deletingTemplate) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/invoices/templates/${deletingTemplate.id}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete template");
      }
      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
      setDeleteOpen(false);
      toast.success("Template deleted");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    } finally {
      setDeleting(false);
    }
  }

  // ---- Duplicate ----
  async function handleDuplicate(template: InvoiceTemplate) {
    setDuplicatingId(template.id);
    try {
      const res = await fetch(
        `/api/invoices/templates/${template.id}/duplicate`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to duplicate template");
      }
      const data = await res.json();
      setTemplates((prev) => [...prev, data.template]);
      toast.success("Template duplicated");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to duplicate template",
      );
    } finally {
      setDuplicatingId(null);
    }
  }

  // ---- Set Default ----
  async function handleSetDefault(template: InvoiceTemplate) {
    setSettingDefaultId(template.id);
    try {
      const res = await fetch(`/api/invoices/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to set default");
      }
      setTemplates((prev) =>
        prev.map((t) => ({
          ...t,
          isDefault: t.id === template.id,
        })),
      );
      toast.success(`"${template.name}" is now the default template`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to set default");
    } finally {
      setSettingDefaultId(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (status === "loading" || loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Invoice Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your invoice layouts, branding, and display settings.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No templates yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first invoice template to get started.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="relative flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base leading-snug truncate">
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <CardDescription className="mt-1 line-clamp-2 text-xs">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                  {template.isDefault && (
                    <Badge className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-600">
                      Default
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-4 flex-1">
                {/* Colour swatches */}
                <div className="flex items-center gap-2">
                  {[
                    template.primaryColor ?? "#0EA5E9",
                    template.secondaryColor ?? "#1E293B",
                    template.accentColor ?? "#10B981",
                  ].map((colour, i) => (
                    <span
                      key={i}
                      className="inline-block h-5 w-5 rounded-full border border-border"
                      style={{ backgroundColor: colour }}
                      title={colour}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">
                    {template.usageCount} use
                    {template.usageCount !== 1 ? "s" : ""}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Created {formatDate(template.createdAt)}
                </p>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(template)}
                    title="Edit template"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicatingId === template.id}
                    title="Duplicate template"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {duplicatingId === template.id ? "Copying…" : "Duplicate"}
                  </Button>
                  {!template.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(template)}
                      disabled={settingDefaultId === template.id}
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      {settingDefaultId === template.id
                        ? "Saving…"
                        : "Set Default"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => openDeleteDialog(template)}
                    title="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Create Dialog ---- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Invoice Template</DialogTitle>
            <DialogDescription>
              Give your template a name and optional description. You can
              customise branding and layout settings afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-name"
                placeholder="e.g. Standard Invoice"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                placeholder="Optional description…"
                rows={3}
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-isDefault"
                checked={createForm.isDefault}
                onCheckedChange={(checked) =>
                  setCreateForm((f) => ({ ...f, isDefault: checked === true }))
                }
              />
              <Label htmlFor="create-isDefault" className="cursor-pointer">
                Set as default template
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Dialog ---- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update the name, description, or default status of this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder="e.g. Standard Invoice"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Optional description…"
                rows={3}
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-isDefault"
                checked={editForm.isDefault}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({ ...f, isDefault: checked === true }))
                }
              />
              <Label htmlFor="edit-isDefault" className="cursor-pointer">
                Set as default template
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editing}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Confirmation ---- */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                &ldquo;{deletingTemplate?.name}&rdquo;
              </span>
              ? This cannot be undone. Templates linked to existing invoices
              cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
