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
  Video,
  Mic,
  MapPin,
  Shield,
  Clock,
  ChevronUp,
  X,
  Play,
  Lock,
} from "lucide-react";
import {
  JOB_TYPES,
  JOB_TYPE_LABELS,
  getWorkflowTemplate,
} from "@/lib/evidence/workflow-definitions";
import type { JobType } from "@/lib/evidence/workflow-definitions";
import {
  buildEvidenceFormData,
  captureEvidencePhoto,
  evidenceIdempotencyKey,
  evidencePhotoFromFile,
  pickEvidencePhotoFile,
  VIDEO_EVIDENCE_ACCEPT,
} from "@/lib/evidence/ios-capture";
import { isVideoEvidenceClass } from "@/lib/evidence/evidence-classes";
import type { IOSCaptureResult } from "@/lib/evidence/ios-capture";
import { verifyEvidenceReadback } from "@/lib/evidence/verified-readback";
import {
  createSignedManifest,
  ensureDeviceKeyRegistered,
  recoverFromRejectedKey,
} from "@/lib/evidence/device-signing";
import {
  describeSavedEvidence,
  submitMetadataEvidence,
  withSavedEvidence,
  type MetadataEvidenceDraft,
  type SignedRequestBytes,
} from "@/lib/evidence/submit-metadata-evidence";
import { MetadataCaptureForm } from "@/components/evidence/metadata-capture-form";
import { isMetadataOnlyEvidenceClass } from "@/lib/evidence/submission-path-classes";
import { canCaptureAnother } from "@/lib/evidence/step-reachability";
import type { SignedManifestPayload } from "@/lib/evidence/device-signing";
import {
  EVIDENCE_LIST_RELOAD_TIMEOUT_MS,
  submitSignedCapture,
  withTimeLimit,
} from "@/lib/evidence/capture-submit";
import { useSession } from "next-auth/react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { useCapacitor } from "@/components/providers/CapacitorProvider";
import { getQueuedDraftCount } from "@/lib/offline/inspection-store";
import { AdaptiveGuidancePanel } from "@/components/inspections/adaptive-guidance-panel";
import { SubmissionGatePanel } from "@/components/inspections/submission-gate-panel";
import {
  describeSubmitRefusal,
  type SubmitRefusal,
} from "@/lib/evidence/submit-refusal";
import { FieldEvidenceChecklistPanel } from "@/components/inspections/field-evidence-checklist-panel";
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
import { apiErrorMessage } from "@/lib/api-error-message";

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
  /** RA-8488: for a reading or note, the location and surface it was taken on. */
  title?: string | null;
}

/**
 * RA-8488: every success notice on this page shares one toast id, so a new
 * one replaces the last instead of piling up over the step on a phone.
 * Errors and the long "saved but does not count" notice keep their own.
 */
const PROGRESS_TOAST = { id: "capture-progress" } as const;

/**
 * RA-8488: what a reading or note in the evidence list is. Photos and files
 * are identified by their thumbnail; a record with no media has only its
 * title. A title equal to the class name is the server's blank-title
 * fallback and says nothing the tile does not already say.
 */
function recordTitle(ev: EvidenceItem): string | null {
  if (ev.fileUrl || ev.thumbnailUrl) return null;
  const title = ev.title?.trim();
  if (!title || title === ev.evidenceClass) return null;
  return title;
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
/**
 * Notes and readings: captured through the metadata form as JSON, with no
 * camera. One owner, because the capture handler and the capture controls
 * must agree on which classes the form serves.
 */
function isMetadataOnlyClass(evidenceClass: EvidenceClass): boolean {
  // RA-8388: the list lives with the route's own check, so the screen and
  // the server cannot disagree about which path a class takes.
  return isMetadataOnlyEvidenceClass(evidenceClass);
}

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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
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
  const confirm = useConfirmDialog();
  const { isNative } = useCapacitor();
  const { data: session } = useSession();
  const [offlineCount, setOfflineCount] = useState(0);

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
  /**
   * RA-8388: the open metadata form, or null.
   *
   * The page records WHICH class is being captured and nothing else. The
   * draft, its capture time and its signed bytes belong to the form, so a
   * retry replays one submission instead of minting a second.
   */
  const [metadataCapture, setMetadataCapture] = useState<{
    stepId: string;
    evidenceClass: EvidenceClass;
  } | null>(null);
  const pickerAbortRef = useRef<AbortController | null>(null);
  const signedRequestCache = useRef(new Map<string, Pick<SignedManifestPayload, "manifestJson" | "signature">>());
  /**
   * RA-8388: counts every write to `evidenceItems`. A reload takes the next
   * number when it is sent and is applied only if the number is unchanged
   * when its answer arrives, so an answer that left the server before a
   * newer reload, a save or a delete can never overwrite what came after it.
   */
  const evidenceListVersion = useRef(0);
  /** True once the open form's save has put its record on the list. */
  const formSavedRecord = useRef(false);
  /** The `evidenceListVersion` number taken by the newest reload sent. */
  const latestReloadVersion = useRef(0);
  /**
   * RA-8388: the steps whose reading form is held shut while the evidence
   * list is reloaded after "Close and check". The ref is what the capture
   * handler reads, so a tap landing before the re-render is still refused;
   * the state is the same list, for the notice and the disabled controls.
   */
  const stepsBeingChecked = useRef(new Set<string>());
  const [stepIdsBeingChecked, setStepIdsBeingChecked] = useState<string[]>([]);
  const [pickerPending, setPickerPending] = useState(false);
  const [pendingRawFile, setPendingRawFile] = useState<{
    stepId: string;
    evidenceClass: EvidenceClass;
    file: File;
  } | null>(null);
  const [pendingCapture, setPendingCapture] = useState<{
    stepId: string;
    evidenceClass: EvidenceClass;
    capture: IOSCaptureResult;
  } | null>(null);
  const [pendingFailureStatus, setPendingFailureStatus] = useState<number | null>(null);

  useEffect(() => () => pickerAbortRef.current?.abort(), []);

  // Adaptive guidance — apprentice confirmation gate
  const [confirmationsComplete, setConfirmationsComplete] = useState(true);

  // Submission gate state (RA-401)
  const [submitting, setSubmitting] = useState(false);
  // RA-8388: a refused submit stays on screen with a link to each missing
  // item. A toast showed the raw server code and then disappeared.
  const [submitRefusal, setSubmitRefusal] = useState<SubmitRefusal | null>(
    null,
  );

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
        evidenceListVersion.current += 1;
        setEvidenceItems(wfData.workflow.evidenceItems || []);
        setSetupMode(false);
        // Deep-link from field evidence checklist: ?step=<stepKey>
        const stepParam =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("step")
            : null;
        const deepLinkIdx = stepParam
          ? wfData.workflow.steps.findIndex(
              (s: WorkflowStep) => s.stepKey === stepParam,
            )
          : -1;
        if (deepLinkIdx >= 0) {
          setActiveStepIndex(deepLinkIdx);
        } else {
          const currentIdx = wfData.workflow.steps.findIndex(
            (s: WorkflowStep) =>
              s.status === "IN_PROGRESS" || s.status === "NOT_STARTED",
          );
          setActiveStepIndex(currentIdx >= 0 ? currentIdx : 0);
        }
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

  /**
   * RA-8388: reload the evidence list, and nothing else.
   *
   * When a save may already have been recorded, the form tells the
   * technician to close it and check the step's evidence. The list was
   * loaded once, at mount, so that check showed the list from BEFORE the
   * save and the reading was entered twice.
   *
   * It reads the workflow route, the same source as the first load, because
   * that list holds only evidence that counts. GET /evidence also returns
   * retired readings, which would inflate the step counts. It does not call
   * `fetchWorkflow`: that resets setup mode and the open step.
   *
   * A failed or unusable answer leaves the list as it is and says so. It
   * never blanks the list. An answer that has been overtaken (see
   * `evidenceListVersion`) is never applied.
   *
   * While it is out, the reading form for `stepId` is held shut (see
   * `stepsBeingChecked`): the technician was told to check the step before
   * entering the reading again, and until the answer is in there is nothing
   * true to check against. The hold ends when the newest reload has
   * answered or failed, never before:
   *
   * - overtaken by a newer reload: this one stops, and the newer one ends
   *   the hold for every held step, because its list is the whole job's;
   * - overtaken by a save or a delete: the answer is from before that write
   *   and cannot be used, so the list is asked for again;
   * - no answer inside the time limit: a failed reload. The request is
   *   bounded, so the hold cannot last for ever.
   */
  const reloadEvidenceItems = useCallback(async (stepId: string) => {
    stepsBeingChecked.current.add(stepId);
    setStepIdsBeingChecked([...stepsBeingChecked.current]);

    let items: unknown;
    for (;;) {
      const version = ++evidenceListVersion.current;
      latestReloadVersion.current = version;
      try {
        items = await withTimeLimit(
          "Evidence list reload",
          EVIDENCE_LIST_RELOAD_TIMEOUT_MS,
          async (signal) => {
            const res = await fetch(
              `/api/inspections/${inspectionId}/workflow`,
              signal ? { signal } : undefined,
            );
            const data = res.ok ? await res.json() : null;
            return data?.workflow?.evidenceItems as unknown;
          },
        );
      } catch {
        items = undefined;
      }
      if (version === evidenceListVersion.current) break;
      // A newer reload is out; it owns the list and the hold from here.
      if (latestReloadVersion.current !== version) return;
      // A save or a delete overtook this answer: ask again.
    }

    stepsBeingChecked.current.clear();
    setStepIdsBeingChecked([]);
    if (!Array.isArray(items)) {
      toast.error(
        "Could not refresh this step's evidence. Reload the page to see what is saved before entering it again.",
      );
      return;
    }
    // A record already on the list keeps the picture links it holds. A
    // photograph taken in this session holds the signed links the evidence
    // listing gave it; the workflow route returns the stored links, which
    // show nothing for a private file.
    const reloaded = items as EvidenceItem[];
    setEvidenceItems((prev) => {
      const held = new Map(prev.map((item) => [item.id, item]));
      return reloaded.map((item) => {
        const shown = held.get(item.id);
        return shown
          ? { ...item, fileUrl: shown.fileUrl, thumbnailUrl: shown.thumbnailUrl }
          : item;
      });
    });
  }, [inspectionId]);

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
        throw new Error(apiErrorMessage(err) || "Failed to create workflow");
      }
      toast.success("Workflow created — let's begin the inspection!", PROGRESS_TOAST);
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
        toast.success("Step completed!", PROGRESS_TOAST);
        // Auto-advance to next step
        const nextIdx = data.workflow.steps.findIndex(
          (s: WorkflowStep) =>
            s.status === "NOT_STARTED" || s.status === "IN_PROGRESS",
        );
        if (nextIdx >= 0) setActiveStepIndex(nextIdx);
      }
    } catch {
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
      toast.success("Step skipped — reason recorded", PROGRESS_TOAST);
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
    } catch {
      toast.error("Failed to skip step");
    } finally {
      setSkipping(false);
    }
  };

  useEffect(() => {
    if (!isNative) return;
    getQueuedDraftCount().then(setOfflineCount);
  }, [isNative]);

  /**
   * Upload a captured/selected file to Cloudinary via the signed multipart
   * evidence route and persist EvidenceItem in the DB. Used for every field
   * capture on web and native — never metadata-only for file-backed classes.
   */
  const uploadSignedEvidence = async (
    stepId: string,
    evidenceClass: EvidenceClass,
    capture: IOSCaptureResult,
  ) => {
    setPendingFailureStatus(null);
    // RA-7090: upload the captured bytes (multipart) so the server can
    // recompute and verify the evidence hash over the stored file.
    // RA-7090 slice 2 (P1): capture is SIGNED, fail-closed.
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error("You must be signed in to capture signed evidence");
    }
    const keyMode = isNative ? "capacitor" : "web";
    const deviceType = isNative ? "IOS_CAPACITOR" : "WEB_BROWSER";

    let lastResponse: Response | null = null;
    const signAndPost = async (attempt: "initial" | "resigned") => {
      const idempotencyKey = await evidenceIdempotencyKey(capture.manifest, {
        inspectionId,
        workflowStepId: stepId,
        evidenceClass,
        ...(attempt === "resigned" ? { variant: "resigned-retry" } : {}),
      });
      let payload = signedRequestCache.current.get(idempotencyKey);
      if (!payload) {
        const deviceKey = await ensureDeviceKeyRegistered(keyMode);
        const signed = await createSignedManifest(
          capture,
          { inspectionId, workflowStepId: stepId, evidenceClass, userId },
          deviceKey,
        );
        payload = { manifestJson: signed.manifestJson, signature: signed.signature };
        // An uncertain POST must replay the exact signed multipart fields for
        // this idempotency key, even if device registration later changes.
        signedRequestCache.current.set(idempotencyKey, payload);
      }
      const res = await fetch(`/api/inspections/${inspectionId}/evidence`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: buildEvidenceFormData(
          capture,
          { workflowStepId: stepId, evidenceClass, deviceType },
          { manifestJson: payload.manifestJson, signature: payload.signature },
        ),
      });
      lastResponse = res;
      return { status: res.status, ok: res.ok };
    };

    const result = await submitSignedCapture({
      signAndPost,
      rotateKey: async () => {
        console.warn(
          "[capture] signing key rejected by server — rotating and re-signing",
        );
        await recoverFromRejectedKey(keyMode);
      },
    });

    if (!result.ok || !lastResponse) {
      setPendingFailureStatus((lastResponse as Response | null)?.status ?? null);
      const body = lastResponse
        ? await (lastResponse as Response).json().catch(() => null)
        : null;
      // RA-8388: `apiErrorMessage` reads both error shapes the route can
      // answer with (the envelope and the older plain string), so a refusal
      // is never replaced by the generic line when the server said why.
      throw new Error(apiErrorMessage(body) || "Failed to record evidence");
    }
    const data = await (lastResponse as Response).json();
    if (typeof data?.evidenceItem?.id !== "string") {
      throw new Error("Evidence upload returned no item ID. Keep the pending capture and retry.");
    }
    const verified = await verifyEvidenceReadback(inspectionId, stepId, data.evidenceItem.id);
    setPendingFailureStatus(null);
    signedRequestCache.current.clear();
    evidenceListVersion.current += 1;
    setEvidenceItems((prev) =>
      withSavedEvidence(prev, verified as unknown as EvidenceItem),
    );
    setSelectedEvidenceClass(null);
    showSavedEvidenceNotice(evidenceClass, data);
  };

  /**
   * RA-8388: say what the server actually answered. A photograph that is
   * saved but does not count toward the photographs the job needs, and a
   * capture the job already held, are both 2xx and neither is plain
   * "captured". The wording has one owner, `describeSavedEvidence`.
   */
  const showSavedEvidenceNotice = (
    evidenceClass: EvidenceClass,
    data: unknown,
  ) => {
    const notice = describeSavedEvidence(
      EVIDENCE_CLASS_LABELS[evidenceClass],
      data,
    );
    if (notice.tone === "success") {
      toast.success(notice.message, PROGRESS_TOAST);
    } else {
      // Not green, and long enough to read: this is the only time the
      // technician is told before submit that the photograph does not count.
      toast(notice.message, { duration: 10000 });
    }
  };

  const handleCaptureEvidence = async (
    stepId: string,
    evidenceClass: EvidenceClass,
  ) => {
    if (pickerAbortRef.current || pendingRawFile || pendingCapture) return;
    try {
      setUploadingEvidence(true);
      setSelectedEvidenceClass(evidenceClass);

      // Metadata-first classes (notes / readings) — JSON path, no forced camera.
      if (isMetadataOnlyClass(evidenceClass)) {
        // RA-8388: the form stays shut on a step whose evidence is still
        // being checked after "Close and check". Opening it now is how the
        // same reading is entered twice.
        if (stepsBeingChecked.current.has(stepId)) {
          setSelectedEvidenceClass(null);
          return;
        }
        // RA-8388 AMENDMENT 03 §M. This used to be a chain of
        // `window.prompt` calls. A blank or cancelled prompt ran
        // `setSelectedEvidenceClass(null); return;`, which is the client's
        // "nothing happens after I click OK" and her lost entries - the chain
        // had nowhere to keep what had been typed. It also could not collect
        // `surfaceType` or `depth`, so a moisture reading could never produce
        // a complete MoistureReading row.
        //
        // The form owns the fields AND the draft. The draft must be created
        // once and reused across retries, because the idempotency key is
        // derived from its content plus `capturedAt`; minting that here, per
        // tap, is what wrote one measurement into insurance evidence twice.
        // The page deliberately holds neither.
        if (!session?.user?.id) {
          throw new Error("You must be signed in to record evidence");
        }
        setMetadataCapture({ stepId, evidenceClass });
        setUploadingEvidence(false);
        return;
      }

      // Video evidence always goes through the file input: the native Camera
      // plugin only takes stills, while a video-only input opens the camera
      // in video mode on iOS, Android and the Capacitor WebView alike.
      const wantsVideo = isVideoEvidenceClass(evidenceClass);
      let capture: IOSCaptureResult;
      if (isNative && !wantsVideo) {
        capture = await captureEvidencePhoto();
      } else {
        const controller = new AbortController();
        pickerAbortRef.current = controller;
        setPickerPending(true);
        let selected: File;
        try {
          selected = await pickEvidencePhotoFile({
            signal: controller.signal,
            ...(wantsVideo ? { accept: VIDEO_EVIDENCE_ACCEPT } : {}),
          });
        } finally {
          pickerAbortRef.current = null;
          setPickerPending(false);
        }
        setPendingRawFile({ stepId, evidenceClass, file: selected });
        capture = await evidencePhotoFromFile(selected);
      }
      setPendingCapture({ stepId, evidenceClass, capture });
      await uploadSignedEvidence(stepId, evidenceClass, capture);
      setPendingCapture(null);
      setPendingRawFile(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Capture failed";
      if (msg === "Capture cancelled" || msg === "No file selected") {
        // User dismissed the picker — not an error toast.
        setSelectedEvidenceClass(null);
        return;
      }
      toast.error(msg);
    } finally {
      setUploadingEvidence(false);
    }
  };

  const retryPendingCapture = async () => {
    if (!pendingCapture || uploadingEvidence) return;
    setUploadingEvidence(true);
    try {
      await uploadSignedEvidence(pendingCapture.stepId, pendingCapture.evidenceClass, pendingCapture.capture);
      setPendingCapture(null);
      setPendingRawFile(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Evidence remains pending. Retry before leaving this page.");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const retryPendingRawFile = async () => {
    if (!pendingRawFile || pendingCapture || uploadingEvidence) return;
    setUploadingEvidence(true);
    try {
      const capture = await evidencePhotoFromFile(pendingRawFile.file);
      setPendingCapture({ stepId: pendingRawFile.stepId, evidenceClass: pendingRawFile.evidenceClass, capture });
      await uploadSignedEvidence(pendingRawFile.stepId, pendingRawFile.evidenceClass, capture);
      setPendingCapture(null);
      setPendingRawFile(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Photo remains selected. Retry preparation or save the original file.");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const savePendingCaptureCopy = () => {
    const blob = pendingRawFile?.file ?? pendingCapture?.capture.blob;
    const filename = pendingRawFile?.file.name ?? pendingCapture?.capture.filename;
    if (!blob || !filename) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const discardPendingCapture = async () => {
    if (uploadingEvidence || (!pendingCapture && !pendingRawFile)) return;
    const uncertainUpload = pendingCapture && ![400, 413, 415, 422].includes(pendingFailureStatus ?? -1);
    const ok = await confirm.ask({
      title: uncertainUpload ? "Clear photo with uncertain upload?" : "Discard this unsaved photo?",
      description: uncertainUpload
        ? "The upload may already be on this job. Save an original copy before clearing this local selection, then check the job evidence list before trying the same photo again to avoid a duplicate. No stored job photo is deleted."
        : "This clears the local selection so you can capture another photo. Save an original copy first if you need these bytes. No stored job photo is deleted.",
      confirmLabel: "Discard local selection",
      destructive: true,
    });
    if (!ok) return;
    setPendingCapture(null);
    setPendingRawFile(null);
    setPendingFailureStatus(null);
    signedRequestCache.current.clear();
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/evidence`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId }),
      });
      if (!res.ok) {
        // RA-8388: the route says WHY (for example, this evidence is the
        // signed record behind a reading, and what to do instead). Show
        // that, not a generic line the technician can only retry against.
        const body = await res.json().catch(() => null);
        throw new Error(apiErrorMessage(body) ?? "Failed to delete evidence");
      }
      evidenceListVersion.current += 1;
      setEvidenceItems((prev) => prev.filter((e) => e.id !== evidenceId));
      toast.success("Evidence removed", PROGRESS_TOAST);
    } catch (error) {
      toast.error(
        (error instanceof Error && error.message) ||
          "Failed to delete evidence",
      );
    }
  };

  // [RA-401] Submit inspection with evidence validation
  const handleSubmitInspection = async () => {
    setSubmitting(true);
    setSubmitRefusal(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const refusal = describeSubmitRefusal(inspectionId, data);
        setSubmitRefusal(refusal);
        toast.error(refusal.message);
        return;
      }
      toast.success("Inspection submitted successfully", PROGRESS_TOAST);
      router.push(`/dashboard/inspections/${inspectionId}`);
    } catch {
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
  // RA-8388: the open step's readings are being checked after "Close and
  // check"; its reading and note controls are held until that has answered.
  const checkingSavedEvidence =
    activeStep !== null && stepIdsBeingChecked.includes(activeStep.id);

  // ============================================
  // LOADING STATE
  // ============================================
  // Spinner only before the first workflow arrives. Refetching after a step
  // completes must not unmount the page, or the scroll jumps to the top.
  if (loading && !workflow) {
    return (
      <div
        role="status"
        aria-label="Loading capture workflow"
        className="flex items-center justify-center min-h-[60vh]"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-blue-600"
          aria-hidden="true"
        />
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
    const workflowTemplate = getWorkflowTemplate(selectedJobType);
    const mandatorySteps = workflowTemplate.steps.filter((s) => s.isMandatory);

    return (
      <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-50 dark:bg-slate-950">
        <header className="w-full border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex w-full flex-col gap-4 px-4 py-5 lg:px-8 lg:flex-row lg:items-center lg:justify-between">
            <Link
              href={`/dashboard/inspections/${inspectionId}`}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" /> Back to inspection
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10 dark:bg-brand-navy/30">
                <Camera className="h-5 w-5 text-brand-navy dark:text-slate-100" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-white">
                  Start Guided Capture
                </h1>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {inspectionData?.inspectionNumber} ·{" "}
                  {inspectionData?.propertyAddress}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="w-full px-4 py-8 lg:px-8 lg:py-10">
          <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8">
            <section className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:p-8 xl:col-span-7">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Job type
                </label>
                <Select
                  value={selectedJobType}
                  onValueChange={(v) => setSelectedJobType(v as JobType)}
                >
                  <SelectTrigger className="h-11 w-full">
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
                  Sets the evidence steps captured for this job.
                </p>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Experience level
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExperienceLevel("APPRENTICE")}
                    className={cn(
                      "rounded-lg border-2 p-5 text-left transition-all",
                      experienceLevel === "APPRENTICE"
                        ? "border-brand-navy bg-brand-navy/5 dark:bg-brand-navy/20"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                    )}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Apprentice
                    </div>
                    <div className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Detailed guidance, sub-steps, and confirming questions at
                      each stage.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExperienceLevel("EXPERIENCED")}
                    className={cn(
                      "rounded-lg border-2 p-5 text-left transition-all",
                      experienceLevel === "EXPERIENCED"
                        ? "border-brand-navy bg-brand-navy/5 dark:bg-brand-navy/20"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                    )}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Experienced
                    </div>
                    <div className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Consolidated steps with minimal prompts; exceptions only
                      when needed.
                    </div>
                  </button>
                </div>
              </div>
            </section>

            <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:p-8 xl:col-span-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Workflow preview
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {workflowTemplate.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {workflowTemplate.steps.length} steps
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {mandatorySteps.length} mandatory
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {experienceLevel === "APPRENTICE"
                    ? "Guided mode"
                    : "Experienced mode"}
                </span>
              </div>
              <ol className="mt-6 flex-1 space-y-2 overflow-y-auto text-sm text-slate-600 dark:text-slate-300">
                {workflowTemplate.steps.slice(0, 8).map((step, index) => (
                  <li
                    key={step.stepKey}
                    className="flex gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <span className="font-mono text-xs text-brand-slate dark:text-slate-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{step.stepTitle}</span>
                    {step.isMandatory && (
                      <span className="text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                        Required
                      </span>
                    )}
                  </li>
                ))}
                {workflowTemplate.steps.length > 8 && (
                  <li className="px-3 py-1 text-xs text-brand-slate dark:text-slate-400">
                    +{workflowTemplate.steps.length - 8} more steps
                  </li>
                )}
              </ol>
            </aside>
          </div>

          <div className="mt-8 flex w-full flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-9xl text-sm text-slate-500 dark:text-slate-400">
              Chain-of-custody and evidence class requirements apply to every
              capture step. You can change experience level later from the
              workflow sidebar.
            </p>
            <Button
              onClick={handleCreateWorkflow}
              disabled={creating}
              size="lg"
              className="h-12 w-full bg-brand-navy hover:bg-brand-navy/90 sm:w-auto sm:min-w-[260px]"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating workflow…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Begin guided capture
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
              <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready to submit
              </div>
            )}
          </div>

          {/* Job type + experience badge */}
          <div className="flex items-center gap-2 mt-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-info-subtle text-info-subtle-foreground">
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
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : isSkipped ? (
                      <SkipForward className="h-4 w-4 text-amber-500" />
                    ) : isActive ? (
                      <Play className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-brand-slate dark:text-slate-600" />
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
                        <Shield className="h-3 w-3 text-destructive flex-shrink-0" />
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
                              ? "text-destructive"
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
        {pendingCapture && (
          <div role="alert" className="mx-auto mb-4 flex w-full max-w-9xl flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span className="flex-1">Photo captured but its job attachment is not verified. Keep this page open and retry, or save the original file.</span>
            <button type="button" onClick={() => void retryPendingCapture()} disabled={uploadingEvidence} className="rounded border px-2 py-1 disabled:opacity-50">Retry pending photo</button>
            <button type="button" onClick={savePendingCaptureCopy} className="rounded border px-2 py-1">Save original copy</button>
            <button type="button" onClick={() => void discardPendingCapture()} disabled={uploadingEvidence} className="rounded border border-red-500 px-2 py-1 disabled:opacity-50">Clear pending selection</button>
          </div>
        )}
        {pendingRawFile && !pendingCapture && !uploadingEvidence && (
          <div role="alert" className="mx-auto mb-4 flex w-full max-w-9xl flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span className="flex-1">The selected photo could not be prepared or attached. It remains on this page. Retry or save the original file.</span>
            <button type="button" onClick={() => void retryPendingRawFile()} className="rounded border px-2 py-1">Retry selected photo</button>
            <button type="button" onClick={savePendingCaptureCopy} className="rounded border px-2 py-1">Save original copy</button>
            <button type="button" onClick={() => void discardPendingCapture()} className="rounded border border-red-500 px-2 py-1">Discard selected photo</button>
          </div>
        )}
        {pickerPending && (
          <div role="status" className="mx-auto mb-4 flex w-full max-w-9xl flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span className="flex-1">Waiting for your camera or file picker. If you closed it without choosing a photo, end this selection.</span>
            <button type="button" onClick={() => pickerAbortRef.current?.abort()} className="rounded border px-2 py-1">I did not choose a photo</button>
          </div>
        )}
        {/* Step header */}
        <div className="mx-auto w-full max-w-9xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold",
                  activeStep.status === "COMPLETED"
                    ? "bg-success-subtle text-success-subtle-foreground"
                    : activeStep.status === "SKIPPED"
                      ? "bg-warning-subtle text-warning-subtle-foreground"
                      : "bg-info-subtle text-info-subtle-foreground",
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
                    <span className="text-xs text-destructive font-medium flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Mandatory
                    </span>
                  )}
                  {activeStep.riskTier >= 2 && (
                    <span
                      className={cn(
                        "text-xs font-medium flex items-center gap-1",
                        activeStep.riskTier === 3
                          ? "text-destructive"
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

          {isNative && offlineCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-600/50 rounded-lg px-4 py-2 text-sm text-amber-700 dark:text-amber-300 mb-4">
              Working offline — {offlineCount} item{offlineCount > 1 ? "s" : ""} queued
            </div>
          )}

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

            {/* RA-8388: shown while the list is reloaded after "Close and
                check". The reading and note controls below are held until
                it has answered. */}
            {checkingSavedEvidence && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-slate-800 dark:text-slate-200"
              >
                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                <span>
                  Checking what was saved...
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    You can add readings and notes to this step again when
                    the check has finished.
                  </span>
                </span>
              </div>
            )}

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
                              ? "bg-success-subtle text-success-subtle-foreground"
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
                      {/* RA-8388 AMENDMENT 03 §N: the Capture control STAYS.
                          This used to be `hasCaptured ? <tick/> : <Button/>`,
                          so one item per class was the ceiling and
                          moisture_survey - which asks for five - could never
                          be satisfied. The tick now reports progress beside
                          the button instead of replacing it. Whether the step
                          has enough evidence is the completion gate's
                          question, answered by counting what was captured. */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasCaptured && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {captured.length}
                          </span>
                        )}
                        {canCaptureAnother(cls, captured.length) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              handleCaptureEvidence(activeStep.id, cls)
                            }
                            disabled={
                              uploadingEvidence ||
                              (checkingSavedEvidence && isMetadataOnlyClass(cls))
                            }
                          >
                            {uploadingEvidence &&
                            selectedEvidenceClass === cls ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                {isNative ? (
                                  <Camera className="h-3 w-3 mr-1" />
                                ) : (
                                  <Upload className="h-3 w-3 mr-1" />
                                )}{" "}
                                {hasCaptured ? "Add another" : "Capture"}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Show captured evidence for this class */}
                    {captured.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {captured.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-start justify-between gap-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded p-1.5"
                          >
                            <div className="flex items-start gap-1.5 min-w-0 flex-1">
                              {ev.fileMimeType?.startsWith("video/") ? (
                                <Video
                                  className="h-3 w-3 flex-shrink-0"
                                  aria-label="Video"
                                />
                              ) : ev.thumbnailUrl || ev.fileUrl ? (
                                <img
                                  src={ev.thumbnailUrl || ev.fileUrl || ""}
                                  alt=""
                                  className="h-7 w-7 rounded object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
                                />
                              ) : (
                                <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                {/* RA-8488: on its own line and allowed to
                                    wrap. In the details line it was cut to
                                    "Syntheti..." on a phone, so two readings
                                    still looked the same. */}
                                {recordTitle(ev) && (
                                  <p
                                    data-testid="evidence-record-title"
                                    className="text-xs font-medium leading-snug text-slate-800 dark:text-slate-200 break-words whitespace-normal"
                                  >
                                    {recordTitle(ev)}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  <span className="truncate">{ev.capturedByName}</span>
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
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteEvidence(ev.id)}
                              className="text-destructive hover:text-destructive p-0.5"
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
                    // Same rule as the required section, from the same
                    // module. These were two separate ternaries holding one
                    // idea, which is how one of them gets fixed and the other
                    // is left behind.
                    const capturedCount = stepEvidence.filter(
                      (e) => e.evidenceClass === cls,
                    ).length;
                    const hasCaptured = capturedCount > 0;
                    const canAdd = canCaptureAnother(cls, capturedCount);
                    return (
                      <button
                        key={cls}
                        onClick={() => {
                          if (canAdd) {
                            handleCaptureEvidence(activeStep.id, cls);
                          }
                        }}
                        disabled={
                          !canAdd ||
                          uploadingEvidence ||
                          (checkingSavedEvidence && isMetadataOnlyClass(cls))
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                          hasCaptured
                            ? "border-success-subtle-foreground/30 bg-success-subtle text-success-subtle-foreground"
                            : "border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {hasCaptured ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          evidenceIcon(cls)
                        )}
                        {EVIDENCE_CLASS_LABELS[cls]}
                        {capturedCount > 1 && ` (${capturedCount})`}
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
              <span className="text-xs text-success flex items-center gap-1">
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
          {submitRefusal && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5 mb-6"
            >
              <p className="text-sm font-semibold text-destructive">
                {submitRefusal.message}
              </p>
              {submitRefusal.items.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {submitRefusal.items.map((item) => (
                    <li
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <span>{item.label}</span>
                      {item.href && item.action && (
                        <Link
                          href={item.href}
                          className="font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2"
                        >
                          {item.action}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <SubmissionGatePanel
            inspectionId={inspectionId}
            isReadyToSubmit={workflow.isReadyToSubmit}
            onSubmit={handleSubmitInspection}
            submitting={submitting}
            revalidateKey={evidenceItems.length}
            onSelectStep={(stepKey) => {
              const idx = workflow.steps.findIndex(
                (s) => s.stepKey === stepKey,
              );
              if (idx < 0) return;
              setActiveStepIndex(idx);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />

          {/* ============================================ */}
          {/* FIELD EVIDENCE CHECKLIST (RA-5039, informational) */}
          {/* ============================================ */}
          <FieldEvidenceChecklistPanel inspectionId={inspectionId} />
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
                <span className="block mt-1 text-destructive font-medium">
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
      {/* RA-8388: the metadata capture form. Keyed by class AND step so a
          different entry never inherits the previous one's typed values -
          `location` belongs to three of the four field contracts. */}
      {metadataCapture && (
        <MetadataCaptureForm
          key={`${metadataCapture.stepId}:${metadataCapture.evidenceClass}`}
          open
          evidenceClass={metadataCapture.evidenceClass}
          evidenceClassLabel={
            EVIDENCE_CLASS_LABELS[metadataCapture.evidenceClass]
          }
          inspectionId={inspectionId}
          workflowStepId={metadataCapture.stepId}
          deviceType={isNative ? "NATIVE_CAPACITOR" : "WEB_BROWSER"}
          submit={(
            draft: MetadataEvidenceDraft,
            signedCache: Map<string, SignedRequestBytes>,
          ) =>
            submitMetadataEvidence(draft, {
              userId: session?.user?.id ?? "",
              ensureKey: () =>
                ensureDeviceKeyRegistered(isNative ? "capacitor" : "web"),
              rotateKey: async () => {
                await recoverFromRejectedKey(isNative ? "capacitor" : "web");
              },
              // The FORM's cache, passed through. The page's own
              // `signedRequestCache` is cleared on unrelated events, which
              // would force a re-sign between an attempt and its retry and
              // turn a legitimate replay into a second submission.
              signedCache,
            })
          }
          onSaved={(result) => {
            const created = (
              result.data as { evidenceItem?: EvidenceItem } | null
            )?.evidenceItem;
            // A replayed idempotent response can arrive without the row
            // echoed back. The submission still succeeded, so leave the list
            // alone and let the next load reconcile it rather than prepending
            // `undefined` and blanking the step's evidence.
            // RA-8388: held once. The duplicate answer (`alreadyRecorded`)
            // returns a record this list may already show.
            if (created) {
              evidenceListVersion.current += 1;
              formSavedRecord.current = true;
              setEvidenceItems((prev) => withSavedEvidence(prev, created));
            }
            showSavedEvidenceNotice(metadataCapture.evidenceClass, result.data);
          }}
          onClose={(reason) => {
            const closedStepId = metadataCapture.stepId;
            setMetadataCapture(null);
            setSelectedEvidenceClass(null);
            // RA-8388: "Close and check" must show what the job holds now.
            // The form says why it closed. No attempt means nothing to
            // check, so a plain Cancel does not reload (and cannot fail to).
            // Any other close reloads, except the one straight after a save
            // whose record `onSaved` has just put on the list. A close with
            // no reason is treated as an attempt that was not confirmed
            // saved: the safe side.
            const alreadyListed = formSavedRecord.current;
            formSavedRecord.current = false;
            if (reason === "no-attempt" || alreadyListed) return;
            void reloadEvidenceItems(closedStepId);
          }}
        />
      )}
      <confirm.Mount />
    </div>
  );
}
