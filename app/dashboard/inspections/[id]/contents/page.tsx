"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Download,
  Flag,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  ContentsManifestDraft,
  ContentsManifestItem,
} from "@/app/api/inspections/[id]/contents-manifest/route";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditableItem extends ContentsManifestItem {
  edited: boolean;
}

interface ManifestMeta {
  inspectionNumber: string;
  propertyAddress: string;
  affectedContentsCount: number;
  photoCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const err = (json as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message) || fallback;
  }
  return fallback;
}

function exportToCsv(items: EditableItem[], inspectionId: string) {
  const headers = [
    "Category",
    "Description",
    "Count",
    "Condition",
    "Restorable Status",
    "Estimated Value (AUD)",
    "Room Location",
    "Confidence %",
    "Flag for Review",
    "AI Note",
  ];
  const rows = items.map((i) => [
    i.category,
    i.description,
    i.count,
    i.condition,
    i.restorableStatus,
    i.estimatedValue ?? "",
    i.roomLocation ?? "",
    i.confidence,
    i.flagForReview ? "Yes" : "No",
    i.aiNote ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contents-manifest-${inspectionId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exported");
}

function newBlankItem(): EditableItem {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: "Furniture",
    description: "",
    count: 1,
    condition: "fair",
    restorableStatus: "uncertain",
    confidence: 100,
    flagForReview: true,
    roomLocation: "",
    edited: true,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentsManifestPage() {
  const { id } = useParams<{ id: string }>() ?? { id: "" };
  const router = useRouter();

  const [draft, setDraft] = useState<ContentsManifestDraft | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [meta, setMeta] = useState<ManifestMeta | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = useMemo(() => items.some((i) => i.edited), [items]);
  const totalValue = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + (Number(i.estimatedValue) || 0) * (i.count || 1),
        0,
      ),
    [items],
  );
  const flaggedCount = useMemo(
    () => items.filter((i) => i.flagForReview).length,
    [items],
  );
  const lowConfidenceCount = useMemo(
    () => items.filter((i) => i.confidence < 70).length,
    [items],
  );
  const photoReadyCount =
    (meta?.affectedContentsCount ?? 0) > 0
      ? meta!.affectedContentsCount
      : (meta?.photoCount ?? 0);

  const loadDraft = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch(`/api/inspections/${id}/contents-manifest`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(apiMessage(json, "Failed to load contents manifest"));
        return;
      }
      if (json.meta) setMeta(json.meta as ManifestMeta);
      if (json.data) {
        setDraft(json.data);
        setItems(
          (json.data.items as ContentsManifestItem[]).map((i) => ({
            ...i,
            edited: false,
          })),
        );
      } else {
        setDraft(null);
        setItems([]);
      }
    } catch {
      setLoadError("Failed to load contents manifest");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  async function generateDraft(detailed = false) {
    setGenerating(true);
    try {
      const res = await fetch(`/api/inspections/${id}/contents-manifest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detailed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiMessage(json, "Generation failed"));
        return;
      }
      setDraft(json.data);
      setItems(
        (json.data.items as ContentsManifestItem[]).map((i) => ({
          ...i,
          edited: false,
        })),
      );
      toast.success(
        `Draft generated — ${json.data.items.length} items identified`,
      );
    } catch {
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch(`/api/inspections/${id}/contents-manifest`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ edited: _edited, ...item }) => item),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiMessage(json, "Failed to save manifest"));
        return;
      }
      setDraft(json.data);
      setItems(
        (json.data.items as ContentsManifestItem[]).map((i) => ({
          ...i,
          edited: false,
        })),
      );
      toast.success("Contents manifest saved");
    } catch {
      toast.error("Failed to save manifest");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(
    index: number,
    field: keyof ContentsManifestItem,
    value: unknown,
  ) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value, edited: true };
        if (field === "confidence" || field === "estimatedValue") {
          const confidence = Number(next.confidence) || 0;
          const estimatedValue = Number(next.estimatedValue) || 0;
          next.flagForReview = confidence < 70 || estimatedValue > 500;
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, newBlankItem()]);
    if (!draft) {
      setDraft({
        inspectionId: id,
        generatedAt: new Date().toISOString(),
        model: "manual",
        provider: "gemma",
        imageCount: 0,
        items: [],
        lowConfidenceCount: 0,
        flaggedForReviewCount: 0,
        disclaimer:
          "This manifest requires review before use in claims. All values are estimates only.",
      });
    }
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] w-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-6">
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void loadDraft();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/inspections/${id}`)}
            aria-label="Back to inspection"
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-600 shrink-0" />
              Contents Manifest
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI-assisted draft — review all items before use in claims
            </p>
            {meta && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                <span className="font-medium text-foreground/80">
                  {meta.inspectionNumber}
                </span>
                {" · "}
                {meta.propertyAddress}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-4 h-4 mr-2" />
            Add item
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/inspections/${id}/contents-manifest`)
            }
          >
            <Sparkles className="w-4 h-4 mr-2" />
            AI from Photos
          </Button>
          {(draft || items.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(items, id)}
              disabled={items.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveDraft()}
            disabled={saving || (!dirty && !draft) || items.length === 0}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {dirty ? "Save changes" : "Save"}
          </Button>
          <Button
            size="sm"
            onClick={() => void generateDraft(false)}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : draft ? (
              <RefreshCw className="w-4 h-4 mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {draft ? "Regenerate" : "Generate Draft"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generateDraft(true)}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Detailed (Premium)
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      {draft && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning-subtle border border-warning-subtle-foreground/30 text-warning-subtle-foreground text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{draft.disclaimer}</span>
        </div>
      )}

      {/* Stats */}
      {(draft || items.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Items
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold">{items.length}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Est. total (AUD)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold">
                $
                {totalValue.toLocaleString("en-AU", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Flagged
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold text-amber-600">
                {flaggedCount}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold text-destructive">
                {lowConfidenceCount}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Images analysed
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">
                  {draft?.imageCount ?? 0}
                </span>
                {draft && (
                  <span className="text-xs text-muted-foreground">
                    via{" "}
                    {draft.provider === "gemma" ? "RestoreAssist AI" : "BYOK"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!draft && items.length === 0 && (
        <div className="w-full rounded-xl border border-dashed border-neutral-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-6 py-14 text-center">
          <Sparkles className="w-12 h-12 opacity-30 mx-auto mb-4" />
          <p className="text-base font-medium text-foreground">
            No manifest generated yet
          </p>
          <p className="text-sm mt-2 text-muted-foreground max-w-xl mx-auto">
            Upload inspection photos (or capture{" "}
            <strong>Affected Contents</strong> evidence), then generate a draft.
            You can also add items manually and save.
          </p>
          <div className="mt-3 text-xs text-muted-foreground">
            {photoReadyCount > 0 ? (
              <Badge variant="secondary">
                {photoReadyCount} photo
                {photoReadyCount === 1 ? "" : "s"} ready
              </Badge>
            ) : (
              <span>No photos on this inspection yet</span>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={() => void generateDraft(false)}
              disabled={generating || photoReadyCount === 0}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void generateDraft(true)}
              disabled={generating || photoReadyCount === 0}
            >
              Detailed (Premium)
            </Button>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-2" />
              Add item manually
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/inspections/${id}/photos`}>
                <Camera className="w-4 h-4 mr-2" />
                Open Photos
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Editable manifest table */}
      {items.length > 0 && (
        <div className="w-full border rounded-lg overflow-x-auto bg-white dark:bg-slate-900/40">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-36">Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">Count</TableHead>
                <TableHead className="w-28">Condition</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-32">Value (AUD)</TableHead>
                <TableHead className="w-36">Room</TableHead>
                <TableHead className="w-20">Conf.</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={cn(
                    item.flagForReview && "bg-amber-50/50 dark:bg-amber-950/20",
                    item.edited && "bg-sky-50/40 dark:bg-sky-950/20",
                  )}
                >
                  <TableCell>
                    <button
                      type="button"
                      title={
                        item.flagForReview
                          ? "Clear review flag"
                          : "Flag for review"
                      }
                      onClick={() =>
                        updateItem(index, "flagForReview", !item.flagForReview)
                      }
                      className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Flag
                        className={cn(
                          "w-3.5 h-3.5",
                          item.flagForReview
                            ? "text-amber-500 fill-amber-500/20"
                            : "text-neutral-300",
                        )}
                        aria-label={
                          item.flagForReview
                            ? "Flagged for review"
                            : "Not flagged"
                        }
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.category}
                      onChange={(e) =>
                        updateItem(index, "category", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                      placeholder="Item description"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={item.count}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "count",
                          parseInt(e.target.value, 10) || 1,
                        )
                      }
                      className="h-8 text-sm w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.condition}
                      onValueChange={(v) => updateItem(index, "condition", v)}
                    >
                      <SelectTrigger className="h-8 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                        <SelectItem value="destroyed">Destroyed</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.restorableStatus}
                      onValueChange={(v) =>
                        updateItem(index, "restorableStatus", v)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restorable">Restorable</SelectItem>
                        <SelectItem value="replace">Replace</SelectItem>
                        <SelectItem value="uncertain">Uncertain</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={item.estimatedValue ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateItem(
                          index,
                          "estimatedValue",
                          e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        )
                      }
                      className="h-8 text-sm w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.roomLocation ?? ""}
                      onChange={(e) =>
                        updateItem(index, "roomLocation", e.target.value)
                      }
                      placeholder="Room"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={item.confidence}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "confidence",
                          Math.max(
                            0,
                            Math.min(100, parseInt(e.target.value, 10) || 0),
                          ),
                        )
                      }
                      className={cn(
                        "h-8 text-sm w-16",
                        item.confidence < 70 && "text-destructive",
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive/80 hover:text-destructive"
                      onClick={() => removeItem(index)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-4 h-4 mr-2" />
            Add item
          </Button>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
            <Button
              size="sm"
              onClick={() => void saveDraft()}
              disabled={saving || !dirty}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      )}

      {draft && (
        <p className="text-xs text-muted-foreground text-right">
          Generated {new Date(draft.generatedAt).toLocaleString("en-AU")} ·{" "}
          {draft.model}
        </p>
      )}
    </div>
  );
}
