"use client";

/**
 * AssessmentDomainCard — RA-1717 UI client component.
 *
 * One card per domain. Renders domain-specific option fields, posts
 * to /api/inspections/[id]/assessments/[type]/generate, and shows
 * either the persisted-most-recent metadata or the freshly-generated
 * artefact summary inline.
 */

import { useState } from "react";
import type { AssessmentDomain } from "@/lib/assessments/types";
import AssessmentResultDisplay, {
  type GenerateResultPayload,
} from "./AssessmentResultDisplay";

interface LatestSummary {
  id: string;
  generatedAt: Date;
  modelUsed: string | null;
}

interface Props {
  inspectionId: string;
  domain: AssessmentDomain;
  label: string;
  latest: LatestSummary | null;
}

// Per-domain options the form needs to capture.
type Field =
  | {
      kind: "select";
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      required?: boolean;
      defaultValue?: number;
    }
  | {
      kind: "boolean";
      key: string;
      label: string;
      defaultValue?: boolean;
    };

const DOMAIN_FIELDS: Record<AssessmentDomain, Field[]> = {
  WATER: [
    // WATER auto-derives from inspection state; no options needed.
  ],
  MOULD: [
    {
      kind: "select",
      key: "condition",
      label: "Condition (S520)",
      required: true,
      options: [
        { value: "CONDITION_2", label: "Condition 2 (settled spores)" },
        { value: "CONDITION_3", label: "Condition 3 (active growth)" },
      ],
    },
    {
      kind: "number",
      key: "ambientRelativeHumidity",
      label: "Ambient RH (%)",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 60,
    },
  ],
  BIOHAZARD: [
    {
      kind: "select",
      key: "biohazardType",
      label: "Biohazard type",
      required: true,
      options: [
        { value: "sewage_overflow", label: "Sewage overflow (Cat-3)" },
        { value: "decomposition", label: "Decomposition" },
        { value: "chemical_spill", label: "Chemical spill" },
        { value: "blood_trauma", label: "Blood / trauma" },
      ],
    },
  ],
  FIRE_SMOKE: [
    {
      kind: "select",
      key: "smokeType",
      label: "Smoke type",
      required: true,
      options: [
        { value: "wet", label: "Wet smoke" },
        { value: "dry", label: "Dry smoke" },
        { value: "protein", label: "Protein smoke" },
        { value: "fuel_oil", label: "Fuel-oil smoke" },
      ],
    },
    {
      kind: "select",
      key: "charLevel",
      label: "Char level",
      required: true,
      options: [
        { value: "1", label: "1 — surface scorching" },
        { value: "2", label: "2 — superficial burn" },
        { value: "3", label: "3 — significant burn" },
        { value: "4", label: "4 — heavy structural" },
      ],
    },
  ],
  STORM: [
    {
      kind: "select",
      key: "entryType",
      label: "Entry pathway",
      required: true,
      options: [
        { value: "roof_penetration", label: "Roof penetration" },
        { value: "stormwater_ingress", label: "Stormwater ingress" },
        { value: "wind_driven_rain", label: "Wind-driven rain" },
        { value: "flash_flood", label: "Flash flood" },
      ],
    },
    {
      kind: "select",
      key: "waterCategory",
      label: "Declared water category",
      required: true,
      options: [
        { value: "1", label: "Cat 1 — clean water" },
        { value: "2", label: "Cat 2 — grey water" },
        { value: "3", label: "Cat 3 — black water" },
      ],
    },
  ],
  HVAC: [
    {
      kind: "select",
      key: "systemType",
      label: "System type",
      required: true,
      options: [
        { value: "split", label: "Split system" },
        { value: "ducted_residential", label: "Ducted residential" },
        { value: "commercial_cav", label: "Commercial CAV" },
        { value: "commercial_vav", label: "Commercial VAV" },
        { value: "evaporative", label: "Evaporative" },
      ],
    },
    {
      kind: "select",
      key: "condition",
      label: "Condition",
      required: true,
      options: [
        { value: "CLEAN", label: "Clean (routine)" },
        { value: "DUST_ACCUMULATION", label: "Dust accumulation" },
        { value: "MICROBIAL_GROWTH", label: "Microbial growth" },
        { value: "FIRE_SMOKE_RESIDUE", label: "Fire/smoke residue" },
      ],
    },
    {
      kind: "number",
      key: "ductLinearMetres",
      label: "Duct linear metres",
      min: 0,
      step: 1,
    },
    {
      kind: "number",
      key: "areaServedM2",
      label: "Area served (m²)",
      min: 0,
      step: 1,
    },
  ],
  AUSTRALIAN_COMPLIANCE: [
    {
      kind: "boolean",
      key: "hasLabourHire",
      label: "Includes labour-hire engagement",
    },
    {
      kind: "boolean",
      key: "hasBiohazard",
      label: "Includes biohazard waste",
    },
  ],
};

export default function AssessmentDomainCard({
  inspectionId,
  domain,
  label,
  latest,
}: Props) {
  const fields = DOMAIN_FIELDS[domain];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.kind === "boolean") init[f.key] = f.defaultValue ?? false;
      else if (f.kind === "number" && f.defaultValue !== undefined) {
        init[f.key] = f.defaultValue;
      } else if (f.kind === "select" && f.defaultValue) {
        init[f.key] = f.defaultValue;
      }
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhanceWithAi, setEnhanceWithAi] = useState(false);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Coerce charLevel + waterCategory string→number for the API contract.
      const body: Record<string, unknown> = { ...values };
      if (domain === "FIRE_SMOKE" && typeof body.charLevel === "string") {
        body.charLevel = parseInt(body.charLevel, 10);
      }
      if (domain === "STORM" && typeof body.waterCategory === "string") {
        body.waterCategory = parseInt(body.waterCategory, 10);
      }
      if (enhanceWithAi) body.enhanceWithAi = true;
      const r = await fetch(
        `/api/inspections/${encodeURIComponent(inspectionId)}/assessments/${domain}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await r.json()) as
        | GenerateResultPayload
        | { error?: string; code?: string };
      if (!r.ok) {
        const msg =
          (json as { error?: string }).error ?? `Generate failed (${r.status})`;
        setError(msg);
        return;
      }
      setResult(json as GenerateResultPayload);
    } catch (err) {
      setError((err as Error).message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const isWater = domain === "WATER";
  const isAusCompliance = domain === "AUSTRALIAN_COMPLIANCE";

  return (
    <div className="rounded-md border p-4 space-y-3 bg-background">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          {latest ? (
            <p className="text-xs text-muted-foreground">
              Last generated{" "}
              {new Date(latest.generatedAt).toISOString().slice(0, 10)}
              {latest.modelUsed ? ` · ${latest.modelUsed}` : " · rule-based"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Not generated yet</p>
          )}
        </div>
        <code className="text-[10px] font-mono text-muted-foreground">
          {domain}
        </code>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        {isWater ? (
          <p className="text-xs text-muted-foreground">
            Auto-derives Category + Class from the inspection&apos;s
            classification + affected-area data. No options required.
          </p>
        ) : isAusCompliance ? (
          <p className="text-xs text-muted-foreground">
            Toggle the flags to include conditional sections.
          </p>
        ) : null}

        {fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(v) => setField(field.key, v)}
          />
        ))}

        <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <input
            type="checkbox"
            checked={enhanceWithAi}
            onChange={(e) => setEnhanceWithAi(e.target.checked)}
          />
          <span>
            Enhance prose with AI (Claude Haiku · ~$0.005 · workspace budget
            enforced)
          </span>
        </label>

        <div className="flex flex-wrap gap-2 items-center pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded bg-foreground text-background disabled:opacity-50"
          >
            {submitting ? "Generating…" : result ? "Re-generate" : "Generate"}
          </button>
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>
      </form>

      {result ? (
        <AssessmentResultDisplay
          result={result}
          inspectionId={inspectionId}
          domain={domain}
        />
      ) : null}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.kind === "select") {
    return (
      <label className="block text-sm">
        <span className="block text-xs uppercase tracking-wide text-muted-foreground">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <select
          required={field.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "number") {
    return (
      <label className="block text-sm">
        <span className="block text-xs uppercase tracking-wide text-muted-foreground">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <input
          type="number"
          required={field.required}
          min={field.min}
          max={field.max}
          step={field.step ?? "any"}
          value={(value as number | undefined) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
        />
      </label>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{field.label}</span>
    </label>
  );
}
