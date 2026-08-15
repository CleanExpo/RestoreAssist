"use client";

/**
 * Compact insurer profile selector + evidence gap summary for the
 * inspection detail "Insurer Profile" tab. Full detail lives at
 * /dashboard/inspections/[id]/insurer-profile.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChromeAlertTriangle,
  ChromeBuilding,
  ChromeCheckCircle,
  ChromeExternalLink,
  ChromeSpinner,
} from "@/components/brand/chrome-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface InsurerSummary {
  id: string;
  label: string;
}

interface MissingEvidence {
  evidenceClass: string;
  required: number;
  submitted: number;
  instructions: string;
}

interface GapAnalysis {
  totalMandatory: number;
  totalSubmitted: number;
  missing: MissingEvidence[];
  isComplete: boolean;
}

interface InsurerProfile {
  id: string;
  name: string;
  brands: string[];
  claimsSystem: string;
  marketShare: string;
  notes: string;
}

const FALLBACK_PROFILES: InsurerSummary[] = [
  { id: "IAG", label: "IAG (NRMA, CGU, SGIO, SGIC)" },
  { id: "SUNCORP", label: "Suncorp (AAMI, GIO, Vero)" },
  { id: "QBE", label: "QBE Australia" },
  { id: "ALLIANZ", label: "Allianz Australia" },
  { id: "ZURICH", label: "Zurich Australia" },
  { id: "AIG", label: "AIG Australia" },
];

const EVIDENCE_LABELS: Record<string, string> = {
  MOISTURE_READING: "Moisture Reading",
  THERMAL_IMAGE: "Thermal Image",
  AMBIENT_ENVIRONMENTAL: "Ambient Environmental",
  PHOTO_DAMAGE: "Damage Photo",
  PHOTO_EQUIPMENT: "Equipment Photo",
  PHOTO_PROGRESS: "Progress Photo",
  PHOTO_COMPLETION: "Completion Photo",
  FLOOR_PLAN: "Floor Plan",
  SCOPE_DOCUMENT: "Scope Document",
};

export function InsurerProfilePanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<InsurerProfile | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<InsurerSummary[]>(
    [],
  );
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  const [claimRef, setClaimRef] = useState("");
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/insurer-profile`,
        );
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled) return;
        if (data.insurerProfile) {
          setProfile(data.insurerProfile);
          setSelectedInsurerId(data.insurerProfile.id);
        }
        if (data.availableProfiles) {
          setAvailableProfiles(data.availableProfiles);
        }
      } catch {
        if (!cancelled) toast.error("Could not load insurer profiles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  const handleApply = async () => {
    if (!selectedInsurerId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/insurer-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            insurerId: selectedInsurerId,
            claimRef: claimRef || undefined,
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setProfile(data.insurerProfile);
      setGapAnalysis(data.evidenceGapAnalysis ?? null);
      toast.success(`Insurer set to ${data.insurerProfile?.name ?? selectedInsurerId}`);
    } catch {
      toast.error("Failed to apply insurer profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        <ChromeSpinner className="animate-spin mr-2" size={20} />
        Loading insurer profiles…
      </div>
    );
  }

  const profiles =
    availableProfiles.length > 0 ? availableProfiles : FALLBACK_PROFILES;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="p-5 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <ChromeBuilding className="text-cyan-500" size={18} />
              Insurer profile
            </h3>
            <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
              Select the insurer for this job to unlock evidence requirements
              and submission preferences that drive Guided Capture.
            </p>
          </div>
          <Link
            href={`/dashboard/inspections/${inspectionId}/insurer-profile`}
            className="flex items-center gap-1.5 text-sm text-cyan-600 hover:underline whitespace-nowrap"
          >
            Full profile <ChromeExternalLink size={14} />
          </Link>
        </div>

        {profile && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"
            >
              {profile.name}
            </Badge>
            <span className="text-xs text-neutral-500">
              {profile.claimsSystem} · {profile.marketShare}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 mb-1 block">
              Insurer
            </label>
            <select
              value={selectedInsurerId}
              onChange={(e) => setSelectedInsurerId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">Choose insurer…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 mb-1 block">
              Claim reference
            </label>
            <input
              type="text"
              value={claimRef}
              onChange={(e) => setClaimRef(e.target.value)}
              placeholder="e.g. CLM-2026-001234"
              className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <Button
          onClick={handleApply}
          disabled={!selectedInsurerId || saving}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
          size="sm"
        >
          {saving ? (
            <>
              <ChromeSpinner size={14} className="animate-spin mr-1.5" />
              Applying…
            </>
          ) : profile ? (
            "Update insurer profile"
          ) : (
            "Apply insurer profile"
          )}
        </Button>
      </div>

      {gapAnalysis && (
        <div
          className={cn(
            "p-4 rounded-xl border-2",
            gapAnalysis.isComplete
              ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10"
              : "border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-900/10",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {gapAnalysis.isComplete ? (
              <ChromeCheckCircle size={18} className="text-success" />
            ) : (
              <ChromeAlertTriangle size={18} className="text-amber-500" />
            )}
            <p className="text-sm font-semibold">
              {gapAnalysis.isComplete
                ? "All mandatory evidence requirements met"
                : `${gapAnalysis.missing.length} missing evidence item${gapAnalysis.missing.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {!gapAnalysis.isComplete && (
            <ul className="space-y-2">
              {gapAnalysis.missing.map((m) => (
                <li
                  key={m.evidenceClass}
                  className="text-sm text-neutral-700 dark:text-slate-300"
                >
                  <span className="font-medium">
                    {EVIDENCE_LABELS[m.evidenceClass] ?? m.evidenceClass}
                  </span>
                  <span className="text-neutral-500">
                    {" "}
                    — {m.submitted}/{m.required} submitted
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!gapAnalysis.isComplete && (
            <Link
              href={`/dashboard/inspections/${inspectionId}/capture`}
              className="inline-flex mt-3 text-sm font-medium text-cyan-600 hover:underline"
            >
              Open Guided Capture to close gaps →
            </Link>
          )}
        </div>
      )}

      {!profile && !gapAnalysis && (
        <div className="text-center py-8 text-neutral-400 text-sm">
          No insurer selected yet. Apply a profile above to see evidence
          requirements for this inspection.
        </div>
      )}
    </div>
  );
}
