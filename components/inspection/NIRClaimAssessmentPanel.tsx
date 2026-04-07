"use client";

/**
 * NIRClaimAssessmentPanel — RA-291
 *
 * Renders the appropriate claim-type-specific assessment form based on the
 * inspection's current NIRClaimType. Supports all 10 NIR claim types:
 *   WATER | FIRE | MOULD | STORM | CONTENTS | BIOHAZARD | ODOUR | CARPET | HVAC | ASBESTOS
 *
 * Also provides an always-available Australian Compliance section.
 *
 * Data flow:
 *   1. On mount / claimType change → GET /api/inspections/[id]/[route]
 *   2. Save → POST /api/inspections/[id]/[route]
 *   3. Australian Compliance → GET/POST /api/inspections/[id]/australian-compliance
 */

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Droplets,
  Flame,
  Wind,
  Cloud,
  Package,
  AlertTriangle,
  Thermometer,
  Wrench,
  Shield,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NIRClaimType =
  | "WATER"
  | "FIRE"
  | "MOULD"
  | "STORM"
  | "CONTENTS"
  | "BIOHAZARD"
  | "ODOUR"
  | "CARPET"
  | "HVAC"
  | "ASBESTOS";

interface NIRClaimAssessmentPanelProps {
  inspectionId: string;
  initialClaimType?: NIRClaimType | null;
  onClaimTypeChange?: (claimType: NIRClaimType) => void;
}

// ─── Claim type metadata ──────────────────────────────────────────────────────

const CLAIM_TYPES: {
  type: NIRClaimType;
  label: string;
  icon: React.ElementType;
  route: string;
  color: string;
}[] = [
  {
    type: "WATER",
    label: "Water",
    icon: Droplets,
    route: "water-damage-classification",
    color: "cyan",
  },
  {
    type: "FIRE",
    label: "Fire / Smoke",
    icon: Flame,
    route: "fire-smoke-assessment",
    color: "orange",
  },
  {
    type: "MOULD",
    label: "Mould",
    icon: Wind,
    route: "mould-remediation",
    color: "green",
  },
  {
    type: "STORM",
    label: "Storm",
    icon: Cloud,
    route: "storm-damage",
    color: "blue",
  },
  {
    type: "CONTENTS",
    label: "Contents",
    icon: Package,
    route: "contents-pack-out",
    color: "purple",
  },
  {
    type: "BIOHAZARD",
    label: "Biohazard",
    icon: AlertTriangle,
    route: "biohazard-assessment",
    color: "red",
  },
  {
    type: "ODOUR",
    label: "Odour",
    icon: Wind,
    route: "fire-smoke-assessment",
    color: "yellow",
  },
  {
    type: "CARPET",
    label: "Carpet",
    icon: Wrench,
    route: "carpet-restoration",
    color: "amber",
  },
  {
    type: "HVAC",
    label: "HVAC",
    icon: Thermometer,
    route: "hvac-assessment",
    color: "teal",
  },
  {
    type: "ASBESTOS",
    label: "Asbestos",
    icon: Shield,
    route: "australian-compliance",
    color: "rose",
  },
];

const COLOR_MAP: Record<string, string> = {
  cyan: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 ring-cyan-400",
  orange:
    "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-orange-400",
  green:
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-green-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-blue-400",
  purple:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-purple-400",
  red: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-red-400",
  yellow:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 ring-yellow-400",
  amber:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-amber-400",
  teal: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 ring-teal-400",
  rose: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 ring-rose-400",
};

// ─── Small helpers ─────────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start py-2.5 border-b border-neutral-100 dark:border-slate-800 last:border-0">
      <div className="col-span-1">
        <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
          {label}
        </label>
        {hint && (
          <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
            {hint}
          </p>
        )}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
  step,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      className="w-full text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
    />
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
        value ? "bg-cyan-500" : "bg-neutral-300 dark:bg-slate-600",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          value ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function GateBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        ok
          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
          : "bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400",
      )}
    >
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
    </div>
  );
}

// ─── Per-claim-type form sections ─────────────────────────────────────────────

function WaterForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="Water Category">
        <Select
          value={(data.waterCategory as string) || ""}
          onChange={(v) => onChange("waterCategory", v || null)}
          options={[
            { value: "CAT_1", label: "Cat 1 — Clean Water" },
            { value: "CAT_2", label: "Cat 2 — Grey Water" },
            { value: "CAT_3", label: "Cat 3 — Black Water" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Damage Class">
        <Select
          value={(data.damageClass as string) || ""}
          onChange={(v) => onChange("damageClass", v || null)}
          options={[
            { value: "CLASS_1", label: "Class 1 — Slow Evaporation" },
            { value: "CLASS_2", label: "Class 2 — Fast Evaporation" },
            { value: "CLASS_3", label: "Class 3 — Fastest Evaporation" },
            { value: "CLASS_4", label: "Class 4 — Specialty Drying" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Loss Source Type">
        <Select
          value={(data.lossSourceType as string) || ""}
          onChange={(v) => onChange("lossSourceType", v || null)}
          options={[
            { value: "PLUMBING", label: "Plumbing" },
            { value: "ROOF", label: "Roof" },
            { value: "APPLIANCE", label: "Appliance" },
            { value: "FLOOD", label: "Flood" },
            { value: "GROUNDWATER", label: "Groundwater" },
            { value: "CONDENSATION", label: "Condensation" },
            { value: "HVAC", label: "HVAC" },
            { value: "UNKNOWN", label: "Unknown" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Loss Source Identified">
        <Toggle
          value={!!data.lossSourceIdentified}
          onChange={(v) => onChange("lossSourceIdentified", v)}
        />
      </FieldRow>
      <FieldRow label="Loss Source Addressed">
        <Toggle
          value={!!data.lossSourceAddressed}
          onChange={(v) => onChange("lossSourceAddressed", v)}
        />
      </FieldRow>
      <FieldRow label="Hours of Exposure" hint="IICRC S500 §6.3">
        <Input
          type="number"
          value={(data.hoursOfExposure as number) || ""}
          onChange={(v) =>
            onChange("hoursOfExposure", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.5}
          placeholder="e.g. 24"
        />
      </FieldRow>
    </>
  );
}

function FireSmokeForm({
  data,
  onChange,
  odourOnly = false,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
  odourOnly?: boolean;
}) {
  return (
    <>
      {!odourOnly && (
        <>
          <FieldRow label="Smoke Type">
            <Select
              value={(data.smokeType as string) || ""}
              onChange={(v) => onChange("smokeType", v || null)}
              options={[
                { value: "DRY", label: "Dry — Fast-burning / high-temp" },
                { value: "WET", label: "Wet — Smouldering / low-temp" },
                { value: "PROTEIN", label: "Protein — Cooking residue" },
                { value: "OIL", label: "Oil — Furnace / heating" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Char Depth (mm)" hint="IICRC S770 §5.2">
            <Input
              type="number"
              value={(data.charDepthMm as number) || ""}
              onChange={(v) =>
                onChange("charDepthMm", v ? parseFloat(v) : null)
              }
              min={0}
              step={0.5}
              placeholder="e.g. 3.5"
            />
          </FieldRow>
          <FieldRow label="Structural Stability">
            <Select
              value={(data.structuralStability as string) || ""}
              onChange={(v) => onChange("structuralStability", v || null)}
              options={[
                { value: "SAFE", label: "Safe — No concerns" },
                {
                  value: "COMPROMISED",
                  label: "Compromised — Engineer required",
                },
                { value: "UNKNOWN", label: "Unknown — Pending assessment" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Electrical Disconnected">
            <Toggle
              value={!!data.electricalDisconnectVerified}
              onChange={(v) => onChange("electricalDisconnectVerified", v)}
            />
          </FieldRow>
          <FieldRow label="Gas Shut Off">
            <Toggle
              value={!!data.gasShutoffVerified}
              onChange={(v) => onChange("gasShutoffVerified", v)}
            />
          </FieldRow>
          <FieldRow label="Rooms Affected">
            <Input
              type="number"
              value={(data.affectedRoomsCount as number) || ""}
              onChange={(v) =>
                onChange("affectedRoomsCount", v ? parseInt(v) : null)
              }
              min={0}
              placeholder="e.g. 4"
            />
          </FieldRow>
          <FieldRow label="HVAC Contaminated">
            <Toggle
              value={!!data.hvacContaminated}
              onChange={(v) => onChange("hvacContaminated", v)}
            />
          </FieldRow>
          <FieldRow label="Contents Salvageable">
            <Toggle
              value={!!data.contentsSalvageable}
              onChange={(v) => onChange("contentsSalvageable", v)}
            />
          </FieldRow>
        </>
      )}
      <FieldRow
        label="Odour Severity"
        hint="0=None, 1=Mild, 2=Moderate, 3=Severe"
      >
        <Select
          value={
            data.odourSeverityScore != null
              ? String(data.odourSeverityScore)
              : ""
          }
          onChange={(v) =>
            onChange("odourSeverityScore", v !== "" ? parseInt(v) : null)
          }
          options={[
            { value: "0", label: "0 — None" },
            { value: "1", label: "1 — Mild" },
            { value: "2", label: "2 — Moderate" },
            { value: "3", label: "3 — Severe" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Odour Type">
        <Select
          value={(data.odourType as string) || ""}
          onChange={(v) => onChange("odourType", v || null)}
          options={[
            { value: "SMOKE", label: "Smoke" },
            { value: "SEWAGE", label: "Sewage" },
            { value: "MOULD", label: "Mould" },
            { value: "CHEMICAL", label: "Chemical" },
            { value: "DECOMPOSITION", label: "Decomposition" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </FieldRow>
      {!odourOnly && (
        <FieldRow label="Soot Index (1–10)">
          <Input
            type="number"
            value={(data.sootIndex as number) || ""}
            onChange={(v) => onChange("sootIndex", v ? parseFloat(v) : null)}
            min={1}
            max={10}
            step={0.5}
          />
        </FieldRow>
      )}
    </>
  );
}

function MouldForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="Mould Category">
        <Select
          value={(data.mouldCategory as string) || ""}
          onChange={(v) => onChange("mouldCategory", v || null)}
          options={[
            { value: "SURFACE", label: "Surface — Superficial growth" },
            { value: "STRUCTURAL", label: "Structural — Penetrated substrate" },
            { value: "SYSTEMIC", label: "Systemic — Throughout cavity" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Spore Type">
        <Select
          value={(data.sporeType as string) || ""}
          onChange={(v) => onChange("sporeType", v || null)}
          options={[
            { value: "CLADOSPORIUM", label: "Cladosporium" },
            { value: "ASPERGILLUS", label: "Aspergillus / Penicillium" },
            { value: "STACHYBOTRYS", label: "Stachybotrys (Black Mould)" },
            { value: "ALTERNARIA", label: "Alternaria" },
            { value: "OTHER", label: "Other / Mixed" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Affected Area (m²)">
        <Input
          type="number"
          value={(data.affectedAreaM2 as number) || ""}
          onChange={(v) => onChange("affectedAreaM2", v ? parseFloat(v) : null)}
          min={0}
          step={0.1}
          placeholder="e.g. 12.5"
        />
      </FieldRow>
      <FieldRow label="Moisture Source Identified">
        <Toggle
          value={!!data.moistureSourceIdentified}
          onChange={(v) => onChange("moistureSourceIdentified", v)}
        />
      </FieldRow>
      <FieldRow label="Root Cause Addressed">
        <Toggle
          value={!!data.rootCauseAddressed}
          onChange={(v) => onChange("rootCauseAddressed", v)}
        />
      </FieldRow>
      <FieldRow label="Containment Set Up">
        <Toggle
          value={!!data.containmentSetUp}
          onChange={(v) => onChange("containmentSetUp", v)}
        />
      </FieldRow>
      <FieldRow
        label="Pressure Differential (Pa)"
        hint="IICRC S520 §9 — target −2.5 Pa"
      >
        <Input
          type="number"
          value={(data.pressureDifferentialPa as number) || ""}
          onChange={(v) =>
            onChange("pressureDifferentialPa", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.1}
          placeholder="e.g. −2.5"
        />
      </FieldRow>
      <FieldRow label="Air Changes / Hour" hint="IICRC S520 — minimum 6">
        <Input
          type="number"
          value={(data.airChangesPerHour as number) || ""}
          onChange={(v) =>
            onChange("airChangesPerHour", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.5}
          placeholder="e.g. 6"
        />
      </FieldRow>
      <FieldRow label="Clearance Test Required">
        <Toggle
          value={!!data.clearanceTestRequired}
          onChange={(v) => onChange("clearanceTestRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Spore Count Pre (spores/m³)">
        <Input
          type="number"
          value={(data.sporeCountPreRemediation as number) || ""}
          onChange={(v) =>
            onChange("sporeCountPreRemediation", v ? parseInt(v) : null)
          }
          min={0}
          placeholder="e.g. 5000"
        />
      </FieldRow>
      <FieldRow label="Spore Count Post (spores/m³)">
        <Input
          type="number"
          value={(data.sporeCountPostRemediation as number) || ""}
          onChange={(v) =>
            onChange("sporeCountPostRemediation", v ? parseInt(v) : null)
          }
          min={0}
          placeholder="e.g. 200"
        />
      </FieldRow>
    </>
  );
}

function StormForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="BOM Event Reference">
        <Input
          value={(data.bomEventReference as string) || ""}
          onChange={(v) => onChange("bomEventReference", v || null)}
          placeholder="e.g. IDQ20260329"
        />
      </FieldRow>
      <FieldRow label="Event Type">
        <Select
          value={(data.eventType as string) || ""}
          onChange={(v) => onChange("eventType", v || null)}
          options={[
            { value: "STORM", label: "Thunderstorm" },
            { value: "CYCLONE", label: "Cyclone / Tropical system" },
            { value: "HAIL", label: "Hailstorm" },
            { value: "DOWNBURST", label: "Downburst / Microburst" },
            { value: "TORNADO", label: "Tornado" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Wind Speed (km/h)">
        <Input
          type="number"
          value={(data.windSpeedKmh as number) || ""}
          onChange={(v) => onChange("windSpeedKmh", v ? parseFloat(v) : null)}
          min={0}
          step={1}
          placeholder="e.g. 120"
        />
      </FieldRow>
      <FieldRow label="Roof Material">
        <Select
          value={(data.roofMaterialType as string) || ""}
          onChange={(v) => onChange("roofMaterialType", v || null)}
          options={[
            { value: "COLORBOND", label: "Colorbond / Steel" },
            { value: "TERRACOTTA", label: "Terracotta / Concrete tile" },
            { value: "SHINGLES", label: "Shingles" },
            { value: "METAL", label: "Corrugated metal" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Roof Damage Area (m²)">
        <Input
          type="number"
          value={(data.roofDamageAreaM2 as number) || ""}
          onChange={(v) =>
            onChange("roofDamageAreaM2", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.5}
          placeholder="e.g. 45"
        />
      </FieldRow>
      <FieldRow label="Damage Penetration">
        <Select
          value={(data.damagePenetration as string) || ""}
          onChange={(v) => onChange("damagePenetration", v || null)}
          options={[
            { value: "SURFACE", label: "Surface — Cosmetic only" },
            { value: "PARTIAL", label: "Partial — Some penetration" },
            { value: "FULL", label: "Full — Complete breach" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Water Ingress Points">
        <Input
          value={(data.waterIngressPoints as string) || ""}
          onChange={(v) => onChange("waterIngressPoints", v || null)}
          placeholder="e.g. Ridge cap, valley, gutter joins"
        />
      </FieldRow>
      <FieldRow label="Water Category">
        <Select
          value={(data.waterCategory as string) || ""}
          onChange={(v) => onChange("waterCategory", v || null)}
          options={[
            { value: "CAT_1", label: "Cat 1 — Clean (rainwater)" },
            { value: "CAT_2", label: "Cat 2 — Grey Water" },
            { value: "CAT_3", label: "Cat 3 — Black Water" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Engineer Clearance Required">
        <Toggle
          value={!!data.engineerClearanceRequired}
          onChange={(v) => onChange("engineerClearanceRequired", v)}
        />
      </FieldRow>
      <FieldRow label="Emergency Tarping Done">
        <Toggle
          value={!!data.emergencyTarpingCompleted}
          onChange={(v) => onChange("emergencyTarpingCompleted", v)}
        />
      </FieldRow>
      {data.emergencyTarpingCompleted && (
        <FieldRow label="Tarping Area (m²)">
          <Input
            type="number"
            value={(data.emergencyTarpingM2 as number) || ""}
            onChange={(v) =>
              onChange("emergencyTarpingM2", v ? parseFloat(v) : null)
            }
            min={0}
            step={0.5}
            placeholder="e.g. 30"
          />
        </FieldRow>
      )}
      <FieldRow label="Asbestos Risk Flag">
        <Toggle
          value={!!data.asbestosRiskFlag}
          onChange={(v) => onChange("asbestosRiskFlag", v)}
        />
      </FieldRow>
    </>
  );
}

function ContentsNewItemForm({
  onAdd,
}: {
  onAdd: (item: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    itemName: "",
    itemCategory: "",
    condition: "",
    preExistingDamage: false,
    quantityAffected: 1,
    replacementValueAud: "",
  });

  const handleChange = (k: string, v: unknown) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleAdd = () => {
    if (!form.itemName || !form.condition) {
      toast.error("Item name and condition are required");
      return;
    }
    onAdd({ ...form });
    setForm({
      itemName: "",
      itemCategory: "",
      condition: "",
      preExistingDamage: false,
      quantityAffected: 1,
      replacementValueAud: "",
    });
  };

  return (
    <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-slate-700 space-y-3 mt-2">
      <p className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
        Add Pack-Out Item
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">
            Item Name *
          </label>
          <Input
            value={(form.itemName as string) || ""}
            onChange={(v) => handleChange("itemName", v)}
            placeholder="e.g. Samsung Washing Machine"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">
            Category
          </label>
          <Select
            value={(form.itemCategory as string) || ""}
            onChange={(v) => handleChange("itemCategory", v || null)}
            options={[
              { value: "APPLIANCE", label: "Appliance" },
              { value: "FURNITURE", label: "Furniture" },
              { value: "ELECTRONICS", label: "Electronics" },
              { value: "DOCUMENTS", label: "Documents" },
              { value: "CLOTHING", label: "Clothing" },
              { value: "ART", label: "Art / Collectables" },
              { value: "OTHER", label: "Other" },
            ]}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">
            Condition *
          </label>
          <Select
            value={(form.condition as string) || ""}
            onChange={(v) => handleChange("condition", v || null)}
            options={[
              { value: "RESTORABLE", label: "Restorable" },
              { value: "CLEAN_ONSITE", label: "Clean On-site" },
              { value: "PACK_OUT", label: "Pack Out" },
              { value: "TOTAL_LOSS", label: "Total Loss" },
            ]}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">
            Replacement Value (AUD)
          </label>
          <Input
            type="number"
            value={(form.replacementValueAud as number) || ""}
            onChange={(v) =>
              handleChange("replacementValueAud", v ? parseFloat(v) : null)
            }
            min={0}
            step={10}
            placeholder="e.g. 850"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">
            Quantity
          </label>
          <Input
            type="number"
            value={(form.quantityAffected as number) || 1}
            onChange={(v) =>
              handleChange("quantityAffected", v ? parseInt(v) : 1)
            }
            min={1}
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-neutral-500">
            Pre-existing damage
          </label>
          <Toggle
            value={!!form.preExistingDamage}
            onChange={(v) => handleChange("preExistingDamage", v)}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors"
      >
        Add Item
      </button>
    </div>
  );
}

function BiohazardForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="Biohazard Type">
        <Select
          value={(data.biohazardType as string) || ""}
          onChange={(v) => onChange("biohazardType", v || null)}
          options={[
            { value: "SEWAGE_CAT3", label: "Sewage (Cat 3)" },
            { value: "BLOOD", label: "Blood" },
            { value: "BODILY_FLUIDS", label: "Bodily Fluids" },
            { value: "CRIME_SCENE", label: "Crime Scene" },
            { value: "UNATTENDED_DEATH", label: "Unattended Death" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Contamination Area (m²)">
        <Input
          type="number"
          value={(data.contaminationAreaM2 as number) || ""}
          onChange={(v) =>
            onChange("contaminationAreaM2", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.1}
          placeholder="e.g. 8.5"
        />
      </FieldRow>
      <FieldRow
        label="ATP Reading Pre (RLU)"
        hint="IICRC S540 — ≤100 general; ≤25 food-contact"
      >
        <Input
          type="number"
          value={(data.atpReadingPre as number) || ""}
          onChange={(v) => onChange("atpReadingPre", v ? parseFloat(v) : null)}
          min={0}
          placeholder="e.g. 450"
        />
      </FieldRow>
      <FieldRow label="ATP Reading Post (RLU)">
        <Input
          type="number"
          value={(data.atpReadingPost as number) || ""}
          onChange={(v) => onChange("atpReadingPost", v ? parseFloat(v) : null)}
          min={0}
          placeholder="e.g. 22"
        />
      </FieldRow>
      <FieldRow label="SWMS Completed">
        <Toggle
          value={!!data.swmsCompleted}
          onChange={(v) => onChange("swmsCompleted", v)}
        />
      </FieldRow>
      <FieldRow label="PPE Level" hint="Safe Work Australia">
        <Select
          value={(data.ppeLevel as string) || ""}
          onChange={(v) => onChange("ppeLevel", v || null)}
          options={[
            {
              value: "LEVEL_1",
              label: "Level 1 — Minimal (gloves + surgical mask)",
            },
            { value: "LEVEL_2", label: "Level 2 — P2 respirator + coverall" },
            {
              value: "LEVEL_3",
              label: "Level 3 — Full face respirator + positive pressure",
            },
          ]}
        />
      </FieldRow>
      <FieldRow label="Waste Manifest ID">
        <Input
          value={(data.wasteDisposalManifestId as string) || ""}
          onChange={(v) => onChange("wasteDisposalManifestId", v || null)}
          placeholder="e.g. NSW-BIO-2026-0042"
        />
      </FieldRow>
      <FieldRow label="Disposal Facility Licence">
        <Input
          value={(data.disposalFacilityLicense as string) || ""}
          onChange={(v) => onChange("disposalFacilityLicense", v || null)}
          placeholder="e.g. EPL 12345"
        />
      </FieldRow>
    </>
  );
}

function CarpetForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="Fibre Type">
        <Select
          value={(data.fiberType as string) || ""}
          onChange={(v) => onChange("fiberType", v || null)}
          options={[
            { value: "WOOL", label: "Wool" },
            { value: "NYLON", label: "Nylon" },
            { value: "POLYESTER", label: "Polyester" },
            { value: "POLYPROPYLENE", label: "Polypropylene" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Pile Type">
        <Select
          value={(data.pileType as string) || ""}
          onChange={(v) => onChange("pileType", v || null)}
          options={[
            { value: "CUT", label: "Cut pile" },
            { value: "LOOP", label: "Loop pile" },
            { value: "CUT_LOOP", label: "Cut / Loop combination" },
            { value: "FRIEZE", label: "Frieze (textured)" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Standing Water (hours)">
        <Input
          type="number"
          value={(data.standingWaterHours as number) || ""}
          onChange={(v) =>
            onChange("standingWaterHours", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.5}
          placeholder="e.g. 4.5"
        />
      </FieldRow>
      <FieldRow label="Extraction Rate (L/hr)">
        <Input
          type="number"
          value={(data.extractionRateLitresPerHour as number) || ""}
          onChange={(v) =>
            onChange("extractionRateLitresPerHour", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.5}
          placeholder="e.g. 120"
        />
      </FieldRow>
      <FieldRow label="Extraction Passes">
        <Input
          type="number"
          value={(data.extractionPasses as number) || ""}
          onChange={(v) => onChange("extractionPasses", v ? parseInt(v) : null)}
          min={1}
          placeholder="e.g. 3"
        />
      </FieldRow>
      <FieldRow
        label="Residual Moisture After Extraction (%)"
        hint="IICRC S100"
      >
        <Input
          type="number"
          value={(data.residualMoisturePostExtraction as number) || ""}
          onChange={(v) =>
            onChange("residualMoisturePostExtraction", v ? parseFloat(v) : null)
          }
          min={0}
          max={100}
          step={0.1}
          placeholder="e.g. 35"
        />
      </FieldRow>
      <FieldRow label="Final Moisture (%)">
        <Input
          type="number"
          value={(data.finalMoisturePercent as number) || ""}
          onChange={(v) =>
            onChange("finalMoisturePercent", v ? parseFloat(v) : null)
          }
          min={0}
          max={100}
          step={0.1}
          placeholder="e.g. 12"
        />
      </FieldRow>
      <FieldRow label="Stain Type">
        <Input
          value={(data.stainType as string) || ""}
          onChange={(v) => onChange("stainType", v || null)}
          placeholder="e.g. Red wine, pet urine"
        />
      </FieldRow>
      <FieldRow
        label="Stain pH"
        hint="Wool ≤8.5; avoid alkaline >pH10 on polyester"
      >
        <Input
          type="number"
          value={(data.stainPH as number) || ""}
          onChange={(v) => onChange("stainPH", v ? parseFloat(v) : null)}
          min={0}
          max={14}
          step={0.1}
          placeholder="e.g. 7.2"
        />
      </FieldRow>
      <FieldRow label="Stain Removal Result">
        <Select
          value={(data.stainRemovalResult as string) || ""}
          onChange={(v) => onChange("stainRemovalResult", v || null)}
          options={[
            { value: "COMPLETE", label: "Complete — Fully removed" },
            { value: "PARTIAL", label: "Partial — Residual staining" },
            { value: "UNSUCCESSFUL", label: "Unsuccessful — Total loss" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Restoration Decision">
        <Input
          value={(data.restorationDecision as string) || ""}
          onChange={(v) => onChange("restorationDecision", v || null)}
          placeholder="e.g. Restore — Cat 1, wool, salvageable"
        />
      </FieldRow>
    </>
  );
}

function HVACForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <FieldRow label="System Inspected">
        <Toggle
          value={!!data.hvacSystemInspected}
          onChange={(v) => onChange("hvacSystemInspected", v)}
        />
      </FieldRow>
      <FieldRow label="Duct Contamination Level">
        <Select
          value={(data.ductContaminationLevel as string) || ""}
          onChange={(v) => onChange("ductContaminationLevel", v || null)}
          options={[
            { value: "NONE", label: "None" },
            { value: "LIGHT", label: "Light" },
            { value: "MODERATE", label: "Moderate" },
            { value: "HEAVY", label: "Heavy" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Visible Soot in Ducts">
        <Toggle
          value={!!data.visibleSootInDucts}
          onChange={(v) => onChange("visibleSootInDucts", v)}
        />
      </FieldRow>
      <FieldRow label="Smoke Odour in Ducts">
        <Toggle
          value={!!data.smokeOdourInDucts}
          onChange={(v) => onChange("smokeOdourInDucts", v)}
        />
      </FieldRow>
      <FieldRow label="Filter Condition">
        <Input
          value={(data.filterCondition as string) || ""}
          onChange={(v) => onChange("filterCondition", v || null)}
          placeholder="e.g. G4 filter — heavily sooted, replace"
        />
      </FieldRow>
      <FieldRow label="Coil Contamination Level">
        <Select
          value={(data.coilContaminationLevel as string) || ""}
          onChange={(v) => onChange("coilContaminationLevel", v || null)}
          options={[
            { value: "NONE", label: "None" },
            { value: "LIGHT", label: "Light" },
            { value: "MODERATE", label: "Moderate" },
            { value: "HEAVY", label: "Heavy" },
          ]}
        />
      </FieldRow>
      <FieldRow label="HVAC Cleaning Required">
        <Toggle
          value={!!data.hvacCleaningRequired}
          onChange={(v) => onChange("hvacCleaningRequired", v)}
        />
      </FieldRow>
      <FieldRow
        label="Insulation Resistance (MΩ)"
        hint="AS/NZS 3000 — minimum 1 MΩ"
      >
        <Input
          type="number"
          value={(data.insulationResistanceMegaohm as number) || ""}
          onChange={(v) =>
            onChange("insulationResistanceMegaohm", v ? parseFloat(v) : null)
          }
          min={0}
          step={0.1}
          placeholder="e.g. 100"
        />
      </FieldRow>
      <FieldRow label="Insulation Test Performed By">
        <Input
          value={(data.insulationTestPerformedBy as string) || ""}
          onChange={(v) => onChange("insulationTestPerformedBy", v || null)}
          placeholder="e.g. J. Smith — Lic. EL12345"
        />
      </FieldRow>
    </>
  );
}

function AsbestosForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
}) {
  return (
    <>
      <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 mb-4">
        <AlertTriangle
          size={14}
          className="text-rose-500 mt-0.5 flex-shrink-0"
        />
        <p className="text-xs text-rose-700 dark:text-rose-300">
          Safe Work Australia CoP 2024: for friable asbestos, Class A licence is
          mandatory. Work must halt until licensed assessor provides clearance
          certificate.
        </p>
      </div>
      <FieldRow
        label="Property Year Built"
        hint="Pre-1990 = asbestos assumed present"
      >
        <Input
          type="number"
          value={(data.propertyYearBuilt as number) || ""}
          onChange={(v) =>
            onChange("propertyYearBuilt", v ? parseInt(v) : null)
          }
          min={1800}
          max={2100}
          placeholder="e.g. 1978"
        />
      </FieldRow>
      <FieldRow label="Asbestos Risk Acknowledged">
        <Toggle
          value={!!data.asbestosRiskAcknowledged}
          onChange={(v) => onChange("asbestosRiskAcknowledged", v)}
        />
      </FieldRow>
      <FieldRow label="Friable Assessment">
        <Input
          value={(data.friableAssessment as string) || ""}
          onChange={(v) => onChange("friableAssessment", v || null)}
          placeholder="e.g. Non-friable ACM ceiling tiles, undisturbed — Class B removal"
        />
      </FieldRow>
      <FieldRow label="Work Halted">
        <Toggle
          value={!!data.workHalted}
          onChange={(v) => onChange("workHalted", v)}
        />
      </FieldRow>
      <FieldRow label="Licensed Assessor Name">
        <Input
          value={(data.licensedAssessorName as string) || ""}
          onChange={(v) => onChange("licensedAssessorName", v || null)}
          placeholder="e.g. J. Smith"
        />
      </FieldRow>
      <FieldRow label="Licensed Assessor Licence #">
        <Input
          value={(data.licensedAssessorLicense as string) || ""}
          onChange={(v) => onChange("licensedAssessorLicense", v || null)}
          placeholder="e.g. NSW-AHC-12345"
        />
      </FieldRow>
      <FieldRow label="Removal Quote (AUD)">
        <Input
          type="number"
          value={(data.removalQuoteAud as number) || ""}
          onChange={(v) =>
            onChange("removalQuoteAud", v ? parseFloat(v) : null)
          }
          min={0}
          step={100}
          placeholder="e.g. 4500"
        />
      </FieldRow>
    </>
  );
}

function AustralianComplianceForm({
  data,
  onChange,
  asbestosWarning,
}: {
  data: Record<string, unknown>;
  onChange: (k: string, v: unknown) => void;
  asbestosWarning?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-slate-800/60 hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-cyan-500" />
          <span className="text-sm font-semibold text-neutral-700 dark:text-slate-200">
            Australian Compliance
          </span>
          <span className="text-xs text-neutral-400 dark:text-slate-500">
            DR-NRPG · Insurer · Technician credentials
          </span>
        </div>
        {open ? (
          <ChevronUp size={15} className="text-neutral-400" />
        ) : (
          <ChevronDown size={15} className="text-neutral-400" />
        )}
      </button>
      {open && (
        <div className="px-4 divide-y divide-neutral-100 dark:divide-slate-800 pb-2">
          {asbestosWarning && (
            <div className="flex items-start gap-2 py-3">
              <AlertTriangle
                size={14}
                className="text-amber-500 mt-0.5 flex-shrink-0"
              />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {asbestosWarning}
              </p>
            </div>
          )}
          <FieldRow label="Insurer Name">
            <Input
              value={(data.insurerName as string) || ""}
              onChange={(v) => onChange("insurerName", v || null)}
              placeholder="e.g. Allianz"
            />
          </FieldRow>
          <FieldRow label="Claim Number">
            <Input
              value={(data.claimNumber as string) || ""}
              onChange={(v) => onChange("claimNumber", v || null)}
              placeholder="e.g. ALZ-2026-123456"
            />
          </FieldRow>
          <FieldRow label="Loss Adjuster Name">
            <Input
              value={(data.lossAdjusterName as string) || ""}
              onChange={(v) => onChange("lossAdjusterName", v || null)}
              placeholder="e.g. J. Brown"
            />
          </FieldRow>
          <FieldRow label="Loss Adjuster Reference">
            <Input
              value={(data.lossAdjusterReference as string) || ""}
              onChange={(v) => onChange("lossAdjusterReference", v || null)}
              placeholder="e.g. LAJ-2026-0042"
            />
          </FieldRow>
          <FieldRow label="DR-NRPG Category">
            <Select
              value={(data.nrpgCategory as string) || ""}
              onChange={(v) => onChange("nrpgCategory", v || null)}
              options={[
                { value: "SMALL", label: "Small — <$10k" },
                { value: "MEDIUM", label: "Medium — $10k–$50k" },
                { value: "LARGE", label: "Large — $50k–$250k" },
                { value: "CATASTROPHIC", label: "Catastrophic — >$250k" },
              ]}
            />
          </FieldRow>
          <FieldRow label="State">
            <Select
              value={(data.state as string) || ""}
              onChange={(v) => onChange("state", v || null)}
              options={[
                { value: "NSW", label: "NSW" },
                { value: "VIC", label: "VIC" },
                { value: "QLD", label: "QLD" },
                { value: "WA", label: "WA" },
                { value: "SA", label: "SA" },
                { value: "TAS", label: "TAS" },
                { value: "ACT", label: "ACT" },
                { value: "NT", label: "NT" },
              ]}
            />
          </FieldRow>
          <FieldRow label="IICRC Certified Technician">
            <Toggle
              value={!!data.iicrcCertifiedTechnician}
              onChange={(v) => onChange("iicrcCertifiedTechnician", v)}
            />
          </FieldRow>
          <FieldRow label="Technician Certification">
            <Select
              value={(data.technicianCertification as string) || ""}
              onChange={(v) => onChange("technicianCertification", v || null)}
              options={[
                { value: "WRT", label: "WRT — Water Damage" },
                { value: "ASD", label: "ASD — Applied Structural Drying" },
                { value: "CMS", label: "CMS — Commercial Drying" },
                { value: "HST", label: "HST — Health & Safety" },
                { value: "OCT", label: "OCT — Odour Control" },
                { value: "CCT", label: "CCT — Carpet Cleaning" },
                { value: "MRS", label: "MRS — Mould Remediation" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </FieldRow>
          <FieldRow label="Technician Licence Number">
            <Input
              value={(data.technicianLicenseNumber as string) || ""}
              onChange={(v) => onChange("technicianLicenseNumber", v || null)}
              placeholder="e.g. IICRC-123456"
            />
          </FieldRow>
          <FieldRow label="Separate Invoice Required">
            <Toggle
              value={data.separateInvoiceRequired !== false}
              onChange={(v) => onChange("separateInvoiceRequired", v)}
            />
          </FieldRow>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NIRClaimAssessmentPanel({
  inspectionId,
  initialClaimType,
  onClaimTypeChange,
}: NIRClaimAssessmentPanelProps) {
  const [selectedType, setSelectedType] = useState<NIRClaimType | null>(
    initialClaimType ?? null,
  );
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [contentItems, setContentItems] = useState<Record<string, unknown>[]>(
    [],
  );
  const [complianceData, setComplianceData] = useState<Record<string, unknown>>(
    {},
  );
  const [asbestosWarning, setAsbestosWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [gates, setGates] = useState<Record<string, boolean>>({});

  // ── Load assessment for a claim type ──────────────────────────────────────

  const loadAssessment = useCallback(
    async (type: NIRClaimType) => {
      const meta = CLAIM_TYPES.find((c) => c.type === type);
      if (!meta) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/${meta.route}`,
        );
        if (res.ok) {
          const record = await res.json();
          if (record && type !== "CONTENTS") {
            setFormData(record);
            // Extract gate fields from record
            const g: Record<string, boolean> = {};
            for (const [k, v] of Object.entries(record)) {
              if (k.startsWith("gate") && typeof v === "boolean") g[k] = v;
            }
            setGates(g);
          }
          if (type === "CONTENTS" && Array.isArray(record?.items)) {
            setContentItems(record.items);
          }
        } else {
          // 404 = no record yet; reset form
          setFormData({});
          setGates({});
          if (type === "CONTENTS") setContentItems([]);
        }
      } catch {
        // Network error — continue with empty form
      } finally {
        setLoading(false);
      }
    },
    [inspectionId],
  );

  // ── Load Australian Compliance ─────────────────────────────────────────────

  const loadCompliance = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/australian-compliance`,
      );
      if (res.ok) {
        const record = await res.json();
        if (record) setComplianceData(record);
      }
    } catch {
      // ignore
    }
  }, [inspectionId]);

  useEffect(() => {
    if (initialClaimType) {
      loadAssessment(initialClaimType);
    }
    loadCompliance();
  }, [initialClaimType, loadAssessment, loadCompliance]);

  const handleTypeSelect = (type: NIRClaimType) => {
    setSelectedType(type);
    setFormData({});
    setGates({});
    loadAssessment(type);
    onClaimTypeChange?.(type);
  };

  const handleFieldChange = (k: string, v: unknown) => {
    setFormData((prev) => ({ ...prev, [k]: v }));
  };

  // ── Save assessment ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedType) return;
    const meta = CLAIM_TYPES.find((c) => c.type === selectedType);
    if (!meta) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/${meta.route}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        },
      );
      if (res.ok) {
        const record = await res.json();
        const g: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(record)) {
          if (k.startsWith("gate") && typeof v === "boolean") g[k] = v;
        }
        setGates(g);
        if (record.asbestosWarning) setAsbestosWarning(record.asbestosWarning);
        toast.success("Assessment saved");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  // ── Save compliance ────────────────────────────────────────────────────────

  const handleSaveCompliance = async () => {
    setSavingCompliance(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/australian-compliance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(complianceData),
        },
      );
      if (res.ok) {
        const record = await res.json();
        if (record.asbestosWarning) setAsbestosWarning(record.asbestosWarning);
        toast.success("Compliance record saved");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save compliance");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingCompliance(false);
    }
  };

  // ── Add contents item ───────────────────────────────────────────────────────

  const handleAddContentItem = async (item: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/contents-pack-out`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        },
      );
      if (res.ok) {
        const created = await res.json();
        setContentItems((prev) => [...prev, created]);
        toast.success("Item added");
      } else {
        toast.error("Failed to add item");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  // ── Gate labels ────────────────────────────────────────────────────────────

  const GATE_LABELS: Record<string, string> = {
    gateClassificationComplete: "Classification",
    gateLossSourceComplete: "Loss Source",
    gatePhotosAttached: "≥3 Photos",
    gateStructuralCleared: "Structural Safe",
    gateElectricalCleared: "Electrical OK",
    gateMoistureSourceFixed: "Moisture Source Fixed",
    gateContainmentSufficient: "Containment OK",
  };

  const currentMeta = CLAIM_TYPES.find((c) => c.type === selectedType);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Claim type selector */}
      <div>
        <p className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          Claim Type
        </p>
        <div className="flex flex-wrap gap-2">
          {CLAIM_TYPES.map((ct) => {
            const Icon = ct.icon;
            const isSelected = selectedType === ct.type;
            const colorCls = isSelected
              ? COLOR_MAP[ct.color]
              : "bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 hover:bg-neutral-200 dark:hover:bg-slate-700";
            return (
              <button
                key={ct.type}
                type="button"
                onClick={() => handleTypeSelect(ct.type)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  colorCls,
                  isSelected && "ring-2",
                )}
              >
                <Icon size={13} />
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gate status badges (only when there are gates) */}
      {Object.keys(gates).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(gates).map(([k, v]) => (
            <GateBadge key={k} ok={v} label={GATE_LABELS[k] ?? k} />
          ))}
        </div>
      )}

      {/* Assessment form */}
      {selectedType && (
        <div className="rounded-xl border border-neutral-200 dark:border-slate-700 overflow-hidden">
          <div
            className={cn(
              "px-4 py-3 flex items-center gap-2",
              `bg-${currentMeta?.color}-50 dark:bg-${currentMeta?.color}-900/10`,
            )}
          >
            {currentMeta && (
              <currentMeta.icon
                size={15}
                className={`text-${currentMeta.color}-500`}
              />
            )}
            <span className="text-sm font-semibold text-neutral-700 dark:text-slate-200">
              {currentMeta?.label} Assessment
            </span>
            {loading && (
              <Loader2
                size={13}
                className="animate-spin text-neutral-400 ml-auto"
              />
            )}
          </div>

          <div className="px-4 divide-y divide-neutral-100 dark:divide-slate-800 pb-2">
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-neutral-300" />
              </div>
            ) : (
              <>
                {selectedType === "WATER" && (
                  <WaterForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "FIRE" && (
                  <FireSmokeForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "ODOUR" && (
                  <FireSmokeForm
                    data={formData}
                    onChange={handleFieldChange}
                    odourOnly
                  />
                )}
                {selectedType === "MOULD" && (
                  <MouldForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "STORM" && (
                  <StormForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "CONTENTS" && (
                  <div className="py-3 space-y-3">
                    {contentItems.length > 0 ? (
                      <div className="space-y-1.5">
                        {contentItems.map((item, i) => (
                          <div
                            key={(item.id as string) || i}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-50 dark:bg-slate-800/60 text-sm"
                          >
                            <div>
                              <span className="font-medium text-neutral-700 dark:text-slate-200">
                                {item.itemName as string}
                              </span>
                              {item.itemCategory != null && (
                                <span className="ml-2 text-xs text-neutral-400">
                                  {(item.itemCategory as string).toLowerCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-neutral-500">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full font-medium",
                                  item.condition === "TOTAL_LOSS"
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                    : item.condition === "PACK_OUT"
                                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                                      : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                                )}
                              >
                                {(item.condition as string)?.replace(/_/g, " ")}
                              </span>
                              {item.replacementValueAud != null && (
                                <span>
                                  $
                                  {(
                                    item.replacementValueAud as number
                                  ).toLocaleString("en-AU")}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400 text-center py-4">
                        No contents items yet.
                      </p>
                    )}
                    <ContentsNewItemForm onAdd={handleAddContentItem} />
                  </div>
                )}
                {selectedType === "BIOHAZARD" && (
                  <BiohazardForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "CARPET" && (
                  <CarpetForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "HVAC" && (
                  <HVACForm data={formData} onChange={handleFieldChange} />
                )}
                {selectedType === "ASBESTOS" && (
                  <AsbestosForm data={formData} onChange={handleFieldChange} />
                )}
              </>
            )}
          </div>

          {/* Save button — not for CONTENTS (it uses per-item saves) */}
          {selectedType !== "CONTENTS" && (
            <div className="px-4 py-3 border-t border-neutral-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving ? "Saving…" : "Save Assessment"}
              </button>
            </div>
          )}
        </div>
      )}

      {!selectedType && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-neutral-50 dark:bg-slate-800/60 text-sm text-neutral-400">
          <Info size={15} />
          Select a claim type above to enter the assessment data.
        </div>
      )}

      {/* Australian Compliance (always visible) */}
      <AustralianComplianceForm
        data={complianceData}
        onChange={(k, v) => setComplianceData((p) => ({ ...p, [k]: v }))}
        asbestosWarning={asbestosWarning}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSaveCompliance}
          disabled={savingCompliance}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {savingCompliance ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {savingCompliance ? "Saving…" : "Save Compliance Record"}
        </button>
      </div>
    </div>
  );
}
