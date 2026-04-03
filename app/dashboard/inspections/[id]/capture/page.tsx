"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Save,
  Loader2,
} from "lucide-react";
import {
  getWorkflowForClaimType,
  getSubmissionGateRequirements,
  getTotalRequiredCount,
  EVIDENCE_CLASSES,
} from "@/lib/evidence";
import type {
  ClaimWorkflow,
  WorkflowPhase,
  PhaseEvidenceRule,
} from "@/lib/evidence";
import type { EvidenceClass, MediaType } from "@prisma/client";
import { PhaseSidebar } from "@/components/inspection/capture/phase-sidebar";
import {
  EvidenceCaptureForm,
  type EvidenceCaptureFormData,
} from "@/components/inspection/capture/evidence-capture-form";
import { CapturedEvidenceList } from "@/components/inspection/capture/captured-evidence-list";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InspectionData {
  id: string;
  inspectionNumber: string;
  claimType: string | null;
  status: string;
  property: {
    address: string;
    suburb: string;
    state: string;
    postcode: string;
  } | null;
}

interface EvidenceItem {
  id: string;
  evidenceClass: EvidenceClass;
  mediaType: MediaType;
  title: string;
  description: string | null;
  fileUrl: string | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  roomName: string | null;
  floorLevel: string | null;
  zoneRef: string | null;
  inspectionPhase: string | null;
  createdAt: string;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CaptureWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = params.id as string;

  // Core state
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [workflow, setWorkflow] = useState<ClaimWorkflow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [currentRuleIndex, setCurrentRuleIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef(Date.now());

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadInspection = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`);
      if (!res.ok) throw new Error("Failed to load inspection");
      const json = await res.json();
      setInspection(json.data ?? json);
    } catch {
      toast.error("Could not load inspection");
      router.push("/dashboard/inspections");
    }
  }, [inspectionId, router]);

  const loadEvidence = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/evidence`);
      if (!res.ok) return;
      const json = await res.json();
      setEvidenceItems(json.data ?? json ?? []);
    } catch {
      // Non-blocking — evidence may not exist yet
    }
  }, [inspectionId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadInspection(), loadEvidence()]);
      setLoading(false);
    }
    init();
  }, [loadInspection, loadEvidence]);

  // Derive workflow from inspection claim type
  useEffect(() => {
    if (!inspection?.claimType) return;
    const wf = getWorkflowForClaimType(inspection.claimType);
    if (wf) {
      setWorkflow(wf);
    } else {
      // Fallback to water_damage if claim type not recognised
      setWorkflow(getWorkflowForClaimType("water_damage") ?? null);
    }
  }, [inspection?.claimType]);

  // ─── Computed Values ──────────────────────────────────────────────────────

  const phases = workflow?.phases ?? [];
  const currentPhase: WorkflowPhase | undefined = phases[currentPhaseIndex];
  const currentRules = currentPhase?.evidenceRules ?? [];
  const currentRule: PhaseEvidenceRule | undefined =
    currentRules[currentRuleIndex];
  const classMeta = currentRule
    ? EVIDENCE_CLASSES[currentRule.evidenceClass]
    : null;

  // Evidence counts keyed by `${phase}_${evidenceClass}`
  const evidenceCounts: Record<string, number> = {};
  for (const item of evidenceItems) {
    const key = `${item.inspectionPhase ?? "unknown"}_${item.evidenceClass}`;
    evidenceCounts[key] = (evidenceCounts[key] ?? 0) + 1;
  }

  // Items for the current rule
  const currentRuleItems = currentRule
    ? evidenceItems.filter(
        (e) =>
          e.evidenceClass === currentRule.evidenceClass &&
          e.inspectionPhase === currentPhase?.phase,
      )
    : [];

  // Overall progress
  const totalRequired = workflow
    ? getTotalRequiredCount(workflow.claimType)
    : 0;
  const totalCaptured = workflow
    ? getSubmissionGateRequirements(workflow.claimType).reduce((sum, r) => {
        // Count captured items across all phases for this evidence class
        const count = evidenceItems.filter(
          (e) => e.evidenceClass === r.evidenceClass,
        ).length;
        return sum + Math.min(count, r.minCount);
      }, 0)
    : 0;
  const progressPercent =
    totalRequired > 0 ? (totalCaptured / totalRequired) * 100 : 0;

  // Total step tracking
  const totalSteps = phases.reduce((sum, p) => sum + p.evidenceRules.length, 0);
  const currentStepGlobal =
    phases
      .slice(0, currentPhaseIndex)
      .reduce((sum, p) => sum + p.evidenceRules.length, 0) +
    currentRuleIndex +
    1;

  // Elapsed time
  const [elapsed, setElapsed] = useState("0:00");
  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────────

  function nextStep() {
    if (currentRuleIndex < currentRules.length - 1) {
      setCurrentRuleIndex((i) => i + 1);
    } else if (currentPhaseIndex < phases.length - 1) {
      setCurrentPhaseIndex((i) => i + 1);
      setCurrentRuleIndex(0);
    }
  }

  function prevStep() {
    if (currentRuleIndex > 0) {
      setCurrentRuleIndex((i) => i - 1);
    } else if (currentPhaseIndex > 0) {
      const prevPhase = phases[currentPhaseIndex - 1];
      setCurrentPhaseIndex((i) => i - 1);
      setCurrentRuleIndex(prevPhase.evidenceRules.length - 1);
    }
  }

  function jumpToPhase(index: number) {
    setCurrentPhaseIndex(index);
    setCurrentRuleIndex(0);
  }

  const isFirstStep = currentPhaseIndex === 0 && currentRuleIndex === 0;
  const isLastStep =
    currentPhaseIndex === phases.length - 1 &&
    currentRuleIndex === currentRules.length - 1;

  // ─── Evidence Capture ─────────────────────────────────────────────────────

  async function handleEvidenceCapture(formData: EvidenceCaptureFormData) {
    if (!currentPhase) return;
    setIsUploading(true);

    try {
      let fileUrl: string | undefined;

      // Upload file first if present
      if (formData.file) {
        const uploadForm = new FormData();
        uploadForm.append("file", formData.file);
        uploadForm.append("category", "evidence");

        const uploadRes = await fetch(
          `/api/inspections/${inspectionId}/photos`,
          { method: "POST", body: uploadForm },
        );

        if (!uploadRes.ok) {
          throw new Error("File upload failed");
        }

        const uploadJson = await uploadRes.json();
        fileUrl = uploadJson.data?.url ?? uploadJson.url;
      }

      // Create evidence record
      const body = {
        evidenceClass: formData.evidenceClass,
        mediaType: formData.mediaType,
        title: formData.title,
        description: formData.description || null,
        fileUrl: fileUrl ?? null,
        measurementValue: formData.measurementValue ?? null,
        measurementUnit: formData.measurementUnit ?? null,
        instrumentType: formData.instrumentType ?? null,
        instrumentSerial: formData.instrumentSerial ?? null,
        roomName: formData.roomName ?? null,
        floorLevel: formData.floorLevel ?? null,
        zoneRef: formData.zoneRef ?? null,
        inspectionPhase: currentPhase.phase,
      };

      const res = await fetch(`/api/inspections/${inspectionId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save evidence");

      const json = await res.json();
      const newItem = json.data ?? json;
      setEvidenceItems((prev) => [...prev, newItem]);
      toast.success("Evidence captured");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to capture evidence",
      );
    } finally {
      setIsUploading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!inspection || !workflow) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#050505]">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-zinc-400">
          Unable to load capture workflow. Inspection may not have a claim type
          assigned.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/inspections/${inspectionId}`)}
        >
          Back to Inspection
        </Button>
      </div>
    );
  }

  const propertyAddr = inspection.property
    ? `${inspection.property.address}, ${inspection.property.suburb} ${inspection.property.state} ${inspection.property.postcode}`
    : "No address";

  return (
    <div className="flex h-screen flex-col bg-[#050505]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0a0a] px-4 py-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/inspections/${inspectionId}`)
            }
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="h-5 w-px bg-white/10" />
          <h1 className="text-sm font-semibold text-white">
            Guided Evidence Capture
          </h1>
          <Badge
            variant="outline"
            className="border-[#8A6B4E]/30 bg-[#8A6B4E]/20 text-[#D4A574]"
          >
            {workflow.iicrcStandard}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            Step {currentStepGlobal} of {totalSteps}
          </span>
          <div className="w-32">
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <PhaseSidebar
          inspectionNumber={inspection.inspectionNumber}
          propertyAddress={propertyAddr}
          phases={phases}
          currentPhaseIndex={currentPhaseIndex}
          evidenceCounts={evidenceCounts}
          onJumpToPhase={jumpToPhase}
        />

        {/* Main content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Phase header */}
          {currentPhase && (
            <div className="border-b border-white/10 px-6 py-3">
              <h2 className="text-lg font-semibold text-white">
                {currentPhase.displayName}
              </h2>
              <p className="text-sm text-zinc-400">
                {currentPhase.description}
              </p>
            </div>
          )}

          {/* Scrollable content */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
              {currentRule && classMeta ? (
                <>
                  <EvidenceCaptureForm
                    rule={currentRule}
                    classMeta={classMeta}
                    isUploading={isUploading}
                    onSubmit={handleEvidenceCapture}
                  />

                  <CapturedEvidenceList
                    items={currentRuleItems}
                    requiredCount={currentRule.minCount}
                  />
                </>
              ) : (
                <div className="py-12 text-center text-zinc-500">
                  No evidence rules defined for this phase.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Navigation footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              disabled={isFirstStep}
              className="border-white/10 text-zinc-300"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={nextStep}
              disabled={isLastStep}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Skip Step
            </Button>

            <Button
              size="sm"
              onClick={nextStep}
              disabled={isLastStep}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between border-t border-white/10 bg-[#0a0a0a] px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-400">
            {totalCaptured} of {totalRequired} required items captured
          </span>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="h-3 w-3" />
            {elapsed}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dashboard/inspections/${inspectionId}`)}
          className="border-white/10 text-zinc-300"
        >
          <Save className="mr-1 h-4 w-4" />
          Save & Exit
        </Button>
      </div>
    </div>
  );
}
