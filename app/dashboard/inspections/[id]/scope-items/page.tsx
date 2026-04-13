"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Layers,
  Sparkles,
  MapPin,
  CheckCircle2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScopeItem {
  id: string;
  itemType: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  specification: string | null;
  justification: string | null;
  isRequired: boolean;
  isSelected: boolean;
  autoDetermined: boolean;
  areaId: string | null;
}

interface InspectionMeta {
  inspectionNumber: string;
  propertyAddress: string;
  propertyPostcode: string;
  status: string;
}

// Category labels derived from itemType prefix conventions
const CATEGORY_MAP: Record<string, string> = {
  dry: "Drying",
  dehumid: "Drying",
  fan: "Drying",
  air: "Drying",
  clean: "Cleaning",
  sanitiz: "Cleaning",
  disinfect: "Cleaning",
  antifungal: "Cleaning",
  remov: "Removal",
  demo: "Removal",
  strip: "Removal",
  tear: "Removal",
  carpet: "Removal",
  install: "Repairs",
  repair: "Repairs",
  replac: "Repairs",
  reinstat: "Repairs",
  paint: "Repairs",
  plaster: "Repairs",
};

function deriveCategory(itemType: string): string {
  const lower = itemType.toLowerCase();
  for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.startsWith(prefix) || lower.includes(prefix)) return cat;
  }
  return "Other";
}

const CATEGORY_TABS = [
  "All",
  "Drying",
  "Cleaning",
  "Removal",
  "Repairs",
  "Other",
] as const;
type CategoryTab = (typeof CATEGORY_TABS)[number];

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ScopeTableSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 overflow-hidden">
            {[0, 1, 2].map((r) => (
              <div
                key={r}
                className="flex items-center gap-4 px-4 py-3 border-b last:border-0 border-neutral-100 dark:border-slate-800"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Per-row saving indicator ─────────────────────────────────────────────────

function RowSaveIndicator({ saving }: { saving: boolean }) {
  if (!saving) return null;
  return <Loader2 size={12} className="animate-spin text-cyan-500 shrink-0" />;
}

// ─── Editable scope row ───────────────────────────────────────────────────────

interface ScopeRowProps {
  item: ScopeItem;
  onToggleSelected: (id: string, value: boolean) => Promise<void>;
  onPatchField: (
    id: string,
    field: "quantity" | "specification",
    value: string | number | null,
  ) => Promise<void>;
}

function ScopeRow({ item, onToggleSelected, onPatchField }: ScopeRowProps) {
  const [savingSelected, setSavingSelected] = useState(false);
  const [savingQty, setSavingQty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [localQty, setLocalQty] = useState(item.quantity?.toString() ?? "");
  const [localNotes, setLocalNotes] = useState(item.specification ?? "");

  // debounce refs
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectedChange = async (checked: boolean) => {
    setSavingSelected(true);
    try {
      await onToggleSelected(item.id, checked);
    } finally {
      setSavingSelected(false);
    }
  };

  const handleQtyChange = (val: string) => {
    setLocalQty(val);
    if (qtyTimer.current) clearTimeout(qtyTimer.current);
    qtyTimer.current = setTimeout(async () => {
      setSavingQty(true);
      const parsed = val === "" ? null : parseFloat(val);
      try {
        await onPatchField(item.id, "quantity", parsed);
      } finally {
        setSavingQty(false);
      }
    }, 500);
  };

  const handleNotesChange = (val: string) => {
    setLocalNotes(val);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      try {
        await onPatchField(item.id, "specification", val || null);
      } finally {
        setSavingNotes(false);
      }
    }, 500);
  };

  return (
    <tr
      className={cn(
        "group border-b last:border-0 border-neutral-100 dark:border-slate-800 transition-opacity",
        !item.isSelected && "opacity-40",
      )}
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-8">
        <div className="flex items-center gap-1.5">
          <Checkbox
            checked={item.isSelected}
            onCheckedChange={handleSelectedChange}
            disabled={savingSelected}
            className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
          />
          <RowSaveIndicator saving={savingSelected} />
        </div>
      </td>

      {/* Description + badges */}
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {item.description}
            </span>
            {item.autoDetermined && (
              <Badge
                variant="secondary"
                className="text-xs px-1.5 py-0 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-0"
              >
                Auto
              </Badge>
            )}
            {item.isRequired && (
              <Badge
                variant="secondary"
                className="text-xs px-1.5 py-0 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-0"
              >
                Required
              </Badge>
            )}
          </div>
          {item.justification && (
            <p className="text-xs italic text-neutral-400 dark:text-slate-500">
              [{item.justification}]
            </p>
          )}
        </div>
      </td>

      {/* Quantity */}
      <td className="px-4 py-3 w-28">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={localQty}
            onChange={(e) => handleQtyChange(e.target.value)}
            className="h-8 w-20 text-sm text-right"
            placeholder="—"
            step="any"
            min="0"
          />
          <RowSaveIndicator saving={savingQty} />
        </div>
      </td>

      {/* Unit */}
      <td className="px-4 py-3 w-16">
        <span className="text-sm text-neutral-500 dark:text-slate-400">
          {item.unit ?? "—"}
        </span>
      </td>

      {/* Notes */}
      <td className="px-4 py-3 min-w-[180px]">
        <div className="flex items-center gap-1">
          <Input
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            className="h-8 text-sm"
            placeholder="Add notes…"
          />
          <RowSaveIndicator saving={savingNotes} />
        </div>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScopeItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [items, setItems] = useState<ScopeItem[]>([]);
  const [meta, setMeta] = useState<InspectionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("All");
  const [generating, setGenerating] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
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
      setItems(insp.scopeItems ?? []);
      setMeta({
        inspectionNumber: insp.inspectionNumber,
        propertyAddress: insp.propertyAddress,
        propertyPostcode: insp.propertyPostcode,
        status: insp.status,
      });
    } catch {
      toast.error("Failed to load scope items");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Generate scope ────────────────────────────────────────────────────────

  const handleGenerateScope = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/generate-scope-of-works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Generation failed");
      }
      toast.success("Scope generated successfully");
      await fetchData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate scope",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ── Patch helpers ─────────────────────────────────────────────────────────

  const patchItem = useCallback(
    async (
      itemId: string,
      payload: Partial<
        Pick<ScopeItem, "isSelected" | "quantity" | "specification">
      >,
    ) => {
      const res = await fetch(`/api/inspections/${id}/scope-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Fallback: silently log — don't block the UI, optimistic update already applied
        console.error(
          "[ScopeItems] PATCH failed",
          await res.text().catch(() => ""),
        );
      }
    },
    [id],
  );

  const handleToggleSelected = useCallback(
    async (itemId: string, value: boolean) => {
      // Optimistic update
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, isSelected: value } : it,
        ),
      );
      await patchItem(itemId, { isSelected: value });
    },
    [patchItem],
  );

  const handlePatchField = useCallback(
    async (
      itemId: string,
      field: "quantity" | "specification",
      value: string | number | null,
    ) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                [field]:
                  field === "quantity"
                    ? (value as number | null)
                    : (value as string | null),
              }
            : it,
        ),
      );
      await patchItem(itemId, { [field]: value });
    },
    [patchItem],
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  const enrichedItems = items.map((it) => ({
    ...it,
    _category: deriveCategory(it.itemType),
  }));

  const filteredItems =
    activeCategory === "All"
      ? enrichedItems
      : enrichedItems.filter((it) => it._category === activeCategory);

  // Group by category for display
  const grouped: Record<string, typeof enrichedItems> = {};
  for (const item of filteredItems) {
    const cat = item._category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  // Tab counts (always from full items, not filtered)
  const categoryCounts = enrichedItems.reduce<Record<string, number>>(
    (acc, it) => {
      acc[it._category] = (acc[it._category] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const totalCount = items.length;
  const selectedCount = items.filter((it) => it.isSelected).length;

  // ── Render ────────────────────────────────────────────────────────────────

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
                <Layers size={20} className="text-indigo-500 shrink-0" />
                Scope of Works
              </h1>
              {meta && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500 dark:text-slate-400">
                  <span className="font-medium">{meta.inspectionNumber}</span>
                  <span>·</span>
                  <MapPin size={13} />
                  <span className="truncate">
                    {meta.propertyAddress} ({meta.propertyPostcode})
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={handleGenerateScope}
              disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" />
                  Generate Scope
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-neutral-200 dark:border-slate-700">
        {CATEGORY_TABS.map((cat) => {
          const count = cat === "All" ? totalCount : (categoryCounts[cat] ?? 0);
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2",
                isActive
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10"
                  : "border-transparent text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/50",
              )}
            >
              {cat}
              {count > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    isActive
                      ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"
                      : "bg-neutral-100 dark:bg-slate-800 text-neutral-500",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <ScopeTableSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-slate-800 flex items-center justify-center">
            <FileText
              size={28}
              className="text-neutral-400 dark:text-slate-500"
            />
          </div>
          <p className="text-neutral-500 dark:text-slate-400 max-w-sm">
            No scope items added yet. Use the inspection classification to
            generate scope items, or click <strong>Generate Scope</strong>{" "}
            above.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center text-neutral-400 dark:text-slate-500">
          No items in the <strong>{activeCategory}</strong> category.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, categoryItems]) => (
            <div key={category} className="space-y-2">
              {/* Category heading */}
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-300 uppercase tracking-wider">
                  {category}
                </h2>
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0 bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 border-0"
                >
                  {categoryItems.length} item
                  {categoryItems.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                <table className="w-full min-w-[600px]">
                  <thead className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-2.5 w-8" aria-label="Selected" />
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider w-28">
                        Qty
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-16">
                        Unit
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900/50">
                    {categoryItems.map((item) => (
                      <ScopeRow
                        key={item.id}
                        item={item}
                        onToggleSelected={handleToggleSelected}
                        onPatchField={handlePatchField}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals footer */}
      {!loading && items.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-6 text-sm text-neutral-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-500" />
              <span>
                <strong className="text-neutral-900 dark:text-white">
                  {selectedCount}
                </strong>{" "}
                of{" "}
                <strong className="text-neutral-900 dark:text-white">
                  {totalCount}
                </strong>{" "}
                items selected
              </span>
            </div>
            {totalCount - selectedCount > 0 && (
              <div className="text-neutral-400 dark:text-slate-500 text-xs">
                {totalCount - selectedCount} deselected / excluded from report
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
