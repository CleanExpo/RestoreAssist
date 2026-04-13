"use client";

import { useState } from "react";
import {
  Droplets,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IICRC_DRY_STANDARDS,
  METER_TYPES,
  getDryStandard,
  getMoistureStatus,
  STATUS_COLORS,
} from "@/lib/iicrc-dry-standards";

interface MoistureReadingEntryFormProps {
  inspectionId: string;
  onSuccess: (reading: {
    id: string;
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: string;
    notes: string | null;
    photoUrl: string | null;
    recordedAt: string;
  }) => void;
  onCancel?: () => void;
  className?: string;
}

const DEPTH_OPTIONS = ["Surface", "Subsurface"];

export function MoistureReadingEntryForm({
  inspectionId,
  onSuccess,
  onCancel,
  className,
}: MoistureReadingEntryFormProps) {
  const [location, setLocation] = useState("");
  const [material, setMaterial] = useState("timber");
  const [meterType, setMeterType] = useState("pin");
  const [depth, setDepth] = useState("Surface");
  const [moistureLevel, setMoistureLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const std = getDryStandard(material);
  const level = parseFloat(moistureLevel);
  const hasLevel = !isNaN(level) && moistureLevel !== "";
  const status = hasLevel ? getMoistureStatus(level, material) : null;
  const statusColors = status ? STATUS_COLORS[status] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location.trim()) {
      setError("Location is required");
      return;
    }
    if (!hasLevel) {
      setError("Moisture level is required");
      return;
    }
    if (level < 0 || level > 100) {
      setError("Moisture level must be between 0 and 100");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/moisture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: location.trim(),
          surfaceType: material,
          moistureLevel: level,
          depth,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save reading");
      }

      const reading = await res.json();
      onSuccess(reading);

      // Reset form
      setLocation("");
      setMoistureLevel("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reading");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets size={18} className="text-cyan-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Add Moisture Reading
          </h3>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Location */}
      <div>
        <label
          htmlFor="moisture-location"
          className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
        >
          Location <span className="text-rose-500">*</span>
        </label>
        <input
          id="moisture-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Living Room North Wall"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
        />
      </div>

      {/* Material + Depth row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="moisture-material"
            className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
          >
            Material Type <span className="text-rose-500">*</span>
          </label>
          <select
            id="moisture-material"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-cyan-500"
          >
            {IICRC_DRY_STANDARDS.map((s) => (
              <option key={s.material} value={s.material}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="moisture-depth"
            className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
          >
            Depth
          </label>
          <select
            id="moisture-depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-cyan-500"
          >
            {DEPTH_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Meter type */}
      <div>
        <label
          htmlFor="moisture-meter-type"
          className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
        >
          Meter Type
        </label>
        <select
          id="moisture-meter-type"
          value={meterType}
          onChange={(e) => setMeterType(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-cyan-500"
        >
          {METER_TYPES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reading value + status */}
      <div>
        <label
          htmlFor="moisture-level"
          className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
        >
          Moisture Reading (%) <span className="text-rose-500">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="moisture-level"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={moistureLevel}
            onChange={(e) => setMoistureLevel(e.target.value)}
            placeholder="0.0"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
          />
          {/* Live status badge */}
          {status && statusColors && (
            <span
              className={cn(
                "flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border",
                statusColors.bg,
                statusColors.text,
                statusColors.border,
              )}
            >
              {status === "dry" ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {status === "dry"
                ? "Dry"
                : status === "drying"
                  ? "Drying"
                  : "Wet"}
            </span>
          )}
        </div>
      </div>

      {/* IICRC dry standard info */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-xs text-blue-700 dark:text-blue-400">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">
            IICRC S500 dry standard for {std.label}:{" "}
          </span>
          ≤{std.dryThreshold}% = Dry · ≤{std.wetThreshold}% = Drying · &gt;
          {std.wetThreshold}% = Wet
          {std.notes && (
            <span className="block text-blue-600 dark:text-blue-500 mt-0.5">
              {std.notes}
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="moisture-notes"
          className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
        >
          Notes (optional)
        </label>
        <textarea
          id="moisture-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional observations…"
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      {/* Error — role="alert" ensures screen readers announce on insertion without focus change */}
      {error && (
        <p
          role="alert"
          className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Droplets size={14} />
          )}
          {submitting ? "Saving…" : "Save Reading"}
        </button>
      </div>
    </form>
  );
}
