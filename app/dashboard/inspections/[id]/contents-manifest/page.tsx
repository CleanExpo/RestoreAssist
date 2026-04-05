"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Loader2,
  Package,
  Sparkles,
  MapPin,
  Download,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Edit3,
} from "lucide-react";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ManifestItem {
  id: string;
  description: string;
  category: string;
  room: string;
  condition: string;
  restorability: string;
  estimatedValueAud: number;
  quantity: number;
  confidence: number;
  sourcePhotoIndices: number[];
  aiNotes?: string;
  verified: boolean;
  technicianNotes?: string;
}

interface Manifest {
  inspectionId: string;
  items: ManifestItem[];
  photosAnalysed: number;
  totalEstimatedValueAud: number;
  overallConfidence: number;
  model: string;
  tier: string;
  durationMs: number;
  estimatedCostUsd: number;
  generatedAt: string;
  summary?: string;
}

interface InspectionMeta {
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
}

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONDITION_COLORS: Record<string, string> = {
  undamaged:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  lightly_soiled:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  water_damaged:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  smoke_damaged:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  fire_damaged: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  mould_affected:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  contaminated:
    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  structurally_damaged:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  destroyed:
    "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

const CONDITION_LABELS: Record<string, string> = {
  undamaged: "Undamaged",
  lightly_soiled: "Lightly Soiled",
  water_damaged: "Water Damaged",
  smoke_damaged: "Smoke Damaged",
  fire_damaged: "Fire Damaged",
  mould_affected: "Mould Affected",
  contaminated: "Contaminated",
  structurally_damaged: "Struct. Damaged",
  destroyed: "Destroyed",
};

const RESTORABILITY_ICONS: Record<string, { label: string; color: string }> = {
  restorable: {
    label: "Restorable",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  questionable: {
    label: "Questionable",
    color: "text-amber-600 dark:text-amber-400",
  },
  non_restorable: {
    label: "Non-Restorable",
    color: "text-red-600 dark:text-red-400",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  furniture: "Furniture",
  electronics: "Electronics",
  appliances: "Appliances",
  clothing_textiles: "Clothing & Textiles",
  documents_photos: "Documents & Photos",
  kitchenware: "Kitchenware",
  artwork_decor: "Artwork & Decor",
  personal_items: "Personal Items",
  toys_recreation: "Toys & Recreation",
  tools_equipment: "Tools & Equipment",
  musical_instruments: "Musical Instruments",
  sporting_goods: "Sporting Goods",
  jewellery_valuables: "Jewellery & Valuables",
  books_media: "Books & Media",
  bathroom_items: "Bathroom Items",
  outdoor_garden: "Outdoor & Garden",
  other: "Other",
};

// ━━━ Skeleton ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ManifestTableSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((g) => (
        <div
          key={g}
          className="rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden"
        >
          {[0, 1, 2].map((r) => (
            <div
              key={r}
              className="flex items-center gap-4 px-4 py-3 border-b last:border-0 border-neutral-100 dark:border-slate-800"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ━━━ Confidence bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-neutral-200 dark:bg-slate-700 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 dark:text-slate-400 tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// ━━━ Editable manifest row ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ManifestRowProps {
  item: ManifestItem;
  index: number;
  onUpdate: (id: string, updates: Partial<ManifestItem>) => void;
}

function ManifestRow({ item, index, onUpdate }: ManifestRowProps) {
  const [editing, setEditing] = useState(false);
  const [localDesc, setLocalDesc] = useState(item.description);
  const [localValue, setLocalValue] = useState(
    item.estimatedValueAud.toString(),
  );
  const [localQty, setLocalQty] = useState(item.quantity.toString());
  const [localNotes, setLocalNotes] = useState(item.technicianNotes ?? "");
  const descRef = useRef<HTMLInputElement>(null);

  const restorability =
    RESTORABILITY_ICONS[item.restorability] ?? RESTORABILITY_ICONS.questionable;
  const conditionColor =
    CONDITION_COLORS[item.condition] ?? CONDITION_COLORS.water_damaged;
  const conditionLabel = CONDITION_LABELS[item.condition] ?? item.condition;
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  useEffect(() => {
    if (editing && descRef.current) descRef.current.focus();
  }, [editing]);

  const handleSave = () => {
    onUpdate(item.id, {
      description: localDesc.trim() || item.description,
      estimatedValueAud: parseFloat(localValue) || 0,
      quantity: parseInt(localQty, 10) || 1,
      technicianNotes: localNotes.trim() || undefined,
      verified: true,
    });
    setEditing(false);
  };

  return (
    <tr
      className={cn(
        "group border-b last:border-0 border-neutral-100 dark:border-slate-800",
        item.verified && "bg-emerald-50/30 dark:bg-emerald-900/5",
      )}
    >
      {/* # */}
      <td className="px-3 py-3 w-10 text-xs text-neutral-400 tabular-nums">
        {index + 1}
      </td>

      {/* Description + category */}
      <td className="px-3 py-3">
        {editing ? (
          <Input
            ref={descRef}
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        ) : (
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {item.description}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-400 dark:text-slate-500">
                {categoryLabel}
              </span>
              {item.verified && (
                <CheckCircle2 size={12} className="text-emerald-500" />
              )}
            </div>
          </div>
        )}
      </td>

      {/* Room */}
      <td className="px-3 py-3 text-sm text-neutral-600 dark:text-slate-400 whitespace-nowrap">
        {item.room}
      </td>

      {/* Condition */}
      <td className="px-3 py-3">
        <Badge
          variant="secondary"
          className={cn("text-xs px-2 py-0.5 border-0", conditionColor)}
        >
          {conditionLabel}
        </Badge>
      </td>

      {/* Restorability */}
      <td className="px-3 py-3">
        <span className={cn("text-xs font-medium", restorability.color)}>
          {restorability.label}
        </span>
      </td>

      {/* Qty */}
      <td className="px-3 py-3 w-16">
        {editing ? (
          <Input
            type="number"
            value={localQty}
            onChange={(e) => setLocalQty(e.target.value)}
            className="h-8 w-14 text-sm text-right"
            min="1"
          />
        ) : (
          <span className="text-sm text-neutral-700 dark:text-slate-300 tabular-nums">
            {item.quantity}
          </span>
        )}
      </td>

      {/* Est. Value */}
      <td className="px-3 py-3 w-28">
        {editing ? (
          <Input
            type="number"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            className="h-8 w-24 text-sm text-right"
            min="0"
            step="0.01"
          />
        ) : (
          <span className="text-sm text-neutral-700 dark:text-slate-300 tabular-nums">
            $
            {item.estimatedValueAud.toLocaleString("en-AU", {
              minimumFractionDigits: 2,
            })}
          </span>
        )}
      </td>

      {/* Line total */}
      <td className="px-3 py-3 w-28 text-right">
        <span className="text-sm font-medium text-neutral-900 dark:text-white tabular-nums">
          $
          {(item.estimatedValueAud * item.quantity).toLocaleString("en-AU", {
            minimumFractionDigits: 2,
          })}
        </span>
      </td>

      {/* Confidence */}
      <td className="px-3 py-3 w-24">
        <ConfidenceBar value={item.confidence} />
      </td>

      {/* Actions */}
      <td className="px-3 py-3 w-20">
        {editing ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              className="h-7 px-2 text-emerald-600"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="h-7 px-2"
            >
              ✕
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Edit3 size={13} />
          </Button>
        )}
      </td>
    </tr>
  );
}

// ━━━ Main page ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ContentsManifestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [meta, setMeta] = useState<InspectionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"room" | "category">("room");

  // Fetch inspection metadata
  const fetchMeta = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/inspections/${id}`);
      if (!res.ok) {
        toast.error("Inspection not found");
        router.push("/dashboard/inspections");
        return;
      }
      const data = await res.json();
      const insp = data.inspection;
      setMeta({
        inspectionNumber: insp.inspectionNumber,
        propertyAddress: insp.propertyAddress,
        status: insp.status,
      });
    } catch {
      toast.error("Failed to load inspection");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  // Generate manifest from photos
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Fetch inspection photos from evidence items
      const photosRes = await fetch(`/api/inspections/${id}`);
      if (!photosRes.ok) throw new Error("Failed to fetch inspection data");
      const photosData = await photosRes.json();
      const insp = photosData.inspection;

      // Collect photo evidence items
      const photoEvidence = (insp.evidenceItems ?? []).filter(
        (e: { evidenceClass: string; fileUrl?: string }) =>
          e.evidenceClass?.startsWith("PHOTO_") && e.fileUrl,
      );

      if (photoEvidence.length === 0) {
        toast.error("No photos found. Upload inspection photos first.");
        setGenerating(false);
        return;
      }

      // Get user's BYOK settings
      const settingsRes = await fetch("/api/user/profile");
      const settingsData = settingsRes.ok ? await settingsRes.json() : null;
      const byokModel =
        settingsData?.user?.preferredAiModel ?? "claude-sonnet-4-6";
      const byokKey = settingsData?.user?.byokApiKey;

      if (!byokKey) {
        toast.error("AI API key required. Set your BYOK key in Settings.");
        setGenerating(false);
        return;
      }

      // Fetch and encode photos (max 20)
      const photosToProcess = photoEvidence.slice(0, 20);
      const encodedPhotos: Array<{
        data: string;
        mediaType: string;
        label?: string;
      }> = [];

      for (const photo of photosToProcess) {
        try {
          const imgRes = await fetch(photo.fileUrl);
          if (!imgRes.ok) continue;
          const blob = await imgRes.blob();
          const buffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              "",
            ),
          );
          encodedPhotos.push({
            data: base64,
            mediaType: blob.type || "image/jpeg",
            label: photo.label ?? photo.evidenceClass,
          });
        } catch {
          // Skip failed photo fetches
        }
      }

      if (encodedPhotos.length === 0) {
        toast.error("Could not load any photos. Check photo URLs.");
        setGenerating(false);
        return;
      }

      // Call the manifest API
      const manifestRes = await fetch("/api/inspections/contents-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: id,
          photos: encodedPhotos,
          model: byokModel,
          apiKey: byokKey,
          context: {
            jobType: insp.inspectionWorkflow?.jobType,
          },
        }),
      });

      if (!manifestRes.ok) {
        const err = await manifestRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Manifest generation failed");
      }

      const result = await manifestRes.json();
      setManifest(result.manifest);
      toast.success(
        `Identified ${result.manifest.items.length} items from ${encodedPhotos.length} photos`,
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate manifest",
      );
    } finally {
      setGenerating(false);
    }
  };

  // Update an item in the manifest (client-side editing)
  const handleUpdateItem = useCallback(
    (itemId: string, updates: Partial<ManifestItem>) => {
      if (!manifest) return;
      setManifest({
        ...manifest,
        items: manifest.items.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        ),
        totalEstimatedValueAud: manifest.items.reduce((sum, item) => {
          const updated = item.id === itemId ? { ...item, ...updates } : item;
          return sum + updated.estimatedValueAud * updated.quantity;
        }, 0),
      });
    },
    [manifest],
  );

  // Export CSV
  const handleExportCsv = () => {
    if (!manifest) return;
    // Build CSV inline (matching lib/ai/contents-manifest.ts format)
    const headers = [
      "Item #",
      "Description",
      "Category",
      "Room",
      "Condition",
      "Restorability",
      "Qty",
      "Est. Value (AUD)",
      "Line Total (AUD)",
      "Confidence",
      "Verified",
      "Technician Notes",
      "AI Notes",
    ];

    const sorted = [...manifest.items].sort((a, b) => {
      const roomCmp = a.room.localeCompare(b.room);
      return roomCmp !== 0 ? roomCmp : a.category.localeCompare(b.category);
    });

    const rows = [headers.join(",")];
    sorted.forEach((item, idx) => {
      const cells = [
        String(idx + 1),
        `"${item.description.replace(/"/g, '""')}"`,
        CATEGORY_LABELS[item.category] ?? item.category,
        `"${item.room.replace(/"/g, '""')}"`,
        CONDITION_LABELS[item.condition] ?? item.condition,
        RESTORABILITY_ICONS[item.restorability]?.label ?? item.restorability,
        String(item.quantity),
        item.estimatedValueAud.toFixed(2),
        (item.estimatedValueAud * item.quantity).toFixed(2),
        `${Math.round(item.confidence * 100)}%`,
        item.verified ? "Yes" : "No",
        `"${(item.technicianNotes ?? "").replace(/"/g, '""')}"`,
        `"${(item.aiNotes ?? "").replace(/"/g, '""')}"`,
      ];
      rows.push(cells.join(","));
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contents-manifest-${meta?.inspectionNumber ?? id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  // Derived data
  const groupedItems = manifest
    ? manifest.items.reduce<Record<string, ManifestItem[]>>((acc, item) => {
        const key =
          viewMode === "room"
            ? item.room
            : (CATEGORY_LABELS[item.category] ?? item.category);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {})
    : {};

  const verifiedCount = manifest?.items.filter((i) => i.verified).length ?? 0;
  const lowConfidenceCount =
    manifest?.items.filter((i) => i.confidence < 0.6).length ?? 0;

  // ━━━ Render ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push(`/dashboard/inspections/${id}`)}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
          aria-label="Back to inspection"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Package size={20} className="text-cyan-500 shrink-0" />
                Contents Manifest
              </h1>
              {meta && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500 dark:text-slate-400">
                  <span className="font-medium">{meta.inspectionNumber}</span>
                  <span>&middot;</span>
                  <MapPin size={13} />
                  <span className="truncate">{meta.propertyAddress}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {manifest && (
                <Button
                  onClick={handleExportCsv}
                  variant="outline"
                  className="shrink-0"
                >
                  <Download size={16} className="mr-2" />
                  Export CSV
                </Button>
              )}
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Analysing Photos...
                  </>
                ) : manifest ? (
                  <>
                    <Sparkles size={16} className="mr-2" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="mr-2" />
                    Generate from Photos
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats (only when manifest exists) */}
      {manifest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 p-4">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {manifest.items.length}
            </div>
            <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
              Items identified
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 p-4">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              $
              {manifest.totalEstimatedValueAud.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
              Est. replacement value
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 p-4">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {Math.round(manifest.overallConfidence * 100)}%
            </div>
            <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
              Avg confidence
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 p-4">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {manifest.photosAnalysed}
            </div>
            <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
              Photos analysed
            </div>
          </div>
        </div>
      )}

      {/* View mode toggle + low confidence warning */}
      {manifest && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-neutral-200 dark:border-slate-700 p-0.5">
            <button
              onClick={() => setViewMode("room")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                viewMode === "room"
                  ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-slate-400",
              )}
            >
              By Room
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                viewMode === "category"
                  ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-slate-400",
              )}
            >
              By Category
            </button>
          </div>

          {lowConfidenceCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} />
              {lowConfidenceCount} item{lowConfidenceCount !== 1 ? "s" : ""}{" "}
              with low confidence — review recommended
            </div>
          )}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <ManifestTableSkeleton />
      ) : !manifest ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-slate-800 flex items-center justify-center">
            <Package
              size={28}
              className="text-neutral-400 dark:text-slate-500"
            />
          </div>
          <p className="text-neutral-500 dark:text-slate-400 max-w-sm">
            No contents manifest yet. Upload inspection photos showing affected
            contents, then click <strong>Generate from Photos</strong> to create
            an AI-drafted inventory.
          </p>
          <p className="text-xs text-neutral-400 dark:text-slate-500 max-w-sm">
            AI analyses photos to identify items, assess condition, and estimate
            replacement values. You can edit every field after generation.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([groupName, groupItems]) => (
              <div key={groupName} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
                    {groupName}
                  </h2>
                  <Badge
                    variant="secondary"
                    className="text-xs px-1.5 py-0 bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 border-0"
                  >
                    {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                  <table className="w-full min-w-[900px]">
                    <thead className="bg-neutral-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-10">
                          #
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Room
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Condition
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                          Restorability
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider w-16">
                          Qty
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider w-28">
                          Unit $
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider w-28">
                          Line Total
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-24">
                          Confidence
                        </th>
                        <th className="px-3 py-2.5 w-20" />
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900/50">
                      {groupItems.map((item, idx) => (
                        <ManifestRow
                          key={item.id}
                          item={item}
                          index={idx}
                          onUpdate={handleUpdateItem}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Footer stats */}
      {manifest && manifest.items.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-6 text-sm text-neutral-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-500" />
              <span>
                <strong className="text-neutral-900 dark:text-white">
                  {verifiedCount}
                </strong>{" "}
                of{" "}
                <strong className="text-neutral-900 dark:text-white">
                  {manifest.items.length}
                </strong>{" "}
                items verified
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye size={15} className="text-cyan-500" />
              <span>
                Model:{" "}
                <strong className="text-neutral-900 dark:text-white">
                  {manifest.model}
                </strong>
              </span>
            </div>
            <div className="text-xs text-neutral-400 dark:text-slate-500">
              Generated {new Date(manifest.generatedAt).toLocaleString("en-AU")}{" "}
              &middot; {(manifest.durationMs / 1000).toFixed(1)}s &middot; ~$
              {manifest.estimatedCostUsd.toFixed(4)} USD
            </div>
          </div>

          {manifest.summary && (
            <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 p-4 bg-neutral-50 dark:bg-slate-800/30">
              <p className="text-sm text-neutral-600 dark:text-slate-400">
                <strong className="text-neutral-900 dark:text-white">
                  AI Summary:
                </strong>{" "}
                {manifest.summary}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
