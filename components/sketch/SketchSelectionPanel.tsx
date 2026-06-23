"use client";

/**
 * SketchSelectionPanel — context-sensitive panel that appears when an object
 * is selected on the canvas.  Floats over the canvas (absolute position).
 *
 * Exposes room type, label, colour, opacity, and stroke controls.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Trash2, X, AlertTriangle } from "lucide-react";
import { evaluateWhsGate } from "@/lib/anz/whs-gate";
import { classifyCover, type DamageCause } from "@/lib/nz/nhcover";

const NZ_CAUSES: { id: DamageCause; label: string }[] = [
  { id: "earthquake", label: "Earthquake" },
  { id: "landslip", label: "Landslip" },
  { id: "volcanic", label: "Volcanic" },
  { id: "hydrothermal", label: "Hydrothermal" },
  { id: "tsunami", label: "Tsunami" },
  { id: "fire_natural", label: "Fire (from natural hazard)" },
  { id: "storm", label: "Storm" },
  { id: "flood", label: "Flood" },
  { id: "other", label: "Other / accidental" },
];

const ROOM_COLORS = [
  {
    fill: "rgba(59,130,246,0.10)",
    stroke: "#3b82f6",
    label: "Living / Common",
  },
  { fill: "rgba(16,185,129,0.10)", stroke: "#10b981", label: "Bedroom" },
  { fill: "rgba(245,158,11,0.10)", stroke: "#f59e0b", label: "Kitchen" },
  { fill: "rgba(236,72,153,0.10)", stroke: "#ec4899", label: "Bathroom / WC" },
  {
    fill: "rgba(139,92,246,0.10)",
    stroke: "#8b5cf6",
    label: "Garage / Utility",
  },
  { fill: "rgba(239,68,68,0.10)", stroke: "#ef4444", label: "Damage Zone" },
];

export interface SelectedObject {
  id: string;
  type: string;
  label?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  /** ANZ material slug assigned to this element (spec §5.1). */
  materialSlug?: string;
  /** Recorded WHS pathway note for this element, if any (spec §5.3). */
  whsPathwayNote?: string;
  /** NZ damage cause for NHCover routing (spec §5.5). */
  cause?: DamageCause;
  /** S500 water category assigned to the area (spec §5.2). */
  waterCategory?: "cat1" | "cat2" | "cat3";
  /**
   * Geometry provenance (RA-6760). `underlay_reference` = AI/imported, excluded
   * from measured quantities until a technician confirms it; `operator_measured`
   * = technician-drawn/confirmed.
   */
  provenance?: "operator_measured" | "underlay_reference";
}

export interface MaterialOption {
  slug: string;
  name: string;
  isPotentialAcm: boolean;
}

export interface SketchSelectionPanelProps {
  selected: SelectedObject | null;
  /** ANZ materials library (from /api/materials) for the picker. */
  materials?: MaterialOption[];
  /** Property build year — drives the WHS asbestos gate (pre-2004 = at risk). */
  propertyYearBuilt?: number;
  /** Jurisdiction — AU (NCC) or NZ (NHCover). Default AU. */
  country?: "AU" | "NZ";
  /** Guided (homeowner) mode — hide technician-only compliance controls. */
  guided?: boolean;
  onLabelChange?: (id: string, label: string) => void;
  onColorChange?: (id: string, fill: string, stroke: string) => void;
  onOpacityChange?: (id: string, opacity: number) => void;
  onMaterialChange?: (id: string, slug: string) => void;
  onRecordWhsPathway?: (id: string, note: string) => void;
  onCountryChange?: (country: "AU" | "NZ") => void;
  onCauseChange?: (id: string, cause: DamageCause) => void;
  onWaterCategoryChange?: (
    id: string,
    category: "cat1" | "cat2" | "cat3",
  ) => void;
  /** Promote reference (AI/imported) geometry to operator_measured (RA-6760). */
  onConfirmProvenance?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDeselect?: () => void;
  className?: string;
}

export function SketchSelectionPanel({
  selected,
  materials,
  propertyYearBuilt,
  country = "AU",
  guided = false,
  onLabelChange,
  onColorChange,
  onOpacityChange,
  onMaterialChange,
  onRecordWhsPathway,
  onCountryChange,
  onCauseChange,
  onWaterCategoryChange,
  onConfirmProvenance,
  onDelete,
  onDeselect,
  className,
}: SketchSelectionPanelProps) {
  const [pathwayDraft, setPathwayDraft] = useState("");

  if (!selected) return null;

  const isRoom = selected.type === "room" || selected.type === "polygon";
  const isText = selected.type === "text_label" || selected.type === "i-text";
  const isLine = selected.type === "wall" || selected.type === "line";

  const selectedMaterial = materials?.find(
    (m) => m.slug === selected.materialSlug,
  );
  // WHS asbestos gate (spec §5.3): suspected ACM blocks strip-out scope until a
  // pathway is recorded. Reuses the shared, tested gate logic.
  const whs = selectedMaterial?.isPotentialAcm
    ? evaluateWhsGate({
        isPotentialAcm: true,
        propertyYearBuilt,
        action: "strip_out",
        whsPathwayNote: selected.whsPathwayNote,
      })
    : null;

  return (
    <div
      className={cn(
        "absolute top-4 right-4 z-20 w-56",
        "bg-brand-navy/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl",
        "p-3 space-y-2.5 text-sm text-white",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wide">
          {isRoom ? "Room" : isText ? "Label" : isLine ? "Wall" : "Object"}
        </span>
        <button
          type="button"
          onClick={onDeselect}
          className="flex items-center justify-center min-w-11 min-h-11 -mr-2 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Deselect"
        >
          <X size={14} />
        </button>
      </div>

      {/* Provenance — reference (AI/import) geometry is excluded from measured
          quantities until a technician confirms it (RA-6760). */}
      {selected.provenance === "underlay_reference" && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 space-y-2"
        >
          <div className="flex items-start gap-1.5 text-xs text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Reference geometry (AI / imported) — excluded from measured
              quantities until confirmed.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onConfirmProvenance?.(selected.id)}
            className="w-full min-h-11 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors text-xs font-medium"
          >
            Confirm measurement
          </button>
        </div>
      )}

      {/* Label input (rooms + text) */}
      {(isRoom || isText) && (
        <div>
          <label className="block text-xs text-white/50 mb-1">Label</label>
          <input
            type="text"
            defaultValue={selected.label ?? ""}
            onBlur={(e) => onLabelChange?.(selected.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onLabelChange?.(
                  selected.id,
                  (e.target as HTMLInputElement).value,
                );
              }
            }}
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="Room name…"
          />
        </div>
      )}

      {/* Room colour picker */}
      {isRoom && (
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Colour</label>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_COLORS.map((c) => (
              <button
                key={c.stroke}
                type="button"
                title={c.label}
                aria-label={`Colour: ${c.label}`}
                onClick={() => onColorChange?.(selected.id, c.fill, c.stroke)}
                className={cn(
                  "w-11 h-11 rounded-lg border-2 transition-all",
                  selected.stroke === c.stroke
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: c.stroke }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Opacity (rooms) */}
      {isRoom && (
        <div>
          <div className="flex justify-between text-xs text-white/50 mb-1">
            <span>Opacity</span>
            <span className="tabular-nums">
              {Math.round((selected.opacity ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            defaultValue={selected.opacity ?? 1}
            onInput={(e) =>
              onOpacityChange?.(
                selected.id,
                parseFloat((e.target as HTMLInputElement).value),
              )
            }
            className="w-full accent-cyan-400"
          />
        </div>
      )}

      {/* ANZ material picker (rooms + walls) */}
      {!guided && (isRoom || isLine) && materials && materials.length > 0 && (
        <div>
          <label
            htmlFor="sketch-material"
            className="block text-xs text-white/50 mb-1"
          >
            Material
          </label>
          <select
            id="sketch-material"
            value={selected.materialSlug ?? ""}
            onChange={(e) => onMaterialChange?.(selected.id, e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
          >
            <option value="" className="text-black">
              Select material…
            </option>
            {materials.map((m) => (
              <option key={m.slug} value={m.slug} className="text-black">
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* S500 water category (rooms) */}
      {!guided && isRoom && (
        <div>
          <label
            htmlFor="sketch-water-category"
            className="block text-xs text-white/50 mb-1"
          >
            Water category (S500)
          </label>
          <select
            id="sketch-water-category"
            value={selected.waterCategory ?? ""}
            onChange={(e) =>
              onWaterCategoryChange?.(
                selected.id,
                e.target.value as "cat1" | "cat2" | "cat3",
              )
            }
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
          >
            <option value="" className="text-black">
              Select category…
            </option>
            <option value="cat1" className="text-black">
              Category 1 — Clean
            </option>
            <option value="cat2" className="text-black">
              Category 2 — Grey
            </option>
            <option value="cat3" className="text-black">
              Category 3 — Black
            </option>
          </select>
        </div>
      )}

      {/* WHS asbestos gate */}
      {!guided && whs?.blocked && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 space-y-2"
        >
          <div className="flex items-start gap-1.5 text-xs text-rose-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Suspected asbestos (ACM) — strip-out scope is blocked until a WHS
              pathway is recorded.
            </span>
          </div>
          <input
            type="text"
            value={pathwayDraft}
            onChange={(e) => setPathwayDraft(e.target.value)}
            placeholder="WHS pathway (friable/non-friable, licensed removal, sampling)…"
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <button
            type="button"
            onClick={() => onRecordWhsPathway?.(selected.id, pathwayDraft)}
            className="w-full min-h-11 py-1.5 rounded-lg bg-rose-500/20 text-rose-100 border border-rose-500/30 hover:bg-rose-500/30 transition-colors text-xs font-medium"
          >
            Record WHS pathway
          </button>
        </div>
      )}
      {!guided && whs && !whs.blocked && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200 flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>ACM pathway recorded — strip-out permitted.</span>
        </div>
      )}

      {/* Jurisdiction (AU/NZ) + NHCover routing (spec §5.5) */}
      {!guided && (
        <div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-white/50">Jurisdiction</span>
            {(["AU", "NZ"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCountryChange?.(c)}
                className={cn(
                  "inline-flex items-center justify-center min-w-11 min-h-11 px-2 rounded-md border text-xs",
                  country === c
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                    : "border-white/10 text-white/50 hover:text-white/80",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {country === "NZ" && isRoom && (
            <div className="mt-2 space-y-1.5">
              <label htmlFor="nz-cause" className="block text-xs text-white/50">
                Damage cause (NHCover)
              </label>
              <select
                id="nz-cause"
                value={selected.cause ?? ""}
                onChange={(e) =>
                  onCauseChange?.(selected.id, e.target.value as DamageCause)
                }
                className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
              >
                <option value="" className="text-black">
                  Select cause…
                </option>
                {NZ_CAUSES.map((c) => (
                  <option key={c.id} value={c.id} className="text-black">
                    {c.label}
                  </option>
                ))}
              </select>
              {selected.cause &&
                (() => {
                  const b = classifyCover(selected.cause, "building");
                  const l = classifyCover(selected.cause, "land");
                  return (
                    <div className="text-xs rounded-lg border border-white/10 bg-white/5 p-2 space-y-0.5">
                      <div>
                        Building:{" "}
                        <span
                          className={
                            b.covered ? "text-emerald-300" : "text-amber-300"
                          }
                        >
                          {b.covered ? "NHCover" : "Private insurer"}
                        </span>
                      </div>
                      <div>
                        Land:{" "}
                        <span
                          className={
                            l.covered ? "text-emerald-300" : "text-white/50"
                          }
                        >
                          {l.covered ? "NHCover" : "private"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete?.(selected.id)}
        className="w-full min-h-11 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-colors text-xs font-medium"
      >
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  );
}
