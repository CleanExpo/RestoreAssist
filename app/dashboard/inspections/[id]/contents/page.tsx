"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  Flag,
} from "lucide-react";
import type {
  ContentsManifestDraft,
  ContentsManifestItem,
} from "@/app/api/inspections/[id]/contents-manifest/route";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditableItem extends ContentsManifestItem {
  edited: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function conditionBadge(condition: ContentsManifestItem["condition"]) {
  const map: Record<
    typeof condition,
    {
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
    }
  > = {
    good: { label: "Good", variant: "secondary" },
    fair: { label: "Fair", variant: "outline" },
    poor: { label: "Poor", variant: "default" },
    destroyed: { label: "Destroyed", variant: "destructive" },
  };
  const { label, variant } = map[condition];
  return <Badge variant={variant}>{label}</Badge>;
}

function restorableBadge(status: ContentsManifestItem["restorableStatus"]) {
  const map: Record<typeof status, { label: string; className: string }> = {
    restorable: {
      label: "Restorable",
      className: "bg-green-100 text-green-800",
    },
    replace: { label: "Replace", className: "bg-red-100 text-red-800" },
    uncertain: {
      label: "Uncertain",
      className: "bg-yellow-100 text-yellow-800",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
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
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentsManifestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [draft, setDraft] = useState<ContentsManifestDraft | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspections/${id}/contents-manifest`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) {
        setDraft(json.data);
        setItems(
          (json.data.items as ContentsManifestItem[]).map((i) => ({
            ...i,
            edited: false,
          })),
        );
      }
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
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Generation failed");
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
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(
    index: number,
    field: keyof ContentsManifestItem,
    value: unknown,
  ) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value, edited: true } : item,
      ),
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Contents Manifest</h1>
            <p className="text-sm text-muted-foreground">
              AI-assisted draft — review all items before use in claims
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {draft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(items, id)}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => generateDraft(false)}
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
          {!draft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateDraft(true)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Detailed (Premium)
            </Button>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      {draft && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{draft.disclaimer}</span>
        </div>
      )}

      {/* Stats */}
      {draft && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Items Identified
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold">{items.length}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Flagged for Review
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold text-amber-600">
                {draft.flaggedForReviewCount}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <span className="text-2xl font-bold text-red-500">
                {draft.lowConfidenceCount}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Images Analysed
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{draft.imageCount}</span>
                <span className="text-xs text-muted-foreground">
                  via {draft.provider === "gemma" ? "RestoreAssist AI" : "BYOK"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!draft && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 text-muted-foreground">
          <Sparkles className="w-12 h-12 opacity-30" />
          <div>
            <p className="text-base font-medium">No manifest generated yet</p>
            <p className="text-sm mt-1">
              Capture <strong>AFFECTED_CONTENTS</strong> evidence photos first,
              then click Generate Draft.
            </p>
          </div>
        </div>
      )}

      {/* Editable manifest table */}
      {draft && items.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16">Count</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Value (AUD)</TableHead>
                <TableHead>Room</TableHead>
                <TableHead className="w-20">Conf.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={
                    item.flagForReview
                      ? "bg-amber-50/50"
                      : item.edited
                        ? "bg-blue-50/30"
                        : ""
                  }
                >
                  <TableCell>
                    {item.flagForReview && (
                      <Flag
                        className="w-3.5 h-3.5 text-amber-500"
                        title="Flagged for review"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.category}
                      onChange={(e) =>
                        updateItem(index, "category", e.target.value)
                      }
                      className="h-7 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                      className="h-7 text-sm"
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
                      className="h-7 text-sm w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.condition}
                      onValueChange={(v) => updateItem(index, "condition", v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-24">
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
                    {restorableBadge(item.restorableStatus)}
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
                      className="h-7 text-sm w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {item.roomLocation ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-sm font-medium ${item.confidence < 70 ? "text-red-500" : "text-muted-foreground"}`}
                    >
                      {item.confidence}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
