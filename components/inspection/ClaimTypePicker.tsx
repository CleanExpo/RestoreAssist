"use client";

/**
 * ClaimTypePicker — inspection-start IICRC standard selector.
 *
 * Punch-list (PR #1029) VERIFIED P1 #7: a tradie selects which IICRC standard
 * governs this job BEFORE evidence capture begins. Without this, the wrong
 * evidence-capture surface renders downstream and the captured fields do not
 * map to a defensible standard.
 *
 * The 4 options correspond to the 4 IICRC field maps in
 * lib/nir-standards-mapping.ts. Selection writes to Inspection.claimType
 * (ClaimType enum, already present on the schema).
 */
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CLAIM_TYPE_PICKER_OPTIONS,
  type IicrcClaimType,
} from "@/lib/nir-standards-mapping";

interface ClaimTypePickerProps {
  value: IicrcClaimType | null;
  onChange: (claimType: IicrcClaimType) => void;
  error?: string;
  disabled?: boolean;
}

export default function ClaimTypePicker({
  value,
  onChange,
  error,
  disabled,
}: ClaimTypePickerProps) {
  return (
    <div
      className={cn(
        "p-6 rounded-lg border",
        "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-5 h-5" aria-hidden="true" />
        <Label
          className={cn(
            "text-lg font-semibold",
            "text-neutral-900 dark:text-white",
          )}
        >
          Claim type <span className="text-destructive">*</span>
        </Label>
      </div>
      <p
        className={cn(
          "text-sm mb-4",
          "text-neutral-600 dark:text-slate-400",
        )}
      >
        Which IICRC standard governs this job? Selection determines which
        evidence-capture fields render below.
      </p>

      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as IicrcClaimType)}
        disabled={disabled}
        aria-required="true"
        aria-invalid={error ? "true" : undefined}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {CLAIM_TYPE_PICKER_OPTIONS.map((opt) => {
          const inputId = `claim-type-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={inputId}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                "border-neutral-200 dark:border-slate-700",
                "hover:bg-neutral-50 dark:hover:bg-slate-800/50",
                value === opt.value &&
                  "border-cyan-500 bg-cyan-50/40 dark:bg-cyan-500/10",
              )}
            >
              <RadioGroupItem
                id={inputId}
                value={opt.value}
                aria-label={opt.label}
                className="mt-1"
              />
              <div className="flex-1">
                <div
                  className={cn(
                    "font-medium",
                    "text-neutral-900 dark:text-white",
                  )}
                >
                  {opt.label}
                </div>
                <div
                  className={cn(
                    "text-xs mt-0.5",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  {opt.description}
                </div>
              </div>
            </label>
          );
        })}
      </RadioGroup>

      {error && (
        <p className="text-destructive text-xs mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
