"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Info, Loader2, Save } from "lucide-react";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";

// ─── Constants ──────────────────────────────────────────────────────────────────
//
// RA-848 optional fields: NRPG range is guidance only. Out-of-range values
// trigger a client-side acknowledgement dialog but are NOT hard-blocked by
// the API (unlike the 23 required labour/equipment/chemical/fee fields).

const SOFT_WARN_FIELDS = new Set([
  "negativeAirMachineDailyRate",
  "hepaVacuumDailyRate",
  "mobilisationFee",
  "monitoringVisitDailyRate",
  "photoDocumentationFee",
  "projectManagementPercent",
  "afterHoursMultiplier",
  "saturdayMultiplier",
  "sundayMultiplier",
  "publicHolidayMultiplier",
  "wasteDisposalPerBinRate",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────────

function nrpgRangeLabel(fieldKey: string): string {
  const range = NRPG_RATE_RANGES[fieldKey];
  if (!range) return "";
  if (range.unit === "x") return `NRPG ${range.min}×–${range.max}×`;
  if (range.unit === "%") return `NRPG ${range.min}–${range.max}%`;
  // unit is "$", "$/hr", "$/day", "$/visit", "$/bin", etc.
  const suffix = range.unit.startsWith("$") ? range.unit.slice(1) : "";
  return `NRPG $${range.min}–$${range.max}${suffix}`;
}

function nrpgAvgLabel(fieldKey: string): string {
  const range = NRPG_RATE_RANGES[fieldKey];
  if (!range) return "";
  const avg = (range.min + range.max) / 2;
  if (range.unit === "x") return `Industry avg ${avg.toFixed(2)}×`;
  if (range.unit === "%") return `Industry avg ${avg.toFixed(1)}%`;
  const formatted = avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(2);
  return `Industry avg $${formatted}`;
}

function isOutOfNrpgRange(fieldKey: string, value: string): boolean {
  const range = NRPG_RATE_RANGES[fieldKey];
  if (!range) return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  return num < range.min || num > range.max;
}

// ─── RateField component ────────────────────────────────────────────────────────

interface RateFieldProps {
  fieldKey: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function RateField({ fieldKey, label, value, onChange }: RateFieldProps) {
  const range = NRPG_RATE_RANGES[fieldKey];
  const outOfRange = isOutOfNrpgRange(fieldKey, value);
  const isMultiplier = range?.unit === "x";
  const isPercent = range?.unit === "%";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {range && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">{nrpgAvgLabel(fieldKey)}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          {isMultiplier && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
              ×
            </span>
          )}
          {!isMultiplier && !isPercent && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
              $
            </span>
          )}
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            step="0.01"
            min="0"
            className={[
              "w-36",
              !isPercent ? "pl-7" : "",
              isPercent ? "pr-7" : "",
              outOfRange
                ? "border-amber-500 focus-visible:ring-amber-500/50"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
          {isPercent && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
              %
            </span>
          )}
        </div>

        {range && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {nrpgRangeLabel(fieldKey)}
          </Badge>
        )}
      </div>

      {outOfRange && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {SOFT_WARN_FIELDS.has(fieldKey)
            ? "Outside NRPG guidance — save with acknowledgement to override"
            : "Outside NRPG range — API will reject this value"}
        </p>
      )}
    </div>
  );
}

// ─── Form defaults ──────────────────────────────────────────────────────────────

const FIELD_DEFAULTS: Record<string, number> = {
  // Labour
  masterQualifiedNormalHours: 85,
  masterQualifiedSaturday: 127.5,
  masterQualifiedSunday: 170,
  qualifiedTechnicianNormalHours: 65,
  qualifiedTechnicianSaturday: 97.5,
  qualifiedTechnicianSunday: 130,
  labourerNormalHours: 45,
  labourerSaturday: 67.5,
  labourerSunday: 90,
  // Equipment
  airMoverAxialDailyRate: 25,
  airMoverCentrifugalDailyRate: 35,
  dehumidifierLGRDailyRate: 45,
  dehumidifierDesiccantDailyRate: 65,
  afdUnitLargeDailyRate: 40,
  extractionTruckMountedHourlyRate: 120,
  extractionElectricHourlyRate: 80,
  injectionDryingSystemDailyRate: 150,
  // Equipment — RA-848 new (NRPG midpoints)
  negativeAirMachineDailyRate: 117.5,
  hepaVacuumDailyRate: 62.5,
  // Chemical
  antimicrobialTreatmentRate: 8.5,
  mouldRemediationTreatmentRate: 15,
  biohazardTreatmentRate: 25,
  // Prelims & Fees
  administrationFee: 250,
  callOutFee: 150,
  thermalCameraUseCostPerAssessment: 75,
  // Prelims & Fees — RA-848 new
  mobilisationFee: 275,
  monitoringVisitDailyRate: 152.5,
  photoDocumentationFee: 172.5,
  projectManagementPercent: 10,
  // Time Multipliers — RA-848 new
  afterHoursMultiplier: 1.625,
  saturdayMultiplier: 1.5,
  sundayMultiplier: 1.875,
  publicHolidayMultiplier: 2.5,
  // Disposal — RA-848 new
  wasteDisposalPerBinRate: 465,
};

function configToForm(config: Record<string, unknown>): Record<string, string> {
  const form: Record<string, string> = {};
  for (const [key, def] of Object.entries(FIELD_DEFAULTS)) {
    const val = config[key];
    form[key] = (typeof val === "number" ? val : def).toString();
  }
  return form;
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function PricingSettingsPage() {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(FIELD_DEFAULTS).map(([k, v]) => [k, v.toString()]),
    ),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/pricing-config")
      .then((r) => r.json())
      .then(
        (json: {
          pricingConfig?: Record<string, unknown>;
          defaults?: Record<string, unknown>;
        }) => {
          const config = json.pricingConfig ?? json.defaults ?? {};
          setForm(configToForm(config));
        },
      )
      .catch(() => toast.error("Failed to load pricing configuration"))
      .finally(() => setLoading(false));
  }, []);

  // Returns props for a RateField — fieldKey, value, and onChange handler.
  function field(key: string) {
    return {
      fieldKey: key,
      value: form[key] ?? (FIELD_DEFAULTS[key] ?? 0).toString(),
      onChange: (val: string) => setForm((prev) => ({ ...prev, [key]: val })),
    };
  }

  async function doSave() {
    setSaving(true);
    const toastId = toast.loading("Saving…");
    const payload: Record<string, number> = {};
    for (const [key, val] of Object.entries(form)) {
      const num = parseFloat(val);
      if (!isNaN(num)) payload[key] = num;
    }
    try {
      const res = await fetch("/api/pricing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Pricing configuration saved", { id: toastId });
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "Failed to save", { id: toastId });
      }
    } catch {
      toast.error("Network error — please retry", { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    const outOfRange = [...SOFT_WARN_FIELDS].filter((key) =>
      isOutOfNrpgRange(key, form[key] ?? ""),
    );
    if (outOfRange.length > 0) {
      setPendingOverride(outOfRange);
    } else {
      void doSave();
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Company Pricing Config</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your company rates. NRPG ranges are guidance — values outside
            the range show a warning but are not hard-blocked.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={[
          "labour",
          "equipment",
          "chemical",
          "prelims",
          "multipliers",
          "disposal",
        ]}
        className="divide-y rounded-lg border"
      >
        {/* ── Labour Rates ──────────────────────────────────────────────── */}
        <AccordionItem value="labour" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Labour Rates
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              <RateField
                label="Master Tech — Normal"
                {...field("masterQualifiedNormalHours")}
              />
              <RateField
                label="Master Tech — Saturday"
                {...field("masterQualifiedSaturday")}
              />
              <RateField
                label="Master Tech — Sunday"
                {...field("masterQualifiedSunday")}
              />
              <RateField
                label="Qualified Tech — Normal"
                {...field("qualifiedTechnicianNormalHours")}
              />
              <RateField
                label="Qualified Tech — Saturday"
                {...field("qualifiedTechnicianSaturday")}
              />
              <RateField
                label="Qualified Tech — Sunday"
                {...field("qualifiedTechnicianSunday")}
              />
              <RateField
                label="Labourer — Normal"
                {...field("labourerNormalHours")}
              />
              <RateField
                label="Labourer — Saturday"
                {...field("labourerSaturday")}
              />
              <RateField
                label="Labourer — Sunday"
                {...field("labourerSunday")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Equipment Rates ───────────────────────────────────────────── */}
        <AccordionItem value="equipment" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Equipment Rates
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              <RateField
                label="Air Mover (Axial)"
                {...field("airMoverAxialDailyRate")}
              />
              <RateField
                label="Air Mover (Centrifugal)"
                {...field("airMoverCentrifugalDailyRate")}
              />
              <RateField
                label="Dehumidifier (LGR)"
                {...field("dehumidifierLGRDailyRate")}
              />
              <RateField
                label="Dehumidifier (Desiccant)"
                {...field("dehumidifierDesiccantDailyRate")}
              />
              <RateField
                label="AFD Unit (Large)"
                {...field("afdUnitLargeDailyRate")}
              />
              <RateField
                label="Extraction (Truck-Mounted)"
                {...field("extractionTruckMountedHourlyRate")}
              />
              <RateField
                label="Extraction (Electric)"
                {...field("extractionElectricHourlyRate")}
              />
              <RateField
                label="Injection Drying System"
                {...field("injectionDryingSystemDailyRate")}
              />
              {/* RA-848 new equipment fields */}
              <RateField
                label="Negative Air Machine"
                {...field("negativeAirMachineDailyRate")}
              />
              <RateField
                label="HEPA Vacuum"
                {...field("hepaVacuumDailyRate")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Chemical Treatment Rates ──────────────────────────────────── */}
        <AccordionItem value="chemical" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Chemical Treatment Rates
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              <RateField
                label="Antimicrobial (per m²)"
                {...field("antimicrobialTreatmentRate")}
              />
              <RateField
                label="Mould Remediation (per m²)"
                {...field("mouldRemediationTreatmentRate")}
              />
              <RateField
                label="Biohazard (per m²)"
                {...field("biohazardTreatmentRate")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Prelims & Fees (new section — RA-848) ────────────────────── */}
        <AccordionItem value="prelims" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Prelims &amp; Fees
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              <RateField
                label="Administration Fee"
                {...field("administrationFee")}
              />
              <RateField label="Call-Out Fee" {...field("callOutFee")} />
              <RateField
                label="Thermal Camera Assessment"
                {...field("thermalCameraUseCostPerAssessment")}
              />
              {/* RA-848 new prelims fields */}
              <RateField
                label="Mobilisation Fee"
                {...field("mobilisationFee")}
              />
              <RateField
                label="Monitoring Visit"
                {...field("monitoringVisitDailyRate")}
              />
              <RateField
                label="Photo Documentation Fee"
                {...field("photoDocumentationFee")}
              />
              <RateField
                label="Project Management %"
                {...field("projectManagementPercent")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Time Multipliers (new section — RA-848) ───────────────────── */}
        <AccordionItem value="multipliers" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Time Multipliers
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              <RateField
                label="After Hours"
                {...field("afterHoursMultiplier")}
              />
              <RateField label="Saturday" {...field("saturdayMultiplier")} />
              <RateField label="Sunday" {...field("sundayMultiplier")} />
              <RateField
                label="Public Holiday"
                {...field("publicHolidayMultiplier")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Disposal (new section — RA-848) ──────────────────────────── */}
        <AccordionItem value="disposal" className="border-b-0 px-4">
          <AccordionTrigger className="text-base font-medium">
            Disposal
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2">
              <RateField
                label="Waste Disposal (per bin)"
                {...field("wasteDisposalPerBinRate")}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Bottom save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      {/* Override confirmation dialog for RA-848 optional fields */}
      <AlertDialog
        open={pendingOverride.length > 0}
        onOpenChange={(open) => {
          if (!open) setPendingOverride([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Outside NRPG guidance range
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following fields have values outside the NRPG recommended
              range. These rates may affect insurer acceptance. You can save
              anyway or go back to review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 px-6 pb-2 text-sm">
            {pendingOverride.map((key) => {
              const range = NRPG_RATE_RANGES[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 text-amber-700"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {range?.label ?? key} — {nrpgRangeLabel(key)}
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Review values</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingOverride([]);
                void doSave();
              }}
            >
              I acknowledge — save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
