"use client";

/**
 * RA-448: Inspection photo evidence screen
 * /dashboard/inspections/[id]/photos
 *
 * Photo grid with S500:2025 label display, inline label editing,
 * asbestos stop-work banner, and filter bar.
 * Depends on: RA-446 (types), RA-447 (PATCH endpoint)
 */

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  Loader2,
  Filter,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DamageCategory,
  DamageClass,
  RoomType,
  MoistureSource,
  AffectedMaterial,
  SurfaceOrientation,
  DamageExtentEstimate,
  SecondaryDamageIndicator,
  PhotoStage,
  CaptureAngle,
  LabelledBy,
  InspectionPhotoLabelPatch,
} from "@/types/inspection-photo-labels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  location: string | null;
  description: string | null;
  timestamp: string;
  fileSize: number | null;
  mimeType: string | null;
  // RA-446 label fields
  damageCategory: DamageCategory | null;
  damageClass: DamageClass | null;
  s500SectionRef: string | null;
  roomType: RoomType | null;
  moistureSource: MoistureSource | null;
  affectedMaterial: AffectedMaterial[];
  surfaceOrientation: SurfaceOrientation | null;
  damageExtentEstimate: DamageExtentEstimate | null;
  equipmentVisible: boolean;
  secondaryDamageIndicators: SecondaryDamageIndicator[];
  photoStage: PhotoStage | null;
  captureAngle: CaptureAngle | null;
  labelledBy: LabelledBy;
  technicianNotes: string | null;
  moistureReadingLink: string | null;
}

interface Inspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Display maps
// ---------------------------------------------------------------------------

const DAMAGE_CATEGORY_LABELS: Record<DamageCategory, string> = {
  CAT_1: "Cat 1 – Clean",
  CAT_2: "Cat 2 – Grey",
  CAT_3: "Cat 3 – Black",
};
const DAMAGE_CATEGORY_COLORS: Record<DamageCategory, string> = {
  CAT_1: "bg-blue-900 text-blue-200 border-blue-700",
  CAT_2: "bg-yellow-900 text-yellow-200 border-yellow-700",
  CAT_3: "bg-red-900 text-red-300 border-red-700",
};
const PHOTO_STAGE_LABELS: Record<PhotoStage, string> = {
  PRE_WORK: "Pre-work",
  DURING_WORK: "During",
  MONITORING: "Monitoring",
  POST_WORK: "Post-work",
  REINSTATEMENT: "Reinstatement",
};
const DAMAGE_CLASS_LABELS: Record<DamageClass, string> = {
  CLASS_1: "Class 1",
  CLASS_2: "Class 2",
  CLASS_3: "Class 3",
  CLASS_4: "Class 4",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Red stop-work banner shown when any photo has ASBESTOS_SUSPECT flagged */
function AsbestosStopWorkBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="mx-4 mb-4 rounded-lg border-2 border-red-500 bg-red-950 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div>
          <p className="font-semibold text-red-300">
            STOP WORK — Possible Asbestos-Containing Material
          </p>
          <p className="mt-1 text-sm text-red-400">
            {count} photo{count > 1 ? "s" : ""} flagged with possible asbestos
            (ACM). Do not proceed with demolition or disturbance. Contact a
            licensed asbestos assessor. Refer to Safe Work Australia guidance.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Label chip — small coloured pill for a label value */
function LabelChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
        "border-neutral-700 bg-neutral-800 text-neutral-300",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Filter bar for the photo grid */
function FilterBar({
  damageCategory,
  setDamageCategory,
  roomType,
  setRoomType,
  photoStage,
  setPhotoStage,
  onClear,
}: {
  damageCategory: string;
  setDamageCategory: (v: string) => void;
  roomType: string;
  setRoomType: (v: string) => void;
  photoStage: string;
  setPhotoStage: (v: string) => void;
  onClear: () => void;
}) {
  const hasFilter =
    damageCategory !== "all" || roomType !== "all" || photoStage !== "all";
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <Filter className="h-4 w-4 text-neutral-500" />
      <Select value={damageCategory} onValueChange={setDamageCategory}>
        <SelectTrigger className="h-8 w-36 border-neutral-700 bg-neutral-900 text-xs">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="CAT_1">Cat 1 – Clean</SelectItem>
          <SelectItem value="CAT_2">Cat 2 – Grey</SelectItem>
          <SelectItem value="CAT_3">Cat 3 – Black</SelectItem>
        </SelectContent>
      </Select>
      <Select value={roomType} onValueChange={setRoomType}>
        <SelectTrigger className="h-8 w-32 border-neutral-700 bg-neutral-900 text-xs">
          <SelectValue placeholder="Room" />
        </SelectTrigger>
        <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
          <SelectItem value="all">All rooms</SelectItem>
          {(
            [
              "KITCHEN",
              "BATHROOM",
              "LAUNDRY",
              "TOILET",
              "BEDROOM",
              "LIVING",
              "DINING",
              "HALLWAY",
              "GARAGE",
              "ROOF_SPACE",
              "SUBFLOOR",
              "BASEMENT",
              "COMMERCIAL_OFFICE",
              "COMMERCIAL_WAREHOUSE",
              "COMMON_AREA",
              "EXTERNAL",
              "OTHER",
            ] as RoomType[]
          ).map((r) => (
            <SelectItem key={r} value={r}>
              {r.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={photoStage} onValueChange={setPhotoStage}>
        <SelectTrigger className="h-8 w-32 border-neutral-700 bg-neutral-900 text-xs">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
          <SelectItem value="all">All stages</SelectItem>
          {(Object.entries(PHOTO_STAGE_LABELS) as [PhotoStage, string][]).map(
            ([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {hasFilter && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}

/** Photo card in the grid */
function PhotoCard({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  const hasAsbestos =
    photo.secondaryDamageIndicators.includes("ASBESTOS_SUSPECT");
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border",
        "border-neutral-800 bg-neutral-900 transition hover:border-neutral-600",
        hasAsbestos && "ring-2 ring-red-500",
      )}
    >
      {/* Thumbnail */}
      {photo.thumbnailUrl || photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.thumbnailUrl ?? photo.url}
          alt={photo.location ?? "Inspection photo"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-neutral-600" />
        </div>
      )}
      {/* Category badge overlay */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-1 bg-black/60 p-1.5">
        {photo.damageCategory && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
              DAMAGE_CATEGORY_COLORS[photo.damageCategory],
            )}
          >
            {photo.damageCategory}
          </span>
        )}
        {photo.photoStage && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
            {PHOTO_STAGE_LABELS[photo.photoStage]}
          </span>
        )}
        {hasAsbestos && (
          <span className="rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
            ACM
          </span>
        )}
      </div>
    </button>
  );
}

/** Full-view photo panel with label display and edit form */
function PhotoPanel({
  photo,
  inspectionId,
  onClose,
  onUpdate,
}: {
  photo: Photo;
  inspectionId: string;
  onClose: () => void;
  onUpdate: (updated: Photo) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [patch, setPatch] = useState<InspectionPhotoLabelPatch>({});
  const [asbestosWarning, setAsbestosWarning] = useState(false);

  const hasAsbestos =
    photo.secondaryDamageIndicators.includes("ASBESTOS_SUSPECT");

  function startEdit() {
    setPatch({
      damageCategory: photo.damageCategory ?? undefined,
      damageClass: photo.damageClass ?? undefined,
      s500SectionRef: photo.s500SectionRef ?? undefined,
      roomType: photo.roomType ?? undefined,
      moistureSource: photo.moistureSource ?? undefined,
      affectedMaterial: photo.affectedMaterial,
      surfaceOrientation: photo.surfaceOrientation ?? undefined,
      damageExtentEstimate: photo.damageExtentEstimate ?? undefined,
      equipmentVisible: photo.equipmentVisible,
      secondaryDamageIndicators: photo.secondaryDamageIndicators,
      photoStage: photo.photoStage ?? undefined,
      captureAngle: photo.captureAngle ?? undefined,
      labelledBy: photo.labelledBy,
      technicianNotes: photo.technicianNotes ?? undefined,
    });
    setEditing(true);
  }

  async function saveLabels() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/photos/${photo.id}/labels`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setSaveError((data.errors ?? [data.error ?? "Save failed"]).join("; "));
        return;
      }
      if (data.asbestosStopWork) setAsbestosWarning(true);
      onUpdate({ ...photo, ...data.photo });
      setEditing(false);
    } catch {
      setSaveError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  function toggleMultiSelect<T extends string>(
    field: keyof Pick<
      InspectionPhotoLabelPatch,
      "affectedMaterial" | "secondaryDamageIndicators"
    >,
    value: T,
  ) {
    const current = (patch[field] ?? []) as T[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setPatch((p) => ({ ...p, [field]: next }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[#0a0a0a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-neutral-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Asbestos stop-work warning */}
        {(hasAsbestos || asbestosWarning) && (
          <div className="border-b border-red-800 bg-red-950 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              STOP WORK — Possible ACM. Do not disturb material.
            </div>
          </div>
        )}

        {/* Photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt="Inspection photo"
          className="w-full object-contain"
          style={{ maxHeight: 320 }}
        />

        {/* Header */}
        <div className="border-b border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {photo.location ?? "No location set"}
              </p>
              <p className="text-xs text-neutral-500">
                {new Date(photo.timestamp).toLocaleString("en-AU")}
              </p>
            </div>
            {!editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={startEdit}
                className="border-neutral-700 bg-neutral-900 text-xs hover:bg-neutral-800"
              >
                Edit Labels
              </Button>
            )}
          </div>
        </div>

        {/* Label display (read-only) */}
        {!editing && (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              {photo.damageCategory && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-semibold",
                    DAMAGE_CATEGORY_COLORS[photo.damageCategory],
                  )}
                >
                  {DAMAGE_CATEGORY_LABELS[photo.damageCategory]}
                </span>
              )}
              {photo.damageClass && (
                <LabelChip label={DAMAGE_CLASS_LABELS[photo.damageClass]} />
              )}
              {photo.photoStage && (
                <LabelChip label={PHOTO_STAGE_LABELS[photo.photoStage]} />
              )}
              {photo.roomType && (
                <LabelChip label={photo.roomType.replace(/_/g, " ")} />
              )}
              {photo.moistureSource && (
                <LabelChip label={photo.moistureSource.replace(/_/g, " ")} />
              )}
              {photo.surfaceOrientation && (
                <LabelChip
                  label={photo.surfaceOrientation.replace(/_/g, " ")}
                />
              )}
              {photo.damageExtentEstimate && (
                <LabelChip label={photo.damageExtentEstimate} />
              )}
              {photo.captureAngle && (
                <LabelChip label={photo.captureAngle.replace(/_/g, " ")} />
              )}
              <LabelChip
                label={
                  photo.equipmentVisible ? "Equipment visible" : "No equipment"
                }
              />
            </div>
            {photo.affectedMaterial.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-neutral-500">
                  Affected materials
                </p>
                <div className="flex flex-wrap gap-1">
                  {photo.affectedMaterial.map((m) => (
                    <LabelChip key={m} label={m.replace(/_/g, " ")} />
                  ))}
                </div>
              </div>
            )}
            {photo.secondaryDamageIndicators.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-neutral-500">
                  Secondary indicators
                </p>
                <div className="flex flex-wrap gap-1">
                  {photo.secondaryDamageIndicators.map((s) => (
                    <LabelChip
                      key={s}
                      label={s.replace(/_/g, " ")}
                      className={
                        s === "ASBESTOS_SUSPECT"
                          ? "border-red-700 bg-red-950 text-red-300"
                          : ""
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {photo.s500SectionRef && (
              <p className="text-xs text-neutral-500">
                S500 ref:{" "}
                <span className="text-neutral-300">{photo.s500SectionRef}</span>
              </p>
            )}
            {photo.technicianNotes && (
              <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-300">
                {photo.technicianNotes}
              </div>
            )}
          </div>
        )}

        {/* Edit Labels form */}
        {editing && (
          <div className="space-y-4 p-4 pb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Edit Labels — S500:2025
            </p>

            {/* Damage Category */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Damage Category *
              </label>
              <Select
                value={patch.damageCategory ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    damageCategory: v as DamageCategory,
                  }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  <SelectItem value="CAT_1">Cat 1 – Clean</SelectItem>
                  <SelectItem value="CAT_2">Cat 2 – Grey</SelectItem>
                  <SelectItem value="CAT_3">Cat 3 – Black</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Damage Class */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Damage Class *
              </label>
              <Select
                value={patch.damageClass ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, damageClass: v as DamageClass }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  <SelectItem value="CLASS_1">Class 1 – Slow</SelectItem>
                  <SelectItem value="CLASS_2">Class 2 – Significant</SelectItem>
                  <SelectItem value="CLASS_3">Class 3 – Fast</SelectItem>
                  <SelectItem value="CLASS_4">Class 4 – Specialty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Photo Stage */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Photo Stage *
              </label>
              <Select
                value={patch.photoStage ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, photoStage: v as PhotoStage }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  {(
                    Object.entries(PHOTO_STAGE_LABELS) as [PhotoStage, string][]
                  ).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room Type */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Room Type *
              </label>
              <Select
                value={patch.roomType ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, roomType: v as RoomType }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  {(
                    [
                      "KITCHEN",
                      "BATHROOM",
                      "LAUNDRY",
                      "TOILET",
                      "BEDROOM",
                      "LIVING",
                      "DINING",
                      "HALLWAY",
                      "GARAGE",
                      "ROOF_SPACE",
                      "SUBFLOOR",
                      "BASEMENT",
                      "COMMERCIAL_OFFICE",
                      "COMMERCIAL_WAREHOUSE",
                      "COMMON_AREA",
                      "EXTERNAL",
                      "OTHER",
                    ] as RoomType[]
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Moisture Source */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Moisture Source *
              </label>
              <Select
                value={patch.moistureSource ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    moistureSource: v as MoistureSource,
                  }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  {(
                    [
                      "FLEXI_HOSE",
                      "TAP_FAILURE",
                      "PIPE_BURST",
                      "PIPE_LEAK",
                      "ROOF_LEAK",
                      "STORMWATER",
                      "SEWAGE_OVERFLOW",
                      "WASHING_MACHINE",
                      "DISHWASHER",
                      "HOT_WATER_SYSTEM",
                      "AIR_CON_DRAIN",
                      "FLOOD_EXTERNAL",
                      "RISING_DAMP",
                      "CONDENSATION",
                      "UNKNOWN",
                      "OTHER",
                    ] as MoistureSource[]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Surface Orientation */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Surface Orientation *
              </label>
              <Select
                value={patch.surfaceOrientation ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    surfaceOrientation: v as SurfaceOrientation,
                  }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select orientation" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  {(
                    [
                      "FLOOR",
                      "WALL_LOWER",
                      "WALL_MID",
                      "WALL_UPPER",
                      "CEILING",
                      "JUNCTION",
                      "COLUMN_PIER",
                      "SUBFLOOR_BEARER",
                      "ROOF_RAFTER",
                    ] as SurfaceOrientation[]
                  ).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Damage Extent */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Damage Extent *
              </label>
              <Select
                value={patch.damageExtentEstimate ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    damageExtentEstimate: v as DamageExtentEstimate,
                  }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select extent" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  <SelectItem value="SPOT">Spot (&lt;10%)</SelectItem>
                  <SelectItem value="PARTIAL">Partial (10–50%)</SelectItem>
                  <SelectItem value="MAJORITY">Majority (50–80%)</SelectItem>
                  <SelectItem value="FULL">Full (&gt;80%)</SelectItem>
                  <SelectItem value="UNCERTAIN">Uncertain</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Capture Angle */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Capture Angle *
              </label>
              <Select
                value={patch.captureAngle ?? ""}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, captureAngle: v as CaptureAngle }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue placeholder="Select angle" />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  {(
                    [
                      "STRAIGHT_ON",
                      "OBLIQUE",
                      "OVERHEAD",
                      "MACRO",
                      "WIDE",
                    ] as CaptureAngle[]
                  ).map((a) => (
                    <SelectItem key={a} value={a}>
                      {a.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Equipment Visible toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-400">
                Equipment visible in frame
              </label>
              <button
                onClick={() =>
                  setPatch((p) => ({
                    ...p,
                    equipmentVisible: !p.equipmentVisible,
                  }))
                }
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  patch.equipmentVisible ? "bg-blue-600" : "bg-neutral-700",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform",
                    patch.equipmentVisible && "translate-x-6",
                  )}
                />
              </button>
            </div>

            {/* Affected Materials (multi-select chips) */}
            <div>
              <label className="mb-2 block text-xs text-neutral-400">
                Affected Materials * (select all visible)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    "PLASTERBOARD",
                    "VILLABOARD",
                    "FIBRE_CEMENT_SHEET",
                    "TIMBER_FRAME",
                    "TIMBER_FLOORING",
                    "PARTICLE_BOARD_FLOOR",
                    "PLYWOOD_SUBFLOOR",
                    "SLAB_ON_GROUND",
                    "BRICK_VENEER",
                    "DOUBLE_BRICK",
                    "TERRACOTTA_TILE",
                    "VINYL_FLOORING",
                    "CARPET",
                    "INSULATION_BATTS",
                    "INSULATION_FOAM",
                    "CORNICE",
                    "RENDER",
                    "CABINETRY",
                    "OTHER",
                  ] as AffectedMaterial[]
                ).map((m) => {
                  const selected = (patch.affectedMaterial ?? []).includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMultiSelect("affectedMaterial", m)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs transition",
                        selected
                          ? "border-blue-500 bg-blue-900 text-blue-200"
                          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500",
                      )}
                    >
                      {m.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Secondary Damage Indicators (multi-select chips) */}
            <div>
              <label className="mb-2 block text-xs text-neutral-400">
                Secondary Indicators
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    "MOULD_VISIBLE",
                    "MOULD_ODOUR",
                    "EFFLORESCENCE",
                    "STAINING_RUST",
                    "STAINING_TANNIN",
                    "DELAMINATION",
                    "BUCKLING",
                    "SWELLING",
                    "PEELING",
                    "CEILING_SAG",
                    "INSULATION_COLLAPSE",
                    "SUBFLOOR_STANDING",
                    "CONTAMINATION_SEWAGE",
                    "TERMITE_DAMAGE",
                    "ASBESTOS_SUSPECT",
                  ] as SecondaryDamageIndicator[]
                ).map((s) => {
                  const selected = (
                    patch.secondaryDamageIndicators ?? []
                  ).includes(s);
                  const isAcm = s === "ASBESTOS_SUSPECT";
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        toggleMultiSelect("secondaryDamageIndicators", s)
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs transition",
                        selected && isAcm
                          ? "border-red-500 bg-red-900 text-red-200 font-semibold"
                          : selected
                            ? "border-amber-500 bg-amber-900 text-amber-200"
                            : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500",
                      )}
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* S500 Section Ref */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                S500 Section Reference
              </label>
              <input
                type="text"
                placeholder="e.g. §13.1"
                value={patch.s500SectionRef ?? ""}
                onChange={(e) =>
                  setPatch((p) => ({ ...p, s500SectionRef: e.target.value }))
                }
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Technician Notes */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Technician Notes
              </label>
              <textarea
                rows={3}
                placeholder="Free-text observations..."
                value={patch.technicianNotes ?? ""}
                onChange={(e) =>
                  setPatch((p) => ({ ...p, technicianNotes: e.target.value }))
                }
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Labelled By */}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Labelled By
              </label>
              <Select
                value={patch.labelledBy ?? "HUMAN_TECH"}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, labelledBy: v as LabelledBy }))
                }
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-900 text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-900 text-white">
                  <SelectItem value="HUMAN_TECH">
                    Field technician at capture
                  </SelectItem>
                  <SelectItem value="HUMAN_OFFICE">
                    Office staff – post-job review
                  </SelectItem>
                  <SelectItem value="AI_ASSISTED">
                    AI-suggested, reviewed by human
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Error */}
            {saveError && (
              <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
                {saveError}
              </div>
            )}

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveLabels}
                disabled={saving}
                size="sm"
                className="flex-1 bg-blue-700 text-white hover:bg-blue-600"
              >
                {saving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save Labels
              </Button>
              <Button
                onClick={() => setEditing(false)}
                variant="outline"
                size="sm"
                className="flex-1 border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function InspectionPhotosPage({ params }: PageProps) {
  const { id } = use(params);

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Filter state
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [inspRes, photosRes] = await Promise.all([
        fetch(`/api/inspections/${id}`),
        fetch(`/api/inspections/${id}/photos`),
      ]);
      if (inspRes.ok) {
        const data = await inspRes.json();
        setInspection(data.inspection ?? data);
      }
      if (photosRes.ok) {
        const data = await photosRes.json();
        setPhotos(data.photos ?? []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/inspections/${id}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed");
      }
      const data = await res.json();
      setPhotos((prev) => [data.photo, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handlePhotoUpdate(updated: Photo) {
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPhoto(updated);
  }

  // Filtered photos
  const filtered = photos.filter((p) => {
    if (filterCategory !== "all" && p.damageCategory !== filterCategory)
      return false;
    if (filterRoom !== "all" && p.roomType !== filterRoom) return false;
    if (filterStage !== "all" && p.photoStage !== filterStage) return false;
    return true;
  });

  // Asbestos count across ALL photos (not just filtered)
  const asbestosCount = photos.filter((p) =>
    p.secondaryDamageIndicators.includes("ASBESTOS_SUSPECT"),
  ).length;

  return (
    <div className="min-h-screen bg-[#050505] pb-24 text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-neutral-800 bg-[#050505] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/inspections/${id}`}
            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <p className="text-sm font-semibold">Photo Evidence</p>
            {inspection && (
              <p className="text-xs text-neutral-500">
                {inspection.inspectionNumber} · {inspection.propertyAddress}
              </p>
            )}
          </div>
          {/* Upload button */}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
              "border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-900/70 transition",
              uploading && "pointer-events-none opacity-50",
            )}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {uploadError && (
          <p className="mt-2 text-xs text-red-400">{uploadError}</p>
        )}
      </div>

      {/* Asbestos stop-work banner */}
      <div className="pt-4">
        <AsbestosStopWorkBanner count={asbestosCount} />
      </div>

      {/* Filter bar */}
      <div className="pt-2">
        <FilterBar
          damageCategory={filterCategory}
          setDamageCategory={setFilterCategory}
          roomType={filterRoom}
          setRoomType={setFilterRoom}
          photoStage={filterStage}
          setPhotoStage={setFilterStage}
          onClear={() => {
            setFilterCategory("all");
            setFilterRoom("all");
            setFilterStage("all");
          }}
        />
      </div>

      {/* Photo count */}
      <p className="px-4 pb-3 text-xs text-neutral-500">
        {loading
          ? "Loading…"
          : `${filtered.length} of ${photos.length} photo${photos.length !== 1 ? "s" : ""}`}
      </p>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
          <Camera className="mb-3 h-10 w-10" />
          <p className="text-sm">
            {photos.length === 0
              ? "No photos yet — upload one to get started"
              : "No photos match the current filters"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => setSelectedPhoto(photo)}
            />
          ))}
        </div>
      )}

      {/* Full-view panel */}
      {selectedPhoto && (
        <PhotoPanel
          photo={selectedPhoto}
          inspectionId={id}
          onClose={() => setSelectedPhoto(null)}
          onUpdate={handlePhotoUpdate}
        />
      )}
    </div>
  );
}
