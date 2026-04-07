"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Camera,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
/**
 * [RA-406] Insurer Profile Selection & Evidence Gap Analysis
 * Allows technicians to select an insurer profile for an inspection,
 * view per-insurer evidence requirements, and see what's missing.
 */

interface InsurerSummary {
  id: string;
  label: string;
}

interface EvidenceRequirement {
  evidenceClass: string;
  mandatory: boolean;
  minimumCount: number;
  instructions: string;
  s500Reference?: string;
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
  s500EmphasisAreas: string[];
  reportSpec: {
    requiresCoverPage: boolean;
    maxPagesGuidance: number;
    includeComplianceMatrix: boolean;
    headerText: string;
    photoRequirements: {
      minimumPerRoom: number;
      requireTimestamps: boolean;
      requireGeoTags: boolean;
      requireBeforeAfter: boolean;
    };
  };
  submissionSpec: {
    preferredFormats: string[];
    submissionMethod: string;
    fileNamingConvention: string;
    maxFileSizeMb: number;
    acceptsCombinedPdf: boolean;
    expectedTurnaroundDays: number;
  };
}
/** Readable labels for evidence classes */
const EVIDENCE_LABELS: Record<string, string> = {
  MOISTURE_READING: "Moisture Reading",
  THERMAL_IMAGE: "Thermal Image",
  AMBIENT_ENVIRONMENTAL: "Ambient Environmental",
  PHOTO_DAMAGE: "Damage Photo",
  PHOTO_EQUIPMENT: "Equipment Photo",
  PHOTO_PROGRESS: "Progress Photo",
  PHOTO_COMPLETION: "Completion Photo",
  VIDEO_WALKTHROUGH: "Video Walkthrough",
  FLOOR_PLAN: "Floor Plan",
  SCOPE_DOCUMENT: "Scope Document",
  LAB_RESULT: "Lab Result",
  AUTHORITY_FORM: "Authority Form",
  EQUIPMENT_LOG: "Equipment Log",
  TECHNICIAN_NOTE: "Technician Note",
  VOICE_MEMO: "Voice Memo",
  THIRD_PARTY_REPORT: "Third-Party Report",
  COMPLIANCE_CERTIFICATE: "Compliance Certificate",
  CHAIN_OF_CUSTODY: "Chain of Custody",
};

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
export default function InsurerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<InsurerProfile | null>(null);
  const [evidenceReqs, setEvidenceReqs] = useState<EvidenceRequirement[]>([]);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<InsurerSummary[]>(
    [],
  );
  const [selectedInsurerId, setSelectedInsurerId] = useState<string>("");
  const [claimRef, setClaimRef] = useState("");
  const [formattedRef, setFormattedRef] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    evidence: true,
    report: false,
    submission: false,
    s500: false,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fetch current profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inspections/${id}/insurer-profile`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();

        if (data.insurerProfile) {
          setProfile(data.insurerProfile);
          setEvidenceReqs(data.evidenceRequirements ?? []);
          setSelectedInsurerId(data.insurerProfile.id);
        }
        if (data.availableProfiles) {
          setAvailableProfiles(data.availableProfiles);
        }
      } catch {
        /* fail silently — show empty state */
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [id]);
  const handleSelectInsurer = async () => {
    if (!selectedInsurerId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inspections/${id}/insurer-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurerId: selectedInsurerId,
          claimRef: claimRef || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setProfile(data.insurerProfile);
      setEvidenceReqs(data.evidenceRequirements ?? []);
      setGapAnalysis(data.evidenceGapAnalysis ?? null);
      setFormattedRef(data.formattedClaimRef ?? null);
      setExpandedSections((prev) => ({ ...prev, evidence: true }));
    } catch {
      /* fail silently */
    } finally {
      setSaving(false);
    }
  };

  const mandatoryReqs = evidenceReqs.filter((r) => r.mandatory);
  const optionalReqs = evidenceReqs.filter((r) => !r.mandatory);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/dashboard/inspections/${id}`}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              Insurer Profile
            </h1>
            {profile && (
              <Badge
                variant="outline"
                className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"
              >
                {profile.id}
              </Badge>
            )}
          </div>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
            Configure insurer-specific evidence and reporting requirements
          </p>
        </div>
      </div>

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <>
          {/* Insurer Selection */}
          <Card className="border-neutral-200 dark:border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 size={18} className="text-cyan-600" />
                Select Insurer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 mb-1 block">
                    Insurer
                  </label>
                  <select
                    value={selectedInsurerId}
                    onChange={(e) => setSelectedInsurerId(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  >
                    <option value="">Choose insurer...</option>
                    {(availableProfiles.length > 0
                      ? availableProfiles
                      : [
                          { id: "IAG", label: "IAG (NRMA, CGU, SGIO, SGIC)" },
                          { id: "SUNCORP", label: "Suncorp (AAMI, GIO, Vero)" },
                          { id: "QBE", label: "QBE Australia" },
                          { id: "ALLIANZ", label: "Allianz Australia" },
                          { id: "ZURICH", label: "Zurich Australia" },
                          { id: "AIG", label: "AIG Australia" },
                        ]
                    ).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 mb-1 block">
                    Claim Reference
                  </label>
                  <input
                    type="text"
                    value={claimRef}
                    onChange={(e) => setClaimRef(e.target.value)}
                    placeholder="e.g. CLM-2026-001234"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
              </div>
              <Button
                onClick={handleSelectInsurer}
                disabled={!selectedInsurerId || saving}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                size="sm"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                    Applying...
                  </>
                ) : (
                  "Apply Insurer Profile"
                )}
              </Button>
              {formattedRef && (
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  Formatted reference:{" "}
                  <span className="font-mono text-cyan-600 dark:text-cyan-400">
                    {formattedRef}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
          {/* Evidence Gap Analysis */}
          {gapAnalysis && (
            <Card
              className={cn(
                "border-2",
                gapAnalysis.isComplete
                  ? "border-emerald-200 dark:border-emerald-800/50"
                  : "border-amber-200 dark:border-amber-800/50",
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  {gapAnalysis.isComplete ? (
                    <CheckCircle2
                      size={20}
                      className="text-emerald-600 dark:text-emerald-400"
                    />
                  ) : (
                    <AlertTriangle
                      size={20}
                      className="text-amber-600 dark:text-amber-400"
                    />
                  )}
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      gapAnalysis.isComplete
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {gapAnalysis.isComplete
                      ? "All mandatory evidence requirements met"
                      : `${gapAnalysis.missing.length} missing evidence item${gapAnalysis.missing.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {!gapAnalysis.isComplete && (
                  <div className="space-y-2">
                    {gapAnalysis.missing.map((m) => (
                      <div
                        key={m.evidenceClass}
                        className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800/30"
                      >
                        <AlertTriangle
                          size={14}
                          className="text-amber-500 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-neutral-800 dark:text-white">
                            {EVIDENCE_LABELS[m.evidenceClass] ??
                              m.evidenceClass}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-slate-400">
                            Required: {m.required} — Submitted: {m.submitted}
                          </p>
                          <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
                            {m.instructions}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {/* Profile Detail Sections */}
          {profile && (
            <>
              {/* Evidence Requirements */}
              <Card className="border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => toggleSection("evidence")}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Camera size={18} className="text-cyan-600" />
                    <span className="text-base font-semibold text-neutral-900 dark:text-white">
                      Evidence Requirements
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {mandatoryReqs.length} mandatory
                    </Badge>
                  </div>
                  {expandedSections.evidence ? (
                    <ChevronDown size={18} className="text-neutral-400" />
                  ) : (
                    <ChevronRight size={18} className="text-neutral-400" />
                  )}
                </button>
                {expandedSections.evidence && (
                  <CardContent className="pt-0 space-y-3">
                    <Separator />
                    <p className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                      Mandatory
                    </p>
                    {mandatoryReqs.map((r) => (
                      <div
                        key={r.evidenceClass}
                        className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg border border-neutral-100 dark:border-slate-700/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-neutral-800 dark:text-white">
                            {EVIDENCE_LABELS[r.evidenceClass] ??
                              r.evidenceClass}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                          >
                            Min: {r.minimumCount}
                          </Badge>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          {r.instructions}
                        </p>
                        {r.s500Reference && (
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                            {r.s500Reference}
                          </p>
                        )}
                      </div>
                    ))}
                    {optionalReqs.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider pt-2">
                          Preferred
                        </p>
                        {optionalReqs.map((r) => (
                          <div
                            key={r.evidenceClass}
                            className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg border border-neutral-100 dark:border-slate-700/50 opacity-80"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-neutral-700 dark:text-slate-300">
                                {EVIDENCE_LABELS[r.evidenceClass] ??
                                  r.evidenceClass}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                Optional
                              </Badge>
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-slate-400">
                              {r.instructions}
                            </p>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
              {/* Report Formatting */}
              <Card className="border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => toggleSection("report")}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-cyan-600" />
                    <span className="text-base font-semibold text-neutral-900 dark:text-white">
                      Report Formatting
                    </span>
                  </div>
                  {expandedSections.report ? (
                    <ChevronDown size={18} className="text-neutral-400" />
                  ) : (
                    <ChevronRight size={18} className="text-neutral-400" />
                  )}
                </button>
                {expandedSections.report && (
                  <CardContent className="pt-0 space-y-3">
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Cover Page
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.reportSpec.requiresCoverPage
                            ? "Required"
                            : "Not Required"}
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Max Pages
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.reportSpec.maxPagesGuidance === 0
                            ? "No limit"
                            : `~${profile.reportSpec.maxPagesGuidance} pages`}
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Compliance Matrix
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.reportSpec.includeComplianceMatrix
                            ? "Include"
                            : "Not required"}
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Photos / Room
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          Min{" "}
                          {profile.reportSpec.photoRequirements.minimumPerRoom}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-neutral-500 dark:text-slate-400 mb-1">
                        Header Text
                      </p>
                      <p className="text-sm text-neutral-700 dark:text-slate-300 italic">
                        &ldquo;{profile.reportSpec.headerText}&rdquo;
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.reportSpec.photoRequirements
                        .requireTimestamps && (
                        <Badge variant="secondary" className="text-xs">
                          Timestamps Required
                        </Badge>
                      )}
                      {profile.reportSpec.photoRequirements.requireGeoTags && (
                        <Badge variant="secondary" className="text-xs">
                          Geo-Tags Required
                        </Badge>
                      )}
                      {profile.reportSpec.photoRequirements
                        .requireBeforeAfter && (
                        <Badge variant="secondary" className="text-xs">
                          Before/After Required
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
              {/* Submission Preferences */}
              <Card className="border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => toggleSection("submission")}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-cyan-600" />
                    <span className="text-base font-semibold text-neutral-900 dark:text-white">
                      Submission Preferences
                    </span>
                  </div>
                  {expandedSections.submission ? (
                    <ChevronDown size={18} className="text-neutral-400" />
                  ) : (
                    <ChevronRight size={18} className="text-neutral-400" />
                  )}
                </button>
                {expandedSections.submission && (
                  <CardContent className="pt-0 space-y-3">
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Method
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.submissionSpec.submissionMethod.replace(
                            "_",
                            " ",
                          )}
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Turnaround
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.submissionSpec.expectedTurnaroundDays}{" "}
                          business days
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Max File Size
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.submissionSpec.maxFileSizeMb} MB
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                        <p className="text-xs text-neutral-500 dark:text-slate-400">
                          Combined PDF
                        </p>
                        <p className="text-sm font-medium text-neutral-800 dark:text-white">
                          {profile.submissionSpec.acceptsCombinedPdf
                            ? "Accepted"
                            : "Separate files required"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.submissionSpec.preferredFormats.map((f) => (
                        <Badge key={f} variant="outline" className="text-xs">
                          {f}
                        </Badge>
                      ))}
                    </div>
                    <div className="p-3 bg-neutral-50 dark:bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-neutral-500 dark:text-slate-400 mb-1">
                        File Naming Convention
                      </p>
                      <p className="text-sm font-mono text-neutral-700 dark:text-slate-300">
                        {profile.submissionSpec.fileNamingConvention}
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
              {/* S500 Emphasis Areas */}
              <Card className="border-neutral-200 dark:border-slate-700/50">
                <button
                  onClick={() => toggleSection("s500")}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Shield size={18} className="text-cyan-600" />
                    <span className="text-base font-semibold text-neutral-900 dark:text-white">
                      S500:2025 Emphasis Areas
                    </span>
                  </div>
                  {expandedSections.s500 ? (
                    <ChevronDown size={18} className="text-neutral-400" />
                  ) : (
                    <ChevronRight size={18} className="text-neutral-400" />
                  )}
                </button>
                {expandedSections.s500 && (
                  <CardContent className="pt-0 space-y-2">
                    <Separator />
                    {profile.s500EmphasisAreas.map((area, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 bg-cyan-50 dark:bg-cyan-900/10 rounded-lg border border-cyan-100 dark:border-cyan-800/30"
                      >
                        <Shield
                          size={14}
                          className="text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0"
                        />
                        <p className="text-sm text-neutral-700 dark:text-slate-300">
                          {area}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>

              {/* General Notes */}
              {profile.notes && (
                <div className="p-4 bg-neutral-50 dark:bg-slate-800/50 rounded-xl border border-neutral-200 dark:border-slate-700/50">
                  <p className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Notes
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-slate-300">
                    {profile.notes}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
