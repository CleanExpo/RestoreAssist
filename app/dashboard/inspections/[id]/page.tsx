"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";
import { NirPilotSurvey } from "@/components/nir-pilot-survey";
import { MobileNav } from "@/components/mobile/MobileNav";
import dynamic from "next/dynamic";
const PortalInvitePanel = dynamic(
  () => import("@/components/inspection/PortalInvitePanel"),
  { ssr: false },
);
const SketchEditor = dynamic(
  () =>
    import("@/components/sketch/SketchEditor").then((m) => ({
      default: m.SketchEditor,
    })),
  { ssr: false },
);
const ExportPdfButton = dynamic(
  () => import("@/components/inspection/ExportPdfButton"),
  { ssr: false },
);
const ActivityTimeline = dynamic(
  () => import("@/components/inspection/ActivityTimeline"),
  { ssr: false },
);
const AutoClassifyPanel = dynamic(
  () => import("@/components/inspection/AutoClassifyPanel"),
  { ssr: false },
);
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Calendar,
  User,
  Droplets,
  Thermometer,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  DollarSign,
  Camera,
  Shield,
  Layers,
  CheckCircle2,
  Clock,
  XCircle,
  Map,
  PenLine,
  Receipt,
  Upload,
  History,
  ListChecks,
  Pencil,
  Trash2,
  Plus,
  X,
  Save,
  FileDown,
  Building2,
  ExternalLink,
  Mic,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { IICRC_CHECKLISTS } from "@/lib/iicrc-checklists";
import { GroupReadingsPanel } from "@/components/inspection/GroupReadingsPanel";
import Link from "next/link";

type Tab =
  | "overview"
  | "environmental"
  | "moisture"
  | "moisture-map"
  | "sketch"
  | "areas"
  | "classification"
  | "scope"
  | "costs"
  | "photos"
  | "activity"
  | "insurer";

interface Inspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  propertyPostcode: string;
  technicianName: string | null;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  processedAt: string | null;
  environmentalData: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint: number | null;
    airCirculation: boolean;
    weatherConditions: string | null;
    notes: string | null;
  } | null;
  moistureReadings: {
    id: string;
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: string;
    notes: string | null;
    photoUrl: string | null;
  }[];
  affectedAreas: {
    id: string;
    roomZoneId: string;
    affectedSquareFootage: number;
    waterSource: string;
    timeSinceLoss: number | null;
    category: string | null;
    class: string | null;
    description: string | null;
  }[];
  scopeItems: {
    id: string;
    itemType: string;
    description: string;
    quantity: number | null;
    unit: string | null;
    justification: string | null;
    isRequired: boolean;
    isSelected: boolean;
    autoDetermined: boolean;
  }[];
  classifications: {
    id: string;
    category: string;
    class: string;
    justification: string;
    standardReference: string;
    confidence: number | null;
  }[];
  costEstimates: {
    id: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    subtotal: number;
    total: number;
  }[];
  photos: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    location: string | null;
    description: string | null;
    timestamp: string;
  }[];
  auditLogs: {
    id: string;
    action: string;
    timestamp: string;
  }[];
}

const STATUS_STEPS = [
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "COMPLETED",
];

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);
  const isRejected = currentStatus === "REJECTED";

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STATUS_STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isComplete = i < currentIndex;
        return (
          <div key={step} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                isComplete &&
                  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
                isActive &&
                  !isRejected &&
                  "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 ring-2 ring-cyan-500/30",
                isActive &&
                  isRejected &&
                  "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-2 ring-red-500/30",
                !isComplete &&
                  !isActive &&
                  "bg-neutral-100 dark:bg-slate-800 text-neutral-400 dark:text-slate-500",
              )}
            >
              {isComplete ? (
                <CheckCircle2 size={12} />
              ) : isActive ? (
                <Clock size={12} />
              ) : null}
              {step.charAt(0) + step.slice(1).toLowerCase()}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div
                className={cn(
                  "w-4 h-0.5 mx-0.5",
                  i < currentIndex
                    ? "bg-emerald-400"
                    : "bg-neutral-200 dark:bg-slate-700",
                )}
              />
            )}
          </div>
        );
      })}
      {isRejected && (
        <div className="flex items-center">
          <div className="w-4 h-0.5 mx-0.5 bg-red-400" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-2 ring-red-500/30">
            <XCircle size={12} /> Rejected
          </div>
        </div>
      )}
    </div>
  );
}

function moistureColor(level: number): string {
  if (level < 15) return "text-emerald-600 dark:text-emerald-400";
  if (level < 25) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function moistureBg(level: number): string {
  if (level < 15) return "bg-emerald-50 dark:bg-emerald-900/20";
  if (level < 25) return "bg-amber-50 dark:bg-amber-900/20";
  return "bg-red-50 dark:bg-red-900/20";
}

export default function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [scopeItems, setScopeItems] = useState<Inspection["scopeItems"]>([]);
  const [showAddScope, setShowAddScope] = useState(false);
  const [editingScopeItem, setEditingScopeItem] = useState<string | null>(null);
  const [addScopeForm, setAddScopeForm] = useState({
    description: "",
    itemType: "",
    quantity: "",
    unit: "",
  });
  const [editScopeForm, setEditScopeForm] = useState({
    description: "",
    quantity: "",
    unit: "",
  });
  const [envData, setEnvData] = useState<Inspection["environmentalData"]>(null);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [envForm, setEnvForm] = useState({
    ambientTemperature: 20,
    humidityLevel: 50,
    airCirculation: false,
    weatherConditions: "",
    notes: "",
  });
  const [savingEnv, setSavingEnv] = useState(false);
  const [moistureReadings, setMoistureReadings] = useState<
    Inspection["moistureReadings"]
  >([]);
  const [showAddMoisture, setShowAddMoisture] = useState(false);
  const [moistureForm, setMoistureForm] = useState({
    location: "",
    surfaceType: "",
    moistureLevel: 0,
    depth: "Surface",
    notes: "",
  });
  const [addingMoisture, setAddingMoisture] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingDisputePack, setGeneratingDisputePack] = useState(false);
  const [affectedAreas, setAffectedAreas] = useState<
    Inspection["affectedAreas"]
  >([]);
  const [showAddAreaForm, setShowAddAreaForm] = useState(false);
  const [areaForm, setAreaForm] = useState({
    roomZoneId: "",
    affectedSquareFootage: "",
    waterSource: "",
    timeSinceLoss: "",
    description: "",
  });
  const [areaSubmitting, setAreaSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>("");
  const [applyingChecklist, setApplyingChecklist] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    fetchInspection();
  }, [id]);

  const fetchInspection = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/inspections/${id}`);
      if (response.ok) {
        const data = await response.json();
        setInspection(data.inspection);
        setScopeItems(data.inspection.scopeItems ?? []);
        setMoistureReadings(data.inspection.moistureReadings ?? []);
        setAffectedAreas(data.inspection.affectedAreas ?? []);
        setEnvData(data.inspection.environmentalData);
        const ed = data.inspection.environmentalData;
        if (ed) {
          setEnvForm({
            ambientTemperature: ed.ambientTemperature ?? 20,
            humidityLevel: ed.humidityLevel ?? 50,
            airCirculation: ed.airCirculation ?? false,
            weatherConditions: ed.weatherConditions ?? "",
            notes: ed.notes ?? "",
          });
        }
      } else {
        toast.error("Inspection not found");
        router.push("/dashboard/inspections");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load inspection");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/inspections/${inspection!.id}/photos`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          toast.error("Failed to upload photo");
          continue;
        }
        const data = await res.json();
        setInspection((prev) =>
          prev ? { ...prev, photos: [...prev.photos, data.photo] } : prev,
        );
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleShareWithClient = async () => {
    if (!inspection) return;
    setShareLoading(true);
    setShareDialogOpen(true);
    try {
      const res = await fetch("/api/portal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: inspection.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.portalUrl);
        setShareExpiry(
          new Date(data.expiresAt).toLocaleDateString("en-AU", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        );
      } else {
        toast.error("Failed to generate portal link");
        setShareDialogOpen(false);
      }
    } catch {
      toast.error("Failed to generate portal link");
      setShareDialogOpen(false);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const applyChecklist = async () => {
    if (!selectedChecklistId) return;
    setApplyingChecklist(true);
    try {
      const res = await fetch(`/api/inspections/${id}/apply-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklistId: selectedChecklistId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply checklist");
      toast.success(
        `Added ${data.added} scope item${data.added !== 1 ? "s" : ""}${data.skipped > 0 ? ` (${data.skipped} already existed)` : ""}`,
      );
      setChecklistDialogOpen(false);
      setSelectedChecklistId("");
      fetchInspection();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to apply checklist",
      );
    } finally {
      setApplyingChecklist(false);
    }
  };

  const calcDewPoint = (temp: number, humidity: number) =>
    Math.round((temp - (100 - humidity) / 5) * 10) / 10;

  const handleEnvSave = async () => {
    setSavingEnv(true);
    try {
      const dewPoint = calcDewPoint(
        envForm.ambientTemperature,
        envForm.humidityLevel,
      );
      const res = await fetch(
        `/api/inspections/${inspection!.id}/environmental`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...envForm, dewPoint }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEnvData(data.environmentalData);
      setShowEnvForm(false);
      toast.success("Environmental data saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEnv(false);
    }
  };

  const handleAddMoisture = async () => {
    setAddingMoisture(true);
    try {
      const res = await fetch(`/api/inspections/${inspection!.id}/moisture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moistureForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMoistureReadings((prev) => [...prev, data.moistureReading]);
      setMoistureForm({
        location: "",
        surfaceType: "",
        moistureLevel: 0,
        depth: "Surface",
        notes: "",
      });
      setShowAddMoisture(false);
      toast.success("Reading added");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add reading");
    } finally {
      setAddingMoisture(false);
    }
  };

  const handleDeleteMoisture = async (readingId: string) => {
    setMoistureReadings((prev) => prev.filter((r) => r.id !== readingId));
    try {
      const res = await fetch(
        `/api/inspections/${inspection!.id}/moisture/${readingId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setMoistureReadings(inspection!.moistureReadings);
        toast.error("Failed to delete reading");
      }
    } catch {
      setMoistureReadings(inspection!.moistureReadings);
      toast.error("Failed to delete reading");
    }
  };

  async function handleGenerateReport() {
    setGeneratingReport(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspection!.id}/report?format=pdf`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? "Report generation failed",
        );
      }
      const contentType = res.headers.get("content-type") ?? "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = contentType.includes("pdf")
        ? "pdf"
        : contentType.includes("sheet") || contentType.includes("excel")
          ? "xlsx"
          : "pdf";
      a.download = `nir-report-${inspection!.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report generation error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to generate report",
      );
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleGenerateDisputePack() {
    if (!inspection) return;
    setGeneratingDisputePack(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspection.id}/dispute-pack`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? "Dispute pack generation failed",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispute-pack-${inspection.inspectionNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Dispute Defence Pack downloaded");
    } catch (err) {
      console.error("Dispute pack generation error:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to generate dispute pack",
      );
    } finally {
      setGeneratingDisputePack(false);
    }
  }

  async function handleAddArea() {
    if (!inspection) return;
    if (!areaForm.roomZoneId.trim()) {
      toast.error("Room / Zone ID is required");
      return;
    }
    const sqft = parseFloat(areaForm.affectedSquareFootage);
    if (!sqft || sqft <= 0) {
      toast.error("Affected area must be greater than 0");
      return;
    }
    if (!areaForm.waterSource.trim()) {
      toast.error("Water source is required");
      return;
    }
    setAreaSubmitting(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspection.id}/affected-areas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomZoneId: areaForm.roomZoneId.trim(),
            affectedSquareFootage: sqft,
            waterSource: areaForm.waterSource.trim(),
            timeSinceLoss: areaForm.timeSinceLoss
              ? parseFloat(areaForm.timeSinceLoss)
              : null,
            description: areaForm.description || null,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? "Failed to add area",
        );
      }
      const data = await res.json();
      setAffectedAreas((prev) => [...prev, data.affectedArea]);
      setAreaForm({
        roomZoneId: "",
        affectedSquareFootage: "",
        waterSource: "",
        timeSinceLoss: "",
        description: "",
      });
      setShowAddAreaForm(false);
      toast.success("Area added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add area");
    } finally {
      setAreaSubmitting(false);
    }
  }

  async function handleDeleteArea(areaId: string) {
    if (!inspection) return;
    try {
      const res = await fetch(
        `/api/inspections/${inspection.id}/affected-areas/${areaId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Delete failed");
      setAffectedAreas((prev) => prev.filter((a) => a.id !== areaId));
      toast.success("Area removed");
    } catch {
      toast.error("Failed to delete area");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <XCircle className="text-red-500" size={40} />
        <p className="text-gray-400 text-sm">
          {loadError
            ? "Could not load inspection. Check your connection and try again."
            : "Inspection not found."}
        </p>
        {loadError && (
          <Button
            variant="outline"
            onClick={() => {
              setLoadError(false);
              fetchInspection();
            }}
          >
            Retry
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/inspections")}
        >
          Back to inspections
        </Button>
      </div>
    );
  }

  const classification = inspection.classifications?.[0];
  const totalCost = inspection.costEstimates.reduce(
    (sum, c) => sum + c.total,
    0,
  );

  const TABS: {
    key: Tab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    { key: "overview", label: "Overview", icon: ClipboardCheck },
    { key: "environmental", label: "Environmental", icon: Thermometer },
    {
      key: "moisture",
      label: "Moisture",
      icon: Droplets,
      count: moistureReadings.length,
    },
    { key: "moisture-map", label: "Moisture Map", icon: Map },
    { key: "sketch", label: "Floor Plan", icon: PenLine },
    {
      key: "areas",
      label: "Affected Areas",
      icon: AlertTriangle,
      count: affectedAreas.length,
    },
    {
      key: "classification",
      label: "Classification",
      icon: Shield,
      count: inspection.classifications.length,
    },
    {
      key: "scope",
      label: "Scope Items",
      icon: Layers,
      count: scopeItems.length,
    },
    {
      key: "costs",
      label: "Cost Estimates",
      icon: DollarSign,
      count: inspection.costEstimates.length,
    },
    {
      key: "photos",
      label: "Photos",
      icon: Camera,
      count: inspection.photos.length,
    },
    { key: "activity", label: "Activity", icon: History },
    { key: "insurer", label: "Insurer Profile", icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/dashboard/inspections")}
          aria-label="Back to inspections"
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              {inspection.inspectionNumber}
            </h1>
            {classification && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                Category {classification.category} / Class{" "}
                {classification.class}
              </span>
            )}
            {inspection.status === "COMPLETED" && (
              <button
                onClick={handleGenerateReport}
                disabled={generatingReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
              >
                {generatingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Generate NIR Report
                  </>
                )}
              </button>
            )}
            <ExportPdfButton inspectionId={inspection.id} />
            {(inspection.status === "SUBMITTED" ||
              inspection.status === "COMPLETED") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDisputePack}
                disabled={generatingDisputePack}
                className="text-xs gap-1.5 border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10"
              >
                {generatingDisputePack ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                {generatingDisputePack
                  ? "Generating..."
                  : "Dispute Defence Pack"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareWithClient}
              className="text-xs gap-1.5"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Share with Client
            </Button>
            <Link
              href={`/dashboard/inspections/${inspection.id}/voice`}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#1C2E47] text-[#1C2E47] dark:border-[#D4A574] dark:text-[#D4A574] hover:bg-[#1C2E47]/10 text-xs font-semibold transition-colors"
            >
              <Mic size={14} />
              Voice Copilot
            </Link>
            <Link
              href={`/dashboard/inspections/${inspection.id}/invoice`}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-cyan-500 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 text-xs font-semibold transition-colors ml-auto"
            >
              <Receipt size={14} />
              Generate Invoice
            </Link>
          </div>

          {/* Share Dialog */}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Share with Client</DialogTitle>
              </DialogHeader>
              <div className="py-2" aria-live="polite" aria-atomic="true">
                {shareLoading ? (
                  <div
                    role="status"
                    aria-label="Generating client portal link"
                    className="flex items-center justify-center py-4"
                  >
                    <Loader2
                      className="animate-spin text-cyan-500"
                      size={24}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      Generating client portal link…
                    </span>
                  </div>
                ) : shareUrl ? (
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-600 dark:text-slate-300">
                      Portal link valid until {shareExpiry}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareUrl}
                        aria-label="Client portal link"
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800"
                      />
                      <Button size="sm" onClick={handleCopyShareUrl}>
                        {shareCopied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
          <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <MapPin size={14} />
              {inspection.propertyAddress} ({inspection.propertyPostcode})
            </span>
            {inspection.technicianName && (
              <span className="flex items-center gap-1">
                <User size={14} />
                {inspection.technicianName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {new Date(inspection.createdAt).toLocaleDateString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <StatusTimeline currentStatus={inspection.status} />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Inspection sections"
        className="flex gap-1 overflow-x-auto pb-1 border-b border-neutral-200 dark:border-slate-700"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            id={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none",
              activeTab === tab.key
                ? "border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-900/10"
                : "border-transparent text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/50",
            )}
          >
            <tab.icon size={16} aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined && (
              <span
                aria-label={`${tab.count} items`}
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-xs",
                  activeTab === tab.key
                    ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600"
                    : "bg-neutral-100 dark:bg-slate-800 text-neutral-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Moisture Readings
              </div>
              <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                {inspection.moistureReadings.length}
              </div>
              {inspection.moistureReadings.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  Avg:{" "}
                  {(
                    inspection.moistureReadings.reduce(
                      (s, r) => s + r.moistureLevel,
                      0,
                    ) / inspection.moistureReadings.length
                  ).toFixed(1)}
                  %
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Affected Areas
              </div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {inspection.affectedAreas.length}
              </div>
              {inspection.affectedAreas.length > 0 && (
                <div className="text-xs text-neutral-500 mt-1">
                  Total:{" "}
                  {inspection.affectedAreas
                    .reduce((s, a) => s + a.affectedSquareFootage, 0)
                    .toFixed(0)}{" "}
                  sq ft
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Scope Items
              </div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {scopeItems.filter((s) => s.isSelected).length}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {scopeItems.filter((s) => s.autoDetermined).length}{" "}
                auto-determined
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Estimated Cost
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                $
                {totalCost.toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {inspection.costEstimates.length} line items
              </div>
            </div>

            {/* Classification Card */}
            {classification && (
              <div className="md:col-span-2 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
                  IICRC S500 Classification
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <span className="text-sm text-neutral-500 dark:text-slate-400">
                      Category
                    </span>
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">
                      {classification.category}
                    </div>
                  </div>
                  <div className="w-px h-10 bg-amber-200 dark:bg-amber-800" />
                  <div>
                    <span className="text-sm text-neutral-500 dark:text-slate-400">
                      Class
                    </span>
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">
                      {classification.class}
                    </div>
                  </div>
                  {classification.confidence && (
                    <>
                      <div className="w-px h-10 bg-amber-200 dark:bg-amber-800" />
                      <div>
                        <span className="text-sm text-neutral-500 dark:text-slate-400">
                          Confidence
                        </span>
                        <div className="text-xl font-bold text-neutral-900 dark:text-white">
                          {classification.confidence}%
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <p className="text-sm text-neutral-600 dark:text-slate-300">
                  {classification.justification}
                </p>
                <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">
                  Ref: {classification.standardReference}
                </p>
              </div>
            )}

            {/* Environmental Summary */}
            {inspection.environmentalData && (
              <div className="md:col-span-2 p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
                <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Environmental Conditions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-neutral-400">
                      Temperature
                    </span>
                    <div className="text-lg font-semibold">
                      {inspection.environmentalData.ambientTemperature}°C
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Humidity</span>
                    <div className="text-lg font-semibold">
                      {inspection.environmentalData.humidityLevel}%
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">Dew Point</span>
                    <div className="text-lg font-semibold">
                      {inspection.environmentalData.dewPoint?.toFixed(1) ??
                        "N/A"}
                      °C
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400">
                      Air Circulation
                    </span>
                    <div className="text-lg font-semibold">
                      {inspection.environmentalData.airCirculation
                        ? "Yes"
                        : "No"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Portal Invite */}
            <div className="lg:col-span-4 md:col-span-2">
              <PortalInvitePanel
                inspectionId={inspection.id}
                preselectedClientId={null}
              />
            </div>
          </div>
        )}

        {/* Environmental Tab */}
        {activeTab === "environmental" && (
          <div className="max-w-2xl space-y-4">
            {envData && !showEnvForm ? (
              <div className="p-6 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Thermometer className="text-cyan-500" size={20} />
                    Environmental Data
                  </h3>
                  <button
                    onClick={() => setShowEnvForm(true)}
                    className="text-sm text-cyan-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Ambient Temperature
                    </label>
                    <p className="text-2xl font-bold mt-1">
                      {envData.ambientTemperature}°C
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Humidity Level
                    </label>
                    <p className="text-2xl font-bold mt-1">
                      {envData.humidityLevel}%
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Dew Point
                    </label>
                    <p className="text-2xl font-bold mt-1">
                      {envData.dewPoint?.toFixed(1) ?? "Not calculated"}°C
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Air Circulation
                    </label>
                    <p className="text-2xl font-bold mt-1">
                      {envData.airCirculation ? "Active" : "None"}
                    </p>
                  </div>
                </div>
                {envData.weatherConditions && (
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Weather Conditions
                    </label>
                    <p className="mt-1 text-neutral-700 dark:text-slate-300">
                      {envData.weatherConditions}
                    </p>
                  </div>
                )}
                {envData.notes && (
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider">
                      Notes
                    </label>
                    <p className="mt-1 text-neutral-700 dark:text-slate-300">
                      {envData.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Thermometer className="text-cyan-500" size={20} />
                  {envData
                    ? "Edit Environmental Data"
                    : "Add Environmental Data"}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Temperature (°C)
                    </label>
                    <input
                      type="number"
                      value={envForm.ambientTemperature}
                      onChange={(e) =>
                        setEnvForm((f) => ({
                          ...f,
                          ambientTemperature: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Humidity (%)
                    </label>
                    <input
                      type="number"
                      value={envForm.humidityLevel}
                      onChange={(e) =>
                        setEnvForm((f) => ({
                          ...f,
                          humidityLevel: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 text-sm text-cyan-700 dark:text-cyan-300">
                  Auto dew point:{" "}
                  <strong>
                    {calcDewPoint(
                      envForm.ambientTemperature,
                      envForm.humidityLevel,
                    )}
                    °C
                  </strong>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="airCirc"
                    checked={envForm.airCirculation}
                    onChange={(e) =>
                      setEnvForm((f) => ({
                        ...f,
                        airCirculation: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <label htmlFor="airCirc" className="text-sm">
                    Air Circulation Active
                  </label>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                    Weather Conditions
                  </label>
                  <input
                    type="text"
                    value={envForm.weatherConditions}
                    onChange={(e) =>
                      setEnvForm((f) => ({
                        ...f,
                        weatherConditions: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    placeholder="e.g. Sunny, 28°C"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                    Notes
                  </label>
                  <textarea
                    value={envForm.notes}
                    onChange={(e) =>
                      setEnvForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEnvSave}
                    disabled={savingEnv}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {savingEnv ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    {savingEnv ? "Saving..." : "Save"}
                  </button>
                  {envData && (
                    <button
                      onClick={() => setShowEnvForm(false)}
                      className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
            {!envData && !showEnvForm && (
              <button
                onClick={() => setShowEnvForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} /> Add Environmental Data
              </button>
            )}
          </div>
        )}

        {/* Moisture Readings Tab */}
        {activeTab === "moisture" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-white">
                Moisture Readings ({moistureReadings.length})
              </h3>
              <button
                onClick={() => setShowAddMoisture((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} /> Add Reading
              </button>
            </div>
            <GroupReadingsPanel
              inspectionId={inspection!.id}
              readings={moistureReadings.map((r) => ({
                id: r.id,
                location: r.location,
                moistureLevel: r.moistureLevel,
              }))}
              onApplied={() => router.refresh()}
            />
            {showAddMoisture && (
              <div className="p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/30 dark:bg-cyan-900/10 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={moistureForm.location}
                      onChange={(e) =>
                        setMoistureForm((f) => ({
                          ...f,
                          location: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      placeholder="e.g. Living Room Wall"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Surface Type
                    </label>
                    <input
                      type="text"
                      value={moistureForm.surfaceType}
                      onChange={(e) =>
                        setMoistureForm((f) => ({
                          ...f,
                          surfaceType: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      placeholder="e.g. drywall"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Moisture Level (%)
                    </label>
                    <input
                      type="number"
                      value={moistureForm.moistureLevel}
                      onChange={(e) =>
                        setMoistureForm((f) => ({
                          ...f,
                          moistureLevel: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Depth
                    </label>
                    <select
                      value={moistureForm.depth}
                      onChange={(e) =>
                        setMoistureForm((f) => ({
                          ...f,
                          depth: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                      <option>Surface</option>
                      <option>Mid</option>
                      <option>Deep</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={moistureForm.notes}
                      onChange={(e) =>
                        setMoistureForm((f) => ({
                          ...f,
                          notes: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMoisture}
                    disabled={addingMoisture || !moistureForm.location}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {addingMoisture ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    {addingMoisture ? "Adding..." : "Add Reading"}
                  </button>
                  <button
                    onClick={() => setShowAddMoisture(false)}
                    className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {moistureReadings.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Surface Type
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Moisture %
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Depth
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Notes
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                    {moistureReadings.map((reading) => (
                      <tr
                        key={reading.id}
                        className="hover:bg-neutral-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 font-medium text-sm">
                          {reading.location}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-slate-300 capitalize">
                          {reading.surfaceType}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-sm font-semibold",
                              moistureBg(reading.moistureLevel),
                              moistureColor(reading.moistureLevel),
                            )}
                          >
                            {reading.moistureLevel}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-slate-300">
                          {reading.depth}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400 max-w-[200px] truncate">
                          {reading.notes || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteMoisture(reading.id)}
                            aria-label={`Delete moisture reading for ${reading.location}`}
                            className="text-red-400 hover:text-red-600 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none rounded"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No moisture readings recorded
              </div>
            )}
          </div>
        )}

        {/* Moisture Map Tab */}
        {activeTab === "moisture-map" && (
          <div>
            {moistureReadings.length > 0 ? (
              <MoistureMappingCanvas readings={moistureReadings} />
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No moisture readings to map — add readings first
              </div>
            )}
          </div>
        )}

        {/* Floor Plan / Sketch Tab */}
        {activeTab === "sketch" && (
          <div className="min-h-[600px]">
            <SketchEditor
              inspectionId={inspection.id}
              propertyAddress={inspection.propertyAddress ?? undefined}
              propertyPostcode={inspection.propertyPostcode ?? undefined}
            />
          </div>
        )}

        {/* Affected Areas Tab */}
        {activeTab === "areas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-white">
                Affected Areas ({affectedAreas.length})
              </h3>
              <button
                onClick={() => setShowAddAreaForm((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} /> Add Area
              </button>
            </div>
            {showAddAreaForm && (
              <div className="p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/30 dark:bg-cyan-900/10 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Room / Zone ID *
                    </label>
                    <input
                      type="text"
                      value={areaForm.roomZoneId}
                      onChange={(e) =>
                        setAreaForm((f) => ({
                          ...f,
                          roomZoneId: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      placeholder="e.g. Living Room"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Affected Sq Ft *
                    </label>
                    <input
                      type="number"
                      value={areaForm.affectedSquareFootage}
                      onChange={(e) =>
                        setAreaForm((f) => ({
                          ...f,
                          affectedSquareFootage: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      placeholder="e.g. 200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Water Source *
                    </label>
                    <input
                      type="text"
                      value={areaForm.waterSource}
                      onChange={(e) =>
                        setAreaForm((f) => ({
                          ...f,
                          waterSource: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      placeholder="e.g. burst pipe"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Time Since Loss (hours)
                    </label>
                    <input
                      type="number"
                      value={areaForm.timeSinceLoss}
                      onChange={(e) =>
                        setAreaForm((f) => ({
                          ...f,
                          timeSinceLoss: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={areaForm.description}
                      onChange={(e) =>
                        setAreaForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddArea}
                    disabled={areaSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {areaSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    {areaSubmitting ? "Adding..." : "Add Area"}
                  </button>
                  <button
                    onClick={() => setShowAddAreaForm(false)}
                    className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {affectedAreas.length > 0 ? (
                affectedAreas.map((area) => (
                  <div
                    key={area.id}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-neutral-900 dark:text-white">
                        {area.roomZoneId}
                      </h4>
                      <div className="flex items-center gap-2">
                        {area.category && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                            Cat {area.category}
                          </span>
                        )}
                        {area.class && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                            Class {area.class}
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteArea(area.id)}
                          aria-label={`Delete area ${area.roomZoneId}`}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none rounded"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-neutral-400 text-xs">Area</span>
                        <p className="font-medium">
                          {area.affectedSquareFootage} sq ft
                        </p>
                      </div>
                      <div>
                        <span className="text-neutral-400 text-xs">
                          Water Source
                        </span>
                        <p className="font-medium capitalize">
                          {area.waterSource}
                        </p>
                      </div>
                      {area.timeSinceLoss && (
                        <div>
                          <span className="text-neutral-400 text-xs">
                            Time Since Loss
                          </span>
                          <p className="font-medium">{area.timeSinceLoss}h</p>
                        </div>
                      )}
                    </div>
                    {area.description && (
                      <p className="text-sm text-neutral-500 dark:text-slate-400 mt-3">
                        {area.description}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center py-12 text-neutral-400">
                  No affected areas recorded
                </div>
              )}
            </div>
          </div>
        )}

        {/* Classification Tab */}
        {activeTab === "classification" && (
          <div className="space-y-4 max-w-3xl">
            {/* RA-1195: AI auto-classify (IICRC Cat/Class) — suggestion only */}
            <AutoClassifyPanel
              inspectionId={inspection.id}
              onApply={(s) => {
                toast.success(
                  `Suggestion captured: ${s.waterCategory.replace("_", " ")} / ${s.waterClass.replace("_", " ")}. Finalise via the inspection submission flow.`,
                );
              }}
            />
            {inspection.classifications.length > 0 ? (
              inspection.classifications.map((cls) => (
                <div
                  key={cls.id}
                  className="p-6 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10"
                >
                  <div className="flex items-center gap-6 mb-4">
                    <div className="text-center">
                      <div className="text-xs text-amber-600 dark:text-amber-400 uppercase font-semibold mb-1">
                        Category
                      </div>
                      <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {cls.category}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">
                        Class
                      </div>
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {cls.class}
                      </div>
                    </div>
                    {cls.confidence && (
                      <div className="text-center">
                        <div className="text-xs text-cyan-600 dark:text-cyan-400 uppercase font-semibold mb-1">
                          Confidence
                        </div>
                        <div className="w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-2xl font-bold text-cyan-700 dark:text-cyan-300">
                          {cls.confidence}%
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-neutral-400 uppercase font-semibold">
                        Justification
                      </span>
                      <p className="text-sm text-neutral-700 dark:text-slate-300 mt-0.5">
                        {cls.justification}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-400 uppercase font-semibold">
                        Standard Reference
                      </span>
                      <p className="text-sm text-neutral-700 dark:text-slate-300 mt-0.5">
                        {cls.standardReference}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No classification data — submit the inspection to auto-classify
              </div>
            )}
          </div>
        )}

        {/* Scope Items Tab */}
        {activeTab === "scope" && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setChecklistDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-200 dark:border-indigo-800/50"
              >
                <ListChecks size={15} />
                Apply IICRC Checklist
              </button>
              <button
                onClick={() => {
                  setShowAddScope(!showAddScope);
                  setAddScopeForm({
                    description: "",
                    itemType: "",
                    quantity: "",
                    unit: "",
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
              >
                <Plus size={15} />
                Add Scope Item
              </button>
            </div>

            {/* Apply Checklist Dialog */}
            <Dialog
              open={checklistDialogOpen}
              onOpenChange={setChecklistDialogOpen}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ListChecks size={18} className="text-indigo-500" />
                    Apply IICRC Checklist
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                      Select Template
                    </label>
                    <Select
                      value={selectedChecklistId}
                      onValueChange={setSelectedChecklistId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a checklist template…" />
                      </SelectTrigger>
                      <SelectContent>
                        {IICRC_CHECKLISTS.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {tpl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setChecklistDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={applyChecklist}
                    disabled={applyingChecklist || !selectedChecklistId}
                  >
                    {applyingChecklist ? (
                      <Loader2 size={14} className="animate-spin mr-1" />
                    ) : null}
                    Apply Checklist
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {showAddScope && (
              <div className="p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50/30 dark:bg-cyan-900/10 space-y-3">
                <h4 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                  New Scope Item
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">
                      Description *
                    </label>
                    <input
                      type="text"
                      value={addScopeForm.description}
                      onChange={(e) =>
                        setAddScopeForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      placeholder="e.g. Remove wet carpet and pad"
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">
                      Item Type *
                    </label>
                    <input
                      type="text"
                      value={addScopeForm.itemType}
                      onChange={(e) =>
                        setAddScopeForm((f) => ({
                          ...f,
                          itemType: e.target.value,
                        }))
                      }
                      placeholder="e.g. remove_carpet"
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={addScopeForm.quantity}
                      onChange={(e) =>
                        setAddScopeForm((f) => ({
                          ...f,
                          quantity: e.target.value,
                        }))
                      }
                      placeholder="e.g. 25"
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={addScopeForm.unit}
                      onChange={(e) =>
                        setAddScopeForm((f) => ({ ...f, unit: e.target.value }))
                      }
                      placeholder="e.g. sq ft"
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowAddScope(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!addScopeForm.description || !addScopeForm.itemType) {
                        toast.error("Description and Item Type are required");
                        return;
                      }
                      try {
                        const res = await fetch(
                          `/api/inspections/${id}/scope-items`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              description: addScopeForm.description,
                              itemType: addScopeForm.itemType,
                              quantity: addScopeForm.quantity
                                ? parseFloat(addScopeForm.quantity)
                                : null,
                              unit: addScopeForm.unit || null,
                            }),
                          },
                        );
                        if (!res.ok)
                          throw new Error("Failed to add scope item");
                        const data = await res.json();
                        setScopeItems((prev) => [...prev, data.scopeItem]);
                        setShowAddScope(false);
                        setAddScopeForm({
                          description: "",
                          itemType: "",
                          quantity: "",
                          unit: "",
                        });
                        toast.success("Scope item added");
                      } catch {
                        toast.error("Failed to add scope item");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
                  >
                    <Save size={14} /> Add Item
                  </button>
                </div>
              </div>
            )}
            {scopeItems.length > 0 ? (
              scopeItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-4 rounded-xl border bg-white dark:bg-slate-900/50",
                    item.isSelected
                      ? "border-emerald-200 dark:border-emerald-800/50"
                      : "border-neutral-200 dark:border-slate-700/50 opacity-60",
                  )}
                >
                  {editingScopeItem === item.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-neutral-500 uppercase tracking-wider">
                          Description
                        </label>
                        <input
                          type="text"
                          value={editScopeForm.description}
                          onChange={(e) =>
                            setEditScopeForm((f) => ({
                              ...f,
                              description: e.target.value,
                            }))
                          }
                          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-neutral-500 uppercase tracking-wider">
                            Quantity
                          </label>
                          <input
                            type="number"
                            value={editScopeForm.quantity}
                            onChange={(e) =>
                              setEditScopeForm((f) => ({
                                ...f,
                                quantity: e.target.value,
                              }))
                            }
                            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 uppercase tracking-wider">
                            Unit
                          </label>
                          <input
                            type="text"
                            value={editScopeForm.unit}
                            onChange={(e) =>
                              setEditScopeForm((f) => ({
                                ...f,
                                unit: e.target.value,
                              }))
                            }
                            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingScopeItem(null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                `/api/inspections/${id}/scope-items/${item.id}`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    description: editScopeForm.description,
                                    quantity: editScopeForm.quantity
                                      ? parseFloat(editScopeForm.quantity)
                                      : null,
                                    unit: editScopeForm.unit || null,
                                  }),
                                },
                              );
                              if (!res.ok)
                                throw new Error("Failed to update scope item");
                              const data = await res.json();
                              setScopeItems((prev) =>
                                prev.map((s) =>
                                  s.id === item.id
                                    ? { ...s, ...data.scopeItem }
                                    : s,
                                ),
                              );
                              setEditingScopeItem(null);
                              toast.success("Scope item updated");
                            } catch {
                              toast.error("Failed to update scope item");
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
                        >
                          <Save size={14} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <button
                        onClick={async () => {
                          const newSelected = !item.isSelected;
                          setScopeItems((prev) =>
                            prev.map((s) =>
                              s.id === item.id
                                ? { ...s, isSelected: newSelected }
                                : s,
                            ),
                          );
                          try {
                            const res = await fetch(
                              `/api/inspections/${id}/scope-items/${item.id}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  isSelected: newSelected,
                                }),
                              },
                            );
                            if (!res.ok) {
                              setScopeItems((prev) =>
                                prev.map((s) =>
                                  s.id === item.id
                                    ? { ...s, isSelected: !newSelected }
                                    : s,
                                ),
                              );
                              toast.error("Failed to update scope item");
                            }
                          } catch {
                            setScopeItems((prev) =>
                              prev.map((s) =>
                                s.id === item.id
                                  ? { ...s, isSelected: !newSelected }
                                  : s,
                              ),
                            );
                            toast.error("Failed to update scope item");
                          }
                        }}
                        role="checkbox"
                        aria-checked={item.isSelected}
                        aria-label={
                          item.isSelected
                            ? `Deselect: ${item.description}`
                            : `Select: ${item.description}`
                        }
                        className={cn(
                          "w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none",
                          item.isSelected
                            ? "bg-emerald-500 text-white hover:bg-emerald-600"
                            : "bg-neutral-200 dark:bg-slate-700 hover:bg-neutral-300 dark:hover:bg-slate-600",
                        )}
                      >
                        {item.isSelected && (
                          <CheckCircle2 size={14} aria-hidden="true" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {item.description}
                          </span>
                          {item.autoDetermined && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
                              Auto
                            </span>
                          )}
                          {item.isRequired && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                              Required
                            </span>
                          )}
                        </div>
                        {item.justification && (
                          <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">
                            {item.justification}
                          </p>
                        )}
                        {item.quantity && (
                          <p className="text-xs text-neutral-500 mt-1">
                            Qty: {item.quantity} {item.unit}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingScopeItem(item.id);
                            setEditScopeForm({
                              description: item.description,
                              quantity:
                                item.quantity != null
                                  ? String(item.quantity)
                                  : "",
                              unit: item.unit ?? "",
                            });
                          }}
                          aria-label={`Edit scope item: ${item.description}`}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("Delete this scope item?")) return;
                            try {
                              const res = await fetch(
                                `/api/inspections/${id}/scope-items/${item.id}`,
                                { method: "DELETE" },
                              );
                              if (!res.ok)
                                throw new Error("Failed to delete scope item");
                              setScopeItems((prev) =>
                                prev.filter((s) => s.id !== item.id),
                              );
                              toast.success("Scope item deleted");
                            } catch {
                              toast.error("Failed to delete scope item");
                            }
                          }}
                          aria-label={`Delete scope item: ${item.description}`}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No scope items — submit the inspection to auto-determine scope,
                or add one above
              </div>
            )}
          </div>
        )}

        {/* Cost Estimates Tab */}
        {activeTab === "costs" && (
          <div>
            {inspection.costEstimates.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-slate-700/50">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                    {inspection.costEstimates.map((cost) => (
                      <tr
                        key={cost.id}
                        className="hover:bg-neutral-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300">
                            {cost.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {cost.description}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {cost.quantity} {cost.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          ${cost.rate.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          ${cost.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 dark:bg-slate-800/50">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-sm font-semibold text-right"
                      >
                        Total
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-right text-emerald-600 dark:text-emerald-400">
                        $
                        {totalCost.toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No cost estimates — submit the inspection to auto-estimate costs
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <ActivityTimeline inspectionId={inspection.id} />
        )}

        {/* Insurer Profile Tab */}
        {activeTab === "insurer" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Select an insurer to see evidence requirements and submission
                preferences for this inspection.
              </p>
              <a
                href={`/dashboard/inspections/${inspection.id}/insurer-profile`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
              >
                Open Full Profile <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-900 dark:text-white">
                Photos ({inspection.photos.length})
              </h3>
              <div className="flex items-center gap-2">
                {/* RA-448: Link to full evidence screen with label display/editing */}
                <Link
                  href={`/dashboard/inspections/${inspection.id}/photos`}
                  className="flex items-center gap-1.5 px-3 py-2 border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Camera size={14} />
                  Evidence Screen
                </Link>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {uploadingPhoto ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label="Upload inspection photos"
                  aria-hidden="true"
                  tabIndex={-1}
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e.target.files)}
                />
              </div>
              {/* end button group — RA-448 */}
            </div>
            {inspection.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {inspection.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-xl overflow-hidden border border-neutral-200 dark:border-slate-700/50 hover:border-cyan-400 transition-all"
                  >
                    <img
                      src={photo.thumbnailUrl || photo.url}
                      alt={photo.location || "Inspection photo"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {photo.location && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <p className="text-xs text-white truncate">
                          {photo.location}
                        </p>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-400">
                No photos uploaded
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pilot ease-of-use survey — shown once per technician after COMPLETED */}
      <NirPilotSurvey
        inspectionId={inspection.id}
        inspectionStatus={inspection.status}
      />

      {/* Mobile bottom nav — field shortcuts on small screens */}
      <MobileNav inspectionId={inspection.id} />
    </div>
  );
}
