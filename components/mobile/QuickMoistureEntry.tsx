"use client";

/**
 * RA-440: Large-touch moisture reading entry for field use.
 * Designed for gloved hands, bright outdoor light, one-handed operation.
 * Uses a custom number pad — no tiny keyboard popups in the field.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Delete } from "lucide-react";
import { getMoistureStatus, STATUS_COLORS, getDryStandard } from "@/lib/iicrc-dry-standards";

interface QuickMoistureEntryProps {
  inspectionId: string;
  onSaved?: (reading: { location: string; moistureLevel: number; material: string }) => void;
}

const COMMON_LOCATIONS = [
  "Wall - bathroom",
  "Wall - bedroom",
  "Wall - hallway",
  "Floor - bathroom",
  "Floor - lounge",
  "Ceiling",
  "Subfloor",
  "Roof cavity",
  "Structural",
];

const MATERIALS = [
  { value: "timber", label: "Timber" },
  { value: "plasterboard", label: "Plasterboard" },
  { value: "concrete", label: "Concrete" },
  { value: "carpet", label: "Carpet" },
  { value: "fibre_cement", label: "FC Sheet" },
];

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function QuickMoistureEntry({ inspectionId, onSaved }: QuickMoistureEntryProps) {
  const [value, setValue] = useState("");
  const [location, setLocation] = useState("");
  const [material, setMaterial] = useState("plasterboard");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericValue = parseFloat(value);
  const isValid = !isNaN(numericValue) && numericValue >= 0 && numericValue <= 100;
  const std = getDryStandard(material);
  const status = isValid ? getMoistureStatus(numericValue, material) : null;
  const statusColors = status ? STATUS_COLORS[status] : null;

  const handlePad = useCallback((key: string) => {
    if (key === "⌫") {
      setValue((v) => v.slice(0, -1));
      return;
    }
    // Max 5 chars e.g. "100.0"
    if (value.length >= 5) return;
    // Only one decimal point
    if (key === "." && value.includes(".")) return;
    // Don't allow leading zeros
    if (key !== "." && value === "0") {
      setValue(key);
      return;
    }
    setValue((v) => v + key);
  }, [value]);

  const handleSave = async () => {
    if (!isValid) return;
    if (!location) { setError("Select a location"); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/moisture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          surfaceType: material,
          moistureLevel: numericValue,
          depth: "Surface",
          meterType: "pin",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setSaved(true);
      onSaved?.({ location, moistureLevel: numericValue, material });
      // Reset after brief success flash
      setTimeout(() => {
        setValue("");
        setSaved(false);
        setLocation("");
      }, 1200);
    } catch {
      setError("Save failed — tap to retry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Value display */}
      <div
        className={cn(
          "rounded-2xl p-4 flex items-end justify-between transition-colors",
          !status && "bg-white/5",
          status === "dry" && "bg-green-900/30",
          status === "drying" && "bg-amber-900/30",
          status === "wet" && "bg-red-900/30",
        )}
      >
        <div>
          <p className="text-xs text-white/40 mb-1">Moisture reading</p>
          <p className="text-5xl font-bold tabular-nums text-white tracking-tight">
            {value || "—"}
            {value && <span className="text-2xl text-white/50 ml-1">%</span>}
          </p>
        </div>
        {status && statusColors && (
          <div className={cn("flex items-center gap-1.5 text-sm font-medium", statusColors.text)}>
            {status === "dry" && <CheckCircle2 className="h-5 w-5" />}
            {status === "drying" && <AlertTriangle className="h-5 w-5" />}
            {status === "wet" && <XCircle className="h-5 w-5" />}
            <span className="capitalize">{status}</span>
          </div>
        )}
      </div>

      {/* Material selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {MATERIALS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMaterial(m.value)}
            className={cn(
              "shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
              material === m.value
                ? "bg-[#1C2E47] text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Location quick-select */}
      <div>
        <p className="text-xs text-white/40 mb-2">Location</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_LOCATIONS.map((loc) => (
            <button
              key={loc}
              onClick={() => setLocation(loc)}
              className={cn(
                "px-3 py-2 rounded-xl text-sm transition-colors",
                location === loc
                  ? "bg-[#D4A574] text-black font-medium"
                  : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2">
        {PAD_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handlePad(key)}
            className={cn(
              "h-16 rounded-2xl text-2xl font-semibold transition-colors active:scale-95",
              key === "⌫"
                ? "bg-white/10 text-white/60 flex items-center justify-center"
                : "bg-white/5 text-white hover:bg-white/10",
            )}
          >
            {key === "⌫" ? <Delete className="h-6 w-6" /> : key}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!isValid || !location || saving}
        className={cn(
          "h-16 rounded-2xl text-lg font-bold transition-all active:scale-95",
          saved
            ? "bg-green-600 text-white"
            : isValid && location
            ? "bg-[#1C2E47] text-white hover:bg-[#1C2E47]/80"
            : "bg-white/5 text-white/30 cursor-not-allowed",
        )}
      >
        {saved ? "✓ Saved" : saving ? "Saving…" : "Save Reading"}
      </button>

      {/* Target range hint */}
      {std && (
        <p className="text-center text-xs text-white/30">
          Dry target for {MATERIALS.find((m) => m.value === material)?.label}: ≤{std.dryThreshold}%
          {" · "}S500:2025 §12
        </p>
      )}
    </div>
  );
}
