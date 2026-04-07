"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  RotateCcw,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

interface CostItem {
  id: string;
  category: string;
  description: string;
  rate: number;
  unit: string;
  createdAt: string;
  updatedAt: string;
  libraryId: string;
}

interface CostLibrary {
  id: string;
  name: string;
  region: string;
  description?: string;
  isDefault: boolean;
  items: CostItem[];
  _count: { items: number };
}

interface RowState {
  /** Original data as fetched from the server (null for newly added rows) */
  original: CostItem | null;
  /** Currently edited values */
  current: {
    id: string;
    category: string;
    description: string;
    rate: string;
    unit: string;
    /** True if this row was added locally and has no server id yet */
    isNew: boolean;
    /** True if this row is pending deletion */
    toDelete: boolean;
  };
  dirty: boolean;
}

let nextTempId = 1;
function tempId() {
  return `__new_${nextTempId++}`;
}

function itemToRow(item: CostItem): RowState {
  return {
    original: item,
    current: {
      id: item.id,
      category: item.category,
      description: item.description,
      rate: item.rate.toString(),
      unit: item.unit,
      isNew: false,
      toDelete: false,
    },
    dirty: false,
  };
}

function blankRow(libraryId: string): RowState {
  return {
    original: null,
    current: {
      id: tempId(),
      category: "",
      description: "",
      rate: "",
      unit: "",
      isNew: true,
      toDelete: false,
    },
    dirty: true,
  };
}

export default function CostLibraryBulkEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [library, setLibrary] = useState<CostLibrary | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Checkbox selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk price adjustment
  const [priceAdjust, setPriceAdjust] = useState<string>("");

  // Inline editing: track which cell is being edited
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: "category" | "description" | "rate" | "unit";
  } | null>(null);

  // Confirmation dialog for delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/cost-libraries/${id}`);
        if (!res.ok) {
          toast.error("Failed to load cost library");
          return;
        }
        const data = await res.json();
        const lib: CostLibrary = data.library ?? data;
        setLibrary(lib);
        setRows(lib.items.map(itemToRow));
      } catch (err) {
        console.error("Error fetching cost library:", err);
        toast.error("Failed to load cost library");
      } finally {
        setLoading(false);
      }
    };
    fetchLibrary();
  }, [id]);

  // Focus input when a cell enters edit mode
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // ── Row helpers ────────────────────────────────────────────────────────────

  const updateCell = useCallback(
    (
      rowId: string,
      field: "category" | "description" | "rate" | "unit",
      value: string,
    ) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.current.id !== rowId) return row;
          const updated = { ...row.current, [field]: value };
          const isDirty =
            row.original === null ||
            updated.category !== row.original.category ||
            updated.description !== row.original.description ||
            updated.rate !== row.original.rate.toString() ||
            updated.unit !== row.original.unit;
          return { ...row, current: updated, dirty: isDirty };
        }),
      );
    },
    [],
  );

  const commitEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Escape") {
      commitEdit();
    }
  };

  // ── Selection ──────────────────────────────────────────────────────────────

  const visibleRowIds = rows
    .filter((r) => !r.current.toDelete)
    .map((r) => r.current.id);

  const allSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((rid) => selected.has(rid));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleRowIds));
    }
  };

  const toggleSelect = (rowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // ── Bulk price adjustment ──────────────────────────────────────────────────

  const applyPriceAdjustment = (toSelected: boolean) => {
    const pct = parseFloat(priceAdjust);
    if (isNaN(pct)) {
      toast.error("Enter a valid percentage (e.g. 10 or -5)");
      return;
    }
    const multiplier = 1 + pct / 100;
    setRows((prev) =>
      prev.map((row) => {
        if (row.current.toDelete) return row;
        if (toSelected && !selected.has(row.current.id)) return row;
        const currentRate = parseFloat(row.current.rate) || 0;
        const newRate = (currentRate * multiplier).toFixed(2);
        const isDirty =
          row.original === null || newRate !== row.original.rate.toString();
        return {
          ...row,
          current: { ...row.current, rate: newRate },
          dirty: isDirty,
        };
      }),
    );
    toast.success(
      `Prices adjusted by ${pct >= 0 ? "+" : ""}${pct}% on ${toSelected ? "selected" : "all"} rows`,
    );
  };

  // ── Add / Delete ───────────────────────────────────────────────────────────

  const addRow = () => {
    const newRow = blankRow(id);
    setRows((prev) => [...prev, newRow]);
    // Auto-select the new row
    setSelected((prev) => new Set([...prev, newRow.current.id]));
  };

  const markSelectedForDeletion = () => {
    if (selected.size === 0) {
      toast.error("No rows selected");
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setRows(
      (prev) =>
        prev
          .map((row) => {
            if (!selected.has(row.current.id)) return row;
            // New (unsaved) rows are simply removed from state
            if (row.current.isNew) return null;
            // Existing rows are marked toDelete (removed on save)
            return {
              ...row,
              current: { ...row.current, toDelete: true },
              dirty: true,
            };
          })
          .filter(Boolean) as RowState[],
    );
    setSelected(new Set());
    setShowDeleteConfirm(false);
    toast.success("Rows marked for deletion — save to confirm");
  };

  // ── Discard ────────────────────────────────────────────────────────────────

  const discardChanges = () => {
    if (!library) return;
    setRows(library.items.map(itemToRow));
    setSelected(new Set());
    toast("Changes discarded");
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const dirtyCount = rows.filter((r) => r.dirty).length;

  const saveChanges = async () => {
    if (dirtyCount === 0) {
      toast("No changes to save");
      return;
    }

    setSaving(true);
    let errors = 0;
    const updatedItems: CostItem[] = [];

    try {
      for (const row of rows) {
        if (!row.dirty) {
          if (row.original) updatedItems.push(row.original);
          continue;
        }

        // Delete
        if (row.current.toDelete && row.original) {
          const res = await fetch(`/api/cost-items/${row.original.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            console.error("Failed to delete item", row.original.id);
            errors++;
          }
          // Don't push to updatedItems — it's gone
          continue;
        }

        // Create new
        if (row.current.isNew) {
          const res = await fetch("/api/cost-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: row.current.category,
              description: row.current.description,
              rate: parseFloat(row.current.rate) || 0,
              unit: row.current.unit,
              libraryId: id,
            }),
          });
          if (res.ok) {
            const saved: CostItem = await res.json();
            updatedItems.push(saved);
          } else {
            console.error("Failed to create item");
            errors++;
          }
          continue;
        }

        // Update existing
        if (row.original) {
          const res = await fetch(`/api/cost-items/${row.original.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: row.current.category,
              description: row.current.description,
              rate: parseFloat(row.current.rate) || 0,
              unit: row.current.unit,
            }),
          });
          if (res.ok) {
            const saved: CostItem = await res.json();
            updatedItems.push(saved);
          } else {
            console.error("Failed to update item", row.original.id);
            errors++;
          }
        }
      }

      if (errors > 0) {
        toast.error(`Saved with ${errors} error(s). Please review and retry.`);
      } else {
        toast.success("All changes saved successfully");
      }

      // Refresh local state from saved data
      setRows(updatedItems.map(itemToRow));
      setLibrary((prev) =>
        prev
          ? {
              ...prev,
              items: updatedItems,
              _count: { items: updatedItems.length },
            }
          : prev,
      );
      setSelected(new Set());
    } catch (err) {
      console.error("Error saving changes:", err);
      toast.error("An unexpected error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderCell = (
    row: RowState,
    field: "category" | "description" | "rate" | "unit",
  ) => {
    const rowId = row.current.id;
    const value = row.current[field];
    const isEditing =
      editingCell?.rowId === rowId && editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type={field === "rate" ? "number" : "text"}
          step={field === "rate" ? "0.01" : undefined}
          value={value}
          onChange={(e) => updateCell(rowId, field, e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-slate-900 border border-cyan-500 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
      );
    }

    return (
      <span
        onClick={() => setEditingCell({ rowId, field })}
        className="block w-full cursor-text rounded px-2 py-1 hover:bg-slate-700/40 transition-colors text-sm"
        title="Click to edit"
      >
        {field === "rate" ? (
          value ? (
            `$${parseFloat(value).toFixed(2)}`
          ) : (
            <span className="text-slate-500 italic">—</span>
          )
        ) : (
          value || <span className="text-slate-500 italic">—</span>
        )}
      </span>
    );
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin h-8 w-8 text-cyan-500" />
      </div>
    );
  }

  if (!library) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/cost-libraries"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back to Cost Libraries
        </Link>
        <p className="text-slate-400">Library not found.</p>
      </div>
    );
  }

  const visibleRows = rows.filter((r) => !r.current.toDelete);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/dashboard/cost-libraries/${id}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft size={16} />
        Back to {library.name}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Bulk Editor — {library.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-slate-400 text-sm">
              {visibleRows.length} item{visibleRows.length !== 1 ? "s" : ""}
            </span>
            {dirtyCount > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
            )}
            {selected.size > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                {selected.size} selected
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
            title="Add a new blank row"
          >
            <Plus size={15} />
            Add Row
          </button>
          <button
            onClick={markSelectedForDeletion}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 px-3 py-2 border border-rose-500/40 text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete selected rows"
          >
            <Trash2 size={15} />
            Delete Selected
          </button>
          <button
            onClick={discardChanges}
            disabled={dirtyCount === 0}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Discard all unsaved changes"
          >
            <RotateCcw size={15} />
            Discard
          </button>
          <button
            onClick={saveChanges}
            disabled={saving || dirtyCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Bulk price adjustment panel */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
        <p className="text-sm font-medium text-slate-300 mb-3">
          Bulk Price Adjustment
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
              %
            </span>
            <input
              type="number"
              placeholder="e.g. 10 or -5"
              value={priceAdjust}
              onChange={(e) => setPriceAdjust(e.target.value)}
              className="w-36 pl-7 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
            />
          </div>
          <button
            onClick={() => applyPriceAdjustment(false)}
            className="px-3 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
          >
            Apply to All
          </button>
          <button
            onClick={() => applyPriceAdjustment(true)}
            disabled={selected.size === 0}
            className="px-3 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply to Selected ({selected.size})
          </button>
          <p className="text-xs text-slate-500">
            Enter a positive number to increase prices, negative to decrease.
          </p>
        </div>
      </div>

      {/* Table */}
      {visibleRows.length === 0 ? (
        <div className="p-12 rounded-lg border border-slate-700/50 bg-slate-800/30 text-center">
          <p className="text-slate-400 mb-4">
            No items yet. Add a row to get started.
          </p>
          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={15} />
            Add First Row
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/60">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-slate-300 min-w-[140px]">
                    Category / Item Code
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-slate-300 min-w-[240px]">
                    Description
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-slate-300 min-w-[110px]">
                    Unit Cost (AU$)
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-slate-300 min-w-[90px]">
                    Unit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {visibleRows.map((row) => {
                  const isSelected = selected.has(row.current.id);
                  return (
                    <tr
                      key={row.current.id}
                      className={[
                        "transition-colors",
                        row.dirty ? "bg-yellow-500/5" : "",
                        isSelected ? "bg-cyan-500/5" : "hover:bg-slate-700/20",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.current.id)}
                          className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer"
                        />
                      </td>

                      {/* Category / item code */}
                      <td className="px-1 py-1">
                        {renderCell(row, "category")}
                      </td>

                      {/* Description */}
                      <td className="px-1 py-1">
                        {renderCell(row, "description")}
                      </td>

                      {/* Unit cost */}
                      <td className="px-1 py-1 text-right">
                        {renderCell(row, "rate")}
                      </td>

                      {/* Unit */}
                      <td className="px-1 py-1">{renderCell(row, "unit")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-700/30 flex items-center justify-between text-xs text-slate-500">
            <span>
              {visibleRows.length} item{visibleRows.length !== 1 ? "s" : ""}
              {selected.size > 0 ? ` · ${selected.size} selected` : ""}
            </span>
            {dirtyCount > 0 && (
              <span className="text-yellow-400">
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""} — click
                &ldquo;Save Changes&rdquo; to persist
              </span>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-semibold mb-2">
              Delete {selected.size} row{selected.size !== 1 ? "s" : ""}?
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              This will remove {selected.size} selected row
              {selected.size !== 1 ? "s" : ""} from the table. The deletion will
              only be applied to the server when you click{" "}
              <strong className="text-white">Save Changes</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Delete Rows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
