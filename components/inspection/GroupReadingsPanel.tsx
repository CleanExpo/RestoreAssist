"use client";

/**
 * GroupReadingsPanel — RA-1196
 *
 * "Group readings" action + review panel for auto-clustering moisture
 * readings into affected areas via Claude Haiku. Users can edit the
 * group name, uncheck a reading to exclude it, then Accept to bulk-PATCH
 * the MoistureReading.affectedArea column.
 */

import { useState } from "react";
import { Sparkles, Loader2, Check, X, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MoistureReadingLite = {
  id: string;
  location: string;
  moistureLevel: number;
};

type PreviewGroup = {
  name: string;
  locations: string[];
  readingIds: string[];
  averageMoisture: number;
  elevatedCount: number;
  // Client-only edit state
  checked: Record<string, boolean>;
};

type ApiGroup = {
  name: string;
  locations: string[];
  readingIds: string[];
  averageMoisture: number;
  elevatedCount: number;
};

type GroupResponse = {
  groups: ApiGroup[];
  unsortedReadingIds: string[];
};

export function GroupReadingsPanel({
  inspectionId,
  readings,
  onApplied,
}: {
  inspectionId: string;
  readings: MoistureReadingLite[];
  onApplied?: (
    assignments: Array<{ name: string; readingIds: string[] }>,
  ) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [groups, setGroups] = useState<PreviewGroup[] | null>(null);
  const [unsorted, setUnsorted] = useState<string[]>([]);

  const requestGrouping = async () => {
    if (readings.length === 0) {
      toast.error("Add at least one moisture reading first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/group-readings`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Grouping failed");
      }
      const payload = data as GroupResponse;
      setGroups(
        payload.groups.map((g) => ({
          ...g,
          checked: Object.fromEntries(g.readingIds.map((id) => [id, true])),
        })),
      );
      setUnsorted(payload.unsortedReadingIds);
      if (payload.groups.length === 0) {
        toast("AI returned no groups");
      } else {
        toast.success(`Proposed ${payload.groups.length} group(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grouping failed");
    } finally {
      setLoading(false);
    }
  };

  const updateGroupName = (idx: number, name: string) => {
    setGroups((prev) =>
      prev ? prev.map((g, i) => (i === idx ? { ...g, name } : g)) : prev,
    );
  };

  const toggleReading = (groupIdx: number, readingId: string) => {
    setGroups((prev) =>
      prev
        ? prev.map((g, i) =>
            i === groupIdx
              ? {
                  ...g,
                  checked: {
                    ...g.checked,
                    [readingId]: !g.checked[readingId],
                  },
                }
              : g,
          )
        : prev,
    );
  };

  const cancel = () => {
    setGroups(null);
    setUnsorted([]);
  };

  const apply = async () => {
    if (!groups) return;
    const assignments = groups
      .map((g) => ({
        name: g.name.trim(),
        readingIds: g.readingIds.filter((id) => g.checked[id]),
      }))
      .filter((g) => g.name && g.readingIds.length > 0);

    if (assignments.length === 0) {
      toast.error("No groups to apply");
      return;
    }

    setApplying(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/group-readings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Apply failed");
      }
      toast.success(
        `Grouped ${data.updated ?? 0} reading(s) into ${assignments.length} area(s)`,
      );
      onApplied?.(assignments);
      setGroups(null);
      setUnsorted([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const readingLabel = (id: string) => {
    const r = readings.find((x) => x.id === id);
    if (!r) return id.slice(0, 6);
    return `${r.location} · ${r.moistureLevel}%`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500 dark:text-slate-400">
          Auto-group readings into affected areas (IICRC S500:2025 §6)
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={requestGrouping}
          disabled={loading || readings.length === 0}
          aria-label="Auto-group moisture readings into affected areas"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          <span>{loading ? "Grouping…" : "Group readings"}</span>
        </Button>
      </div>

      {groups && (
        <Card className="border-cyan-200 dark:border-cyan-800/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles
                className="size-4 text-cyan-600 dark:text-cyan-400"
                aria-hidden="true"
              />
              Proposed affected-area groups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((g, idx) => {
              const selectedCount = g.readingIds.filter(
                (id) => g.checked[id],
              ).length;
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-neutral-200 dark:border-slate-700 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Pencil
                      className="size-3.5 text-neutral-400"
                      aria-hidden="true"
                    />
                    <Label htmlFor={`group-name-${idx}`} className="sr-only">
                      Group name
                    </Label>
                    <Input
                      id={`group-name-${idx}`}
                      value={g.name}
                      onChange={(e) => updateGroupName(idx, e.target.value)}
                      className="h-8 text-sm font-medium"
                    />
                    <Badge variant="secondary" className="shrink-0">
                      avg {g.averageMoisture}%
                    </Badge>
                    {g.elevatedCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="shrink-0"
                        title="Readings at or above 16%MC"
                      >
                        {g.elevatedCount} elevated
                      </Badge>
                    )}
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {g.readingIds.map((id) => (
                      <li key={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={`r-${idx}-${id}`}
                          checked={!!g.checked[id]}
                          onCheckedChange={() => toggleReading(idx, id)}
                        />
                        <Label
                          htmlFor={`r-${idx}-${id}`}
                          className="cursor-pointer font-normal"
                        >
                          {readingLabel(id)}
                        </Label>
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs text-neutral-400">
                    {selectedCount} of {g.readingIds.length} selected
                  </div>
                </div>
              );
            })}

            {unsorted.length > 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-slate-700 p-3">
                <div className="text-xs font-medium text-neutral-500 mb-1.5">
                  Unsorted ({unsorted.length})
                </div>
                <ul className="text-sm text-neutral-500 space-y-0.5">
                  {unsorted.map((id) => (
                    <li key={id}>{readingLabel(id)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={apply}
                disabled={applying}
              >
                {applying ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-4" aria-hidden="true" />
                )}
                <span>{applying ? "Applying…" : "Accept groups"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancel}
                disabled={applying}
              >
                <X className="size-4" aria-hidden="true" />
                <span>Cancel</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
