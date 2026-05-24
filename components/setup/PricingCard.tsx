"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSetupStore } from "./store";

interface RateRow {
  key: string;
  label: string;
  prefix?: string;
  suffix?: string;
}

const COMPACT_ROWS: RateRow[] = [
  {
    key: "masterQualifiedNormalHours",
    label: "Master tech",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "qualifiedTechnicianNormalHours",
    label: "Qualified tech",
    prefix: "$",
    suffix: "/hr",
  },
  { key: "labourerNormalHours", label: "Labourer", prefix: "$", suffix: "/hr" },
  {
    key: "airMoverAxialDailyRate",
    label: "Air mover (axial)",
    prefix: "$",
    suffix: "/day",
  },
  {
    key: "dehumidifierLGRDailyRate",
    label: "Dehumidifier (LGR)",
    prefix: "$",
    suffix: "/day",
  },
  { key: "administrationFee", label: "Admin fee", prefix: "$" },
  { key: "callOutFee", label: "Call-out fee", prefix: "$" },
  { key: "afterHoursMultiplier", label: "After-hours rate", suffix: "x" },
];

const ALL_ROWS: RateRow[] = [
  ...COMPACT_ROWS,
  { key: "saturdayMultiplier", label: "Saturday rate", suffix: "x" },
  { key: "sundayMultiplier", label: "Sunday rate", suffix: "x" },
  { key: "publicHolidayMultiplier", label: "Public holiday rate", suffix: "x" },
  {
    key: "masterQualifiedSaturday",
    label: "Master tech (Sat)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "masterQualifiedSunday",
    label: "Master tech (Sun)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "qualifiedTechnicianSaturday",
    label: "Qualified tech (Sat)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "qualifiedTechnicianSunday",
    label: "Qualified tech (Sun)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "labourerSaturday",
    label: "Labourer (Sat)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "labourerSunday",
    label: "Labourer (Sun)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "airMoverCentrifugalDailyRate",
    label: "Air mover (centrifugal)",
    prefix: "$",
    suffix: "/day",
  },
  {
    key: "dehumidifierDesiccantDailyRate",
    label: "Dehumidifier (desiccant)",
    prefix: "$",
    suffix: "/day",
  },
  {
    key: "afdUnitLargeDailyRate",
    label: "AFD / negative air",
    prefix: "$",
    suffix: "/day",
  },
  {
    key: "extractionTruckMountedHourlyRate",
    label: "Extraction (truck-mounted)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "extractionElectricHourlyRate",
    label: "Extraction (electric)",
    prefix: "$",
    suffix: "/hr",
  },
  {
    key: "injectionDryingSystemDailyRate",
    label: "Injection drying system",
    prefix: "$",
    suffix: "/day",
  },
  {
    key: "hepaVacuumDailyRate",
    label: "HEPA vacuum",
    prefix: "$",
    suffix: "/day",
  },
  { key: "mobilisationFee", label: "Mobilisation fee", prefix: "$" },
  {
    key: "thermalCameraUseCostPerAssessment",
    label: "Thermal camera (per assessment)",
    prefix: "$",
  },
  {
    key: "antimicrobialTreatmentRate",
    label: "Antimicrobial treatment",
    prefix: "$",
    suffix: "/sqm",
  },
  {
    key: "mouldRemediationTreatmentRate",
    label: "Mould remediation",
    prefix: "$",
    suffix: "/sqm",
  },
  {
    key: "biohazardTreatmentRate",
    label: "Biohazard treatment",
    prefix: "$",
    suffix: "/sqm",
  },
  { key: "projectManagementPercent", label: "Project mgmt", suffix: "%" },
];

async function patchPricing(key: string, value: number): Promise<void> {
  await fetch("/api/setup/pricing", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
}

export function PricingCard() {
  const status = useSetupStore((s) => s.sections.pricing);
  const org = useSetupStore((s) => s.org);
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Populate values from the org's hydrated pricingConfig once available.
  useEffect(() => {
    const cfg = org?.pricingConfig;
    if (cfg && typeof cfg === "object") {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (typeof v === "number" && Number.isFinite(v)) next[k] = String(v);
      }
      setValues(next);
    }
  }, [org?.pricingConfig]);

  const handleBlur = async (key: string, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await patchPricing(key, n);
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  };

  const rows = expanded ? ALL_ROWS : COMPACT_ROWS;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your pricing structure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "pending" && (
          <p className="text-sm text-muted-foreground">
            Waiting for your business details…
          </p>
        )}

        {status === "running" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground animate-pulse">
              Calculating defaults for your state…
            </p>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-4 bg-muted rounded animate-pulse w-20" />
              </div>
            ))}
          </div>
        )}

        {(status === "ready" || status === "manual") && (
          <>
            <p className="text-sm text-muted-foreground">
              We&apos;ve prefilled industry defaults. Click any rate to adjust.
            </p>
            <table className="w-full text-sm" id="pricing-all-rates">
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{row.label}</td>
                    <td className="py-2 text-right">
                      <span className="text-muted-foreground text-xs mr-1">
                        {row.prefix}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={values[row.key] ?? ""}
                        onChange={(e) =>
                          setValues((p) => ({
                            ...p,
                            [row.key]: e.target.value,
                          }))
                        }
                        onBlur={(e) => void handleBlur(row.key, e.target.value)}
                        className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label={row.label}
                      />
                      <span className="text-muted-foreground text-xs ml-1">
                        {row.suffix}
                      </span>
                      {saving[row.key] && (
                        <span className="text-xs text-muted-foreground ml-2">
                          saving…
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls="pricing-all-rates"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide advanced rates" : "Show all rates"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
