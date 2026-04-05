"use client";

/**
 * Sprint G: Guided Capture Workflow Engine
 * [RA-399] Step-by-step inspection capture with progress sidebar,
 * evidence upload, job-type adaptation, and chain-of-custody on every item.
 *
 * This page consumes WorkflowTemplates from lib/evidence/workflow-definitions.ts
 * and renders a guided step-by-step capture interface.
 */

import { useState, useEffect, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Circle,
  SkipForward,
  AlertTriangle,
  Camera,
  Upload,
  FileText,
  Thermometer,
  Droplets,
  Video,
  Mic,
  MapPin,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  Info,
  Lock,
} from "lucide-react";
import {
  JOB_TYPES,
  JOB_TYPE_LABELS,
  getWorkflowTemplate,
} from "@/lib/evidence/workflow-definitions";
import type { JobType } from "@/lib/evidence/workflow-definitions";
import { AdaptiveGuidancePanel } from "@/components/inspections/adaptive-guidance-panel";
import { SubmissionGatePanel } from "@/components/inspections/submission-gate-panel";
import {
  EVIDENCE_CLASS_LABELS,
  EVIDENCE_S500_REFS,
  EVIDENCE_CATEGORIES,
  EXCEPTION_REASON_CODES,
  EXCEPTION_REASON_LABELS,
  RISK_TIER_LABELS,
} from "@/lib/types/evidence";
import type {
  EvidenceClass,
  WorkflowStepStatus,
  ExceptionReasonCode,
} from "@/lib/types/evidence";

// ============================================
// TYPES
// ============================================

interface WorkflowStep {
  id: string;
  stepOrder: number;
  stepKey: string;
  stepTitle: string;
  stepDescription: string | null;
  stepDescriptionShort: string | null;
  requiredEvidenceClasses: string;
  optionalEvidenceClasses: string | null;
  minimumEvidenceCount: number;
  isMandatory: boolean;
  riskTier: number;
  escalationNote: string | null;
  status: WorkflowStepStatus;
}

interface EvidenceItem {
  id: string;
  evidenceClass: EvidenceClass;
  workflowStepId: string | null;
  capturedByName: string;
  capturedAt: string;
  capturedLat: number | null;
  capturedLng: number | null;
  deviceType: string | null;
  fileUrl: string | null;
  fileMimeType: string | null;
  thumbnailUrl: string | null;
  notes: string | null;
  isVerified: boolean;
}

interface Workflow {
  id: string;
  jobType: string;
  experienceLevel: string;
  currentStepOrder: number;
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  isReadyToSubmit: boolean;
  submissionScore: number | null;
  steps: WorkflowStep[];
}

// ============================================
// HELPER: Evidence icon by class
// ============================================
function evidenceIcon(cls: EvidenceClass) {
  if (EVIDENCE_CATEGORIES.MEASUREMENTS.includes(cls))
    return <Thermometer className="h-4 w-4" />;
  if (EVIDENCE_CATEGORIES.PHOTOS.includes(cls))
    return <Camera className="h-4 w-4" />;
  if (cls === "VIDEO_WALKTHROUGH") return <Video className="h-4 w-4" />;
  if (cls === "VOICE_MEMO") return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

// ============================================
// HELPER: Step status styling
// ============================================
function stepStatusBadge(status: WorkflowStepStatus) {
  switch (status) {
    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Done
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
          <Play className="h-3.5 w-3.5" /> In Progress
        </span>
      );
    case "SKIPPED":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          <SkipForward className="h-3.5 w-3.5" /> Skipped
        </span>
      );
    case "BLOCKED":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
          <Lock className="h-3.5 w-3.5" /> Blocked
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Circle className="h-3.5 w-3.5" /> Not Started
        </span>
      );
  }
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function CaptureWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: inspectionId } = use(params);
  const router = useRouter();

  // Core state
  const [loading, setLoading] = useState(true);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [inspectionData, setInspectionData] = useState<{
    inspectionNumber: string;
    propertyAddress: string;
    status: string;
  } | null>(null);

  // Setup state (when no workflow exists yet)
  const [setupMode, setSetupMode] = useState(false);
  const [selectedJobType, setSelectedJobType] =
    useState<JobType>("WATER_DAMAGE");
  const [experienceLevel, setExperienceLevel] = useState<
    "APPRENTICE" | "EXPERIENCED"
  >("APPRENTICE");
  const [creating, setCreating] = useState(false);

  // Skip dialog state
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipStepId, setSkipStepId] = useState<string | null>(null);
  const [skipReason, setSkipReason] =
    useState<ExceptionReasonCode>("NOT_APPLICABLE");
  const [skipNotes, setSkipNotes] = useState("");
  const [skipping, setSkipping] = useState(false);

  // Evidence upload state
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [selectedEvidenceClass, setSelectedEvidenceClass] =
    useState<EvidenceClass | null>(null);
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Adaptive guidance — apprentice confirmation gate
  const [confirmationsComplete, setConfirmationsComplete] = useState(true);

  // Submission gate state (RA-401)
  const [submitting, setSubmitting] = useState(false);

  // Sidebar collapse on mobile
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch inspection basic info
      const inspRes = await fetch(`/api/inspections/${inspectionId}`);
      if (!inspRes.ok) {
        toast.error("Inspection not found");
        router.push("/dashboard/inspections");
        return;
      }
      const inspData = await inspRes.json();
      setInspectionData({
        inspectionNumber: inspData.inspection.inspectionNumber,
        propertyAddress: inspData.inspection.propertyAddress,
        status: inspData.inspection.status,
      });

      // Fetch workflow
      const wfRes = await fetch(`/api/inspections/${inspectionId}/workflow`);
      if (!wfRes.ok) throw new Error("Failed to load workflow");
      const wfData = await wfRes.json();

      if (wfData.workflow) {
        setWorkflow(wfData.workflow);
        setEvidenceItems(wfData.workflow.evidenceItems || []);
        setSetupMode(false);
        // Set active step to current step
        const currentIdx = wfData.workflow.steps.findIndex(
          (s: WorkflowStep) =>
            s.status === "IN_PROGRESS" || s.status === "NOT_STARTED",
        );
        setActiveStepIndex(currentIdx >= 0 ? currentIdx : 0);
      } else {
        setSetupMode(true);
      }
    } catch (error) {
      console.error("Error loading workflow:", error);
      toast.error("Failed to load capture workflow");
    } finally {
      setLoading(false);
    }
  }, [inspectionId, router]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // ============================================
  // ACTIONS
  // ============================================
  const handleCreateWorkflow = async () => {
    try {
      setCreating(true);
      const res = await fetch(`/api/inspections/${inspectionId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: selectedJobType,
          experienceLevel,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create workflow");
      }
      toast.success("Workflow created — let's begin the inspection!");
      await fetchWorkflow();
    } catch (error: any) {
      toast.error(error.message || "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  };

  const handleStepStatusChange = async (
    stepId: string,
    status: "IN_PROGRESS" | "COMPLETED" | "SKIPPED",
  ) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, status }),
      });
      if (!res.ok) throw new Error("Failed to update step");
      const data = await res.json();
      setWorkflow(data.workflow);

      if (status === "COMPLETED") {
        toast.success("Step completed!");
        // Auto-advance to next step
        const nextIdx = data.workflow.steps.findIndex(
          (s: WorkflowStep) =>
            s.status === "NOT_STARTED" || s.status === "IN_PROGRESS",
        );
        if (nextIdx >= 0) setActiveStepIndex(nextIdx);
      }
    } catch (error) {
      toast.error("Failed to update step status");
    }
  };

  const handleSkipStep = async () => {
    if (!skipStepId) return;
    try {
      setSkipping(true);
      const res = await fetch(`/api/inspections/${inspectionId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: skipStepId,
          status: "SKIPPED",
          skipReason,
          skipNotes,
        }),
      });
      if (!res.ok) throw new Error("Failed to skip step");
      const data = await res.json();
      setWorkflow(data.workflow);
      toast.success("Step skipped — reason recorded");
      setSkipDialogOpen(false);
      setSkipStepId(null);
      setSkipReason("NOT_APPLICABLE");
      setSkipNotes("");
      // Auto-advance
      const nextIdx = data.workflow.steps.findIndex(
        (s: WorkflowStep) =>
          s.status === "NOT_STARTED" || s.status === "IN_PROGRESS",
      );
      if (nextIdx >= 0) setActiveStepIndex(nextIdx);
    } catch (error) {
      toast.error("Failed to skip step");
    } finally {
      setSkipping(false);
    }
  };

  const handleAddEvidence = async (
    stepId: string,
    evidenceClass: EvidenceClass,
  ) => {
    // For now, create a text-based evidence item (file upload uses Supabase Storage)
    try {
      setUploadingEvidence(true);
      const res = await fetch(`/api/inspections/${inspectionId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStepId: stepId,
          evidenceClass,
          notes: evidenceNotes || null,
          deviceType: "WEB_BROWSER",
        }),
      });
      if (!res.ok) throw new Error("Failed to add evidence");
      const data = await res.json();
      setEvidenceItems((prev) => [data.evidenceItem, ...prev]);
      setEvidenceNotes("");
      setSelectedEvidenceClass(null);
      toast.success(`${EVIDENCE_CLASS_LABELS[evidenceClass]} recorded`);
    } catch (error) {
      toast.error("Failed to record evidence");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/evidence`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId }),
      });
      if (!res.ok) throw new Error("Failed to delete evidence");
      setEvidenceItems((prev) => prev.filter((e) => e.id !== evidenceId));
      toast.success("Evidence removed");
    } catch (error) {
      toast.error("Failed to delete evidence");
    }
  };

  // [RA-401] Submit inspection with evidence validation
  const handleSubmitInspection = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Submission failed");
        return;
      }
      toast.success("Inspection submitted successfully");
      router.push(`/dashboard/inspections/${inspectionId}`);
    } catch (error) {
      toast.error("Failed to submit inspection");
    } finally {
      setSubmitting(false);
    }
  };

  // Derived values
  const activeStep = workflow?.steps[activeStepIndex] ?? null;
  const stepEvidence = activeStep
    ? evidenceItems.filter((e) => e.workflowStepId === activeStep.id)
    : [];
  const requiredClasses: EvidenceClass[] = activeStep
    ? JSON.parse(activeStep.requiredEvidenceClasses || "[]")
    : [];
  const optionalClasses: EvidenceClass[] = activeStep?.optionalEvidenceClasses
    ? JSON.parse(activeStep.optionalEvidenceClasses)
    : [];
  const progressPct = workflow
    ? Math.round(
        ((workflow.completedSteps + workflow.skippedSteps) /
          workflow.totalSteps) *
          100,
      )
    : 0;
  const isApprentice = workflow?.experienceLevel === "APPRENTICE";

  // ============================================
  // LOADING STATE
  // ============================================
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600 dark:text-slate-300">
          Loading capture workflow...
        </span>
      </div>
    );
  }

  // ============================================
  // SETUP MODE — Choose job type + experience level
  // ============================================
  if (setupMode) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Link
          href={`/dashboard/inspections/${inspectionId}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inspection
        </Link>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Camera className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Start Guided Capture
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {inspectionData?.inspectionNumber} —{" "}
                {inspectionData?.propertyAddress}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Job Type
              </label>
              <Select
                value={selectedJobType}
                onValueChange={(v) => setSelectedJobType(v as JobType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((jt) => (
                    <SelectItem key={jt} value={jt}>
                      {JOB_TYPE_LABELS[jt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                This determines which evidence steps are required for IICRC
                S500:2025 compliance.
              </p>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Experience Level
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setExperienceLevel("APPRENTICE")}
                  className={cn(
                    "p-4 rounded-lg border-2 text-left transition-all",
                    experienceLevel === "APPRENTICE"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                  )}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-white">
                    Apprentice
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Detailed guidance, sub-steps, confirming questions
                  </div>
                </button>
                <button
                  onClick={() => setExperienceLevel("EXPERIENCED")}
                  className={cn(
                    "p-4 rounded-lg border-2 text-left transition-all",
                    experienceLevel === "EXPERIENCED"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                  )}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-white">
                    Experienced
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Minimal text, consolidated steps, exception-only prompts
                  </div>
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Workflow Preview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {getWorkflowTemplate(selectedJobType).description}
              </p>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-medium">
                  {getWorkflowTemplate(selectedJobType).steps.length} steps
                </span>
                {" · "}
                <span>
                  {
                    getWorkflowTemplate(selectedJobType).steps.filter(
                      (s) => s.isMandatory,
                    ).length
                  }{" "}
                  mandatory
                </span>
              </div>
            </div>

            <Button
              onClick={handleCreateWorkflow}
              disabled={creating}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating workflow...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Begin Guided Capture
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!workflow || !activeStep) return null;

  // ============================================
  // MAIN CAPTURE UI — Sidebar + Step Panel
  // ============================================
  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
      {/* ============================================ */}
      {/* PROGRESS SIDEBAR */}
      {/* ============================================ */}
      <aside
        className={cn(
          "bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800",
          "lg:w-80 lg:min-w-[320px] flex-shrink-0 overflow-y-auto",
          sidebarOpen ? "block" : "hidden lg:block",
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <Link
            href={`/dashboard/inspections/${inspectionId}`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to inspection
          </Link>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {inspectionData?.inspectionNumber}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {inspectionData?.propertyAddress}
          </p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Progress
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {workflow.completedSteps}/{workflow.totalSteps} steps ·{" "}
                {progressPct}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  progressPct === 100
                    ? "bg-green-500"
                    : progressPct > 60
                      ? "bg-blue-500"
                      : "bg-amber-500",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {workflow.isReadyToSubmit && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready to submit
              </div>
            )}
          </div>

          {/* Job type + experience badge */}
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {JOB_TYPE_LABELS[workflow.jobType as JobType] || workflow.jobType}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {workflow.experienceLevel === "APPRENTICE"
                ? "Apprentice"
                : "Experienced"}
            </span>
          </div>
        </div>

        {/* Step list */}
        <nav className="p-2">
          {workflow.steps.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            const isDone = step.status === "COMPLETED";
            const isSkipped = step.status === "SKIPPED";
            const stepEvidenceCount = evidenceItems.filter(
              (e) => e.workflowStepId === step.id,
            ).length;

            return (
              <button
                key={step.id}
                onClick={() => setActiveStepIndex(idx)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-all group",
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : isSkipped ? (
                      <SkipForward className="h-4 w-4 text-amber-500" />
                    ) : isActive ? (
                      <Play className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-medium truncate",
                          isActive
                            ? "text-blue-700 dark:text-blue-300"
                            : isDone
                              ? "text-slate-500 dark:text-slate-400 line-through"
                              : "text-slate-700 dark:text-slate-300",
                        )}
                      >
                        {idx + 1}. {step.stepTitle}
                      </span>
                      {step.isMandatory && (
                        <Shield className="h-3 w-3 text-red-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {stepEvidenceCount > 0 && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {stepEvidenceCount} evidence
                        </span>
                      )}
                      {step.riskTier >= 2 && (
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            step.riskTier === 3
                              ? "text-red-500"
                              : "text-amber-500",
                          )}
                        >
                          Risk {step.riskTier}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 bg-blue-600 text-white rounded-full p-3 shadow-lg"
      >
        {sidebarOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <ChevronUp className="h-5 w-5" />
        )}
      </button>

      {/* ============================================ */}
      {/* MAIN STEP PANEL */}
      {/* ============================================ */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        {/* Step header */}
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold",
                  activeStep.status === "COMPLETED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : activeStep.status === "SKIPPED"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                )}
              >
                {activeStepIndex + 1}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {activeStep.stepTitle}
                </h1>
                <div className="flex items-center gap-3 mt-0.5">
                  {stepStatusBadge(activeStep.status)}
                  {activeStep.isMandatory && (
                    <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Mandatory
                    </span>
                  )}
                  {activeStep.riskTier >= 2 && (
                    <span
                      className={cn(
                        "text-xs font-medium flex items-center gap-1",
                        activeStep.riskTier === 3
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {RISK_TIER_LABELS[activeStep.riskTier]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeStepIndex === 0}
                onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={activeStepIndex === workflow.steps.length - 1}
                onClick={() =>
                  setActiveStepIndex((i) =>
                    Math.min(workflow.steps.length - 1, i + 1),
                  )
                }
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Step description — adaptive guidance (RA-400) */}
          <AdaptiveGuidancePanel
            stepKey={activeStep.stepKey}
            stepTitle={activeStep.stepTitle}
            stepDescription={activeStep.stepDescription}
            stepDescriptionShort={activeStep.stepDescriptionShort}
            escalationNote={activeStep.escalationNote}
            riskTier={activeStep.riskTier}
            isApprentice={isApprentice}
            stepStatus={activeStep.status}
            onConfirmationsComplete={setConfirmationsComplete}
          />

          {/* ============================================ */}
          {/* REQUIRED EVIDENCE SECTION */}
          {/* ============================================ */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Required Evidence
              <span className="ml-2 text-xs font-normal text-slate-500">
                (min {activeStep.minimumEvidenceCount} items)
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {requiredClasses.map((cls) => {
                const captured = stepEvidence.filter(
                  (e) => e.evidenceClass === cls,
                );
                const hasCaptured = captured.length > 0;
                const s500Ref = EVIDENCE_S500_REFS[cls];

                return (
                  <div
                    key={cls}
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      hasCaptured
                        ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "p-1.5 rounded",
                            hasCaptured
                              ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-500",
                          )}
                        >
                          {evidenceIcon(cls)}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {EVIDENCE_CLASS_LABELS[cls]}
                          </div>
                          {s500Ref && isApprentice && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {s500Ref}
                            </div>
                          )}
                        </div>
                      </div>
                      {hasCaptured ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSelectedEvidenceClass(cls);
                            handleAddEvidence(activeStep.id, cls);
                          }}
                          disabled={uploadingEvidence}
                        >
                          {uploadingEvidence &&
                          selectedEvidenceClass === cls ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-3 w-3 mr-1" /> Capture
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Show captured evidence for this class */}
                    {captured.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {captured.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded p-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              <span>{ev.capturedByName}</span>
                              <span>·</span>
                              <Clock className="h-3 w-3" />
                              <span>
                                {new Date(ev.capturedAt).toLocaleTimeString()}
                              </span>
                              {ev.deviceType && (
                                <>
                                  <span>·</span>
                                  <span>{ev.deviceType}</span>
                                </>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteEvidence(ev.id)}
                              className="text-red-400 hover:text-red-600 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Optional evidence */}
            {optionalClasses.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Optional Evidence
                </h4>
                <div className="flex flex-wrap gap-2">
                  {optionalClasses.map((cls) => {
                    const hasCaptured = stepEvidence.some(
                      (e) => e.evidenceClass === cls,
                    );
                    return (
                      <button
                        key={cls}
                        onClick={() => {
                          if (!hasCaptured) {
                            setSelectedEvidenceClass(cls);
                            handleAddEvidence(activeStep.id, cls);
                          }
                        }}
                        disabled={hasCaptured || uploadingEvidence}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                          hasCaptured
                            ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                            : "border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {hasCaptured ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          evidenceIcon(cls)
                        )}
                        {EVIDENCE_CLASS_LABELS[cls]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* STEP ACTION BUTTONS */}
          {/* ============================================ */}
          <div className="flex items-center gap-3 mb-8">
            {activeStep.status !== "COMPLETED" &&
              activeStep.status !== "SKIPPED" && (
                <>
                  {activeStep.status === "NOT_STARTED" && (
                    <Button
                      onClick={() =>
                        handleStepStatusChange(activeStep.id, "IN_PROGRESS")
                      }
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Play className="h-4 w-4 mr-2" /> Start This Step
                    </Button>
                  )}

                  {activeStep.status === "IN_PROGRESS" && (
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() =>
                          handleStepStatusChange(activeStep.id, "COMPLETED")
                        }
                        className="bg-green-600 hover:bg-green-700"
                        disabled={isApprentice && !confirmationsComplete}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Complete
                      </Button>
                      {isApprentice && !confirmationsComplete && (
                        <span className="text-xs text-violet-600 dark:text-violet-400">
                          Answer required questions above to complete
                        </span>
                      )}
                    </div>
                  )}

                  {/* Skip button */}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSkipStepId(activeStep.id);
                      setSkipDialogOpen(true);
                    }}
                  >
                    <SkipForward className="h-4 w-4 mr-2" /> Skip
                  </Button>
                </>
              )}

            {/* Auto-advance hint */}
            {activeStep.status === "COMPLETED" && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Step complete
              </span>
            )}
            {activeStep.status === "SKIPPED" && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <SkipForward className="h-3.5 w-3.5" /> Step skipped
              </span>
            )}

            {/* Next step shortcut */}
            {(activeStep.status === "COMPLETED" ||
              activeStep.status === "SKIPPED") &&
              activeStepIndex < workflow.steps.length - 1 && (
                <Button
                  variant="outline"
                  onClick={() => setActiveStepIndex((i) => i + 1)}
                >
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
          </div>

          {/* ============================================ */}
          {/* SUBMISSION GATE (RA-401) */}
          {/* ============================================ */}
          {false &&
            workflow.isReadyToSubmit /* replaced by SubmissionGatePanel below */ && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">
                      All mandatory steps complete
                    </h3>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                      Submission score: {workflow.submissionScore ?? 0}% · This
                      inspection is ready to submit.
                    </p>
                  </div>
                  <div className="ml-auto">
                    <Link href={`/dashboard/inspections/${inspectionId}`}>
                      <Button className="bg-green-600 hover:bg-green-700">
                        Review & Submit
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          <SubmissionGatePanel
            inspectionId={inspectionId}
            isReadyToSubmit={workflow.isReadyToSubmit}
            onSubmit={handleSubmitInspection}
            submitting={submitting}
          />
        </div>
      </main>

      {/* ============================================ */}
      {/* SKIP REASON DIALOG */}
      {/* ============================================ */}
      <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Step — Reason Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Skipping a step requires a reason for audit trail compliance.
              {activeStep?.isMandatory && (
                <span className="block mt-1 text-red-600 dark:text-red-400 font-medium">
                  Warning: This is a mandatory step. An admin will be notified.
                </span>
              )}
            </p>
            <div>
              <label className="block text-sm font-medium mb-1.5">Reason</label>
              <Select
                value={skipReason}
                onValueChange={(v) => setSkipReason(v as ExceptionReasonCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCEPTION_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {EXCEPTION_REASON_LABELS[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(skipReason === "OTHER" || isApprentice) && (
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Notes
                </label>
                <textarea
                  value={skipNotes}
                  onChange={(e) => setSkipNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                  placeholder="Describe why this step was skipped..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSkipStep}
              disabled={skipping}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {skipping ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <SkipForward className="h-4 w-4 mr-2" />
              )}
              Skip Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
