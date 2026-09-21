"use client";

/**
 * MeterPhotoCapture
 *
 * Tech photographs a meter display → AI reads the numbers → tech confirms → data saved.
 * Eliminates admin double-handling of moisture meters, thermo-hygrometers, and laser measures.
 *
 * Modes:
 *   'moisture'       — Tramex MEP, Delmhorst BD-2100, Tramex CMEXv5
 *   'environmental'  — Testo 605-H1, Vaisala HM70 (Temp / RH / Dew point)
 *   'measurement'    — Leica Disto, Bosch GLM (laser distance measure)
 *
 * Native camera: when running in the Capacitor native shell and `hasNativeCamera`
 * is true, the "Take Photo" button uses @capacitor/camera for a better native
 * experience (orientation correction, higher quality, no browser permission prompts).
 * Falls back to <input capture="environment"> on web.
 */

import { useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { OcrExtraction, ExtractionType } from "@/lib/nir-vision-ocr";
import { useCapacitor } from "@/components/providers/CapacitorProvider";
import { fireHaptic } from "@/lib/capacitor";
import type { MeterReadingResult } from "@/lib/vision/meter-prompts";
import { queueWrite } from "@/lib/nir-sync-queue";

// ── Vision extraction plumbing ────────────────────────────────────────────────

/** Media types POST /api/vision/extract-reading accepts. */
const VISION_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

function toVisionMediaType(fileType: string): VisionMediaType {
  return (VISION_MEDIA_TYPES as readonly string[]).includes(fileType)
    ? (fileType as VisionMediaType)
    : "image/jpeg";
}

/** Strip the `data:<type>;base64,` prefix — the route wants raw base64 only. */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the photo file"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Map the vision route's MeterReadingResult onto the OcrExtraction shape the
 * confirm forms already consume. The vision prompt does not identify the
 * material the probe is on, so `materialType` stays null and the tech types it.
 */
export function meterReadingToExtraction(
  reading: MeterReadingResult,
): Extract<OcrExtraction, { type: "moisture" }> {
  return {
    type: "moisture",
    moisturePercent: reading.readingValue,
    // Deliberately NOT `?? 0`. An unreadable display stays null the whole way
    // through — a fabricated 0 is indistinguishable from a genuine bone-dry
    // reading and could be confirmed and saved as one.
    value: reading.readingValue,
    unit: reading.readingUnit,
    materialType: null,
    rawText: reading.displayText,
    confidence: reading.confidence,
  };
}

/**
 * Provenance on the environmental POST. Manual entry (current path —
 * thermo-hygrometer OCR is not wired) must not claim a meter-photo OCR
 * read or interpolate a literal `null`.
 */
export function environmentalReadingNotes(
  rawText: string | null | undefined,
): string {
  const ocrText = rawText?.trim();
  if (ocrText) {
    return `Captured via meter photo OCR. Meter display read: "${ocrText}"`;
  }
  return "Entered manually from thermo-hygrometer photo";
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Turn the route's bare error codes into something a tech on site can act on. */
export function visionErrorMessage(status: number, code: string | null) {
  switch (code) {
    case "KEY_MISSING":
      return "No Anthropic API key is configured for this workspace. Add your own key under Settings -> Integrations, then try again.";
    case "RATE_LIMITED":
      return "Too many meter reads in the last minute — wait a moment and try again.";
    case "MODEL_OVERLOADED":
      return "The vision model is busy right now. Try again in a moment, or enter the reading manually.";
    case "NO_READING_DETECTED":
      return "Could not read the meter display. Retake the photo square-on with the display well lit, or enter the reading manually.";
    case "PARSE_FAILED":
      return "The meter display could not be interpreted. Retake the photo, or enter the reading manually.";
    default:
      if (status === 401) return "Your session has expired — sign in again.";
      if (status === 402)
        return "An active subscription is required to read meters with AI.";
      if (status === 413)
        return "That photo is too large — retake it at a lower resolution.";
      return code ?? "Analysis failed — please try again";
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MeterPhotoCaptureProps {
  inspectionId: string;
  /** What type of meter is being photographed */
  mode: ExtractionType;
  /** Called after a reading is successfully saved so parent can refresh data */
  onReadingAccepted?: () => void;
  className?: string;
}

// ── Labels & hints ────────────────────────────────────────────────────────────

const MODE_LABELS: Record<ExtractionType, string> = {
  moisture: "Moisture Meter",
  environmental: "Thermo-Hygrometer",
  measurement: "Laser Distance Measure",
};

const MODE_HINTS: Record<ExtractionType, string> = {
  moisture: "Tramex MEP · Delmhorst BD-2100 · or any moisture meter",
  environmental: "Testo 605-H1 · Vaisala HM70 · or any thermo-hygrometer",
  measurement: "Leica Disto · Bosch GLM · or any laser measure",
};

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        confidence === "high" &&
          "bg-success-subtle text-success-subtle-foreground",
        confidence === "medium" &&
          "bg-warning-subtle text-warning-subtle-foreground",
        confidence === "low" &&
          "bg-destructive-subtle text-destructive-subtle-foreground",
      )}
    >
      {confidence === "high"
        ? "● High confidence"
        : confidence === "medium"
          ? "● Verify values"
          : "● Low confidence — retake photo"}
    </span>
  );
}

// ── Shared field input ────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  step,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-colors"
      />
    </div>
  );
}

/** Persist the meter photo to Cloudinary so OCR evidence is not metadata-only. */
async function uploadMeterPhoto(
  inspectionId: string,
  file: File | null,
  location: string,
  caption: string,
) {
  if (!file) return;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("location", location);
    formData.append("caption", caption);
    formData.append("photoStage", "DURING_WORK");
    const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      console.warn("[MeterPhotoCapture] photo upload failed", res.status);
    }
  } catch (err) {
    console.warn("[MeterPhotoCapture] photo upload error", err);
  }
}

// ── Moisture confirm form ─────────────────────────────────────────────────────

function MoistureConfirm({
  extraction,
  inspectionId,
  file,
  onSaved,
  onCancel,
}: {
  extraction: Extract<OcrExtraction, { type: "moisture" }>;
  inspectionId: string;
  file: File | null;
  onSaved: (opts?: { queuedLocally?: boolean }) => void;
  onCancel: () => void;
}) {
  const [moisture, setMoisture] = useState(
    extraction.moisturePercent !== null
      ? String(extraction.moisturePercent)
      : "",
  );
  const [surfaceType, setSurfaceType] = useState(extraction.materialType ?? "");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!location.trim()) {
      toast.error("Please enter the location of this reading");
      return;
    }
    const val = parseFloat(moisture);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("Moisture % must be a number between 0 and 100");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      location,
      surfaceType: surfaceType || "unknown",
      moistureLevel: val,
      // RA-1611: tag the provenance so a vision-extracted reading is
      // distinguishable from a hand-typed one in the drying log and the
      // audit trail. Without this the route defaults it to "manual".
      source: "ocr",
      notes: `Captured via meter photo OCR. Meter display read: "${extraction.rawText}"`,
    };
    const endpoint = `/api/inspections/${inspectionId}/moisture`;
    const mutationId =
      globalThis.crypto?.randomUUID?.() ??
      `nir-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // RA-7604 — same fallback as MoistureReadingEntryForm / RA-7602: the
    // RA-1124 IndexedDB queue drains on reconnect. mutationId is the
    // Idempotency-Key on both the live POST and the queued replay so a
    // lost response cannot double-insert (moisture route wraps
    // withIdempotency, RA-1266).
    const queueForLater = async () => {
      await queueWrite({
        id: mutationId,
        type: "moisture-reading",
        endpoint,
        method: "POST",
        payload,
        inspectionId,
      });
      void fireHaptic("success");
      toast.success("Saved on this device — will sync");
      onSaved({ queuedLocally: true });
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueForLater();
        return;
      }

      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": mutationId,
            "X-RestoreAssist-Mutation-Id": mutationId,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (err instanceof TypeError) {
          await queueForLater();
          return;
        }
        throw err;
      }

      if (res.status >= 500) {
        await queueForLater();
        return;
      }

      if (res.ok) {
        await uploadMeterPhoto(
          inspectionId,
          file,
          location,
          `Moisture meter OCR — ${val}% (${surfaceType || "unknown"})`,
        );
        void fireHaptic("success");
        toast.success("Moisture reading saved");
        onSaved();
      } else {
        void fireHaptic("warning");
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const message = data.error ?? "Failed to save reading";
        setError(message);
        toast.error(message);
      }
    } catch (err) {
      void fireHaptic("warning");
      const message =
        err instanceof Error ? err.message : "Failed to save reading";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Confirm Moisture Reading
        </h4>
        <ConfidenceBadge confidence={extraction.confidence ?? "medium"} />
      </div>

      <p className="text-xs text-neutral-400">
        Meter display:{" "}
        <code className="bg-neutral-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-slate-300">
          {extraction.rawText || "(unable to read)"}
        </code>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Moisture %"
          value={moisture}
          onChange={setMoisture}
          type="number"
          step="0.1"
          min="0"
          max="100"
          required
        />
        <Field
          label="Surface / Material"
          value={surfaceType}
          onChange={setSurfaceType}
          placeholder="e.g. concrete, timber"
        />
        <div className="col-span-2">
          <Field
            label="Location"
            value={location}
            onChange={setLocation}
            placeholder="e.g. Master bedroom — east wall, 300mm from floor"
            required
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 min-h-[44px] py-3 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw size={14} className="inline mr-1.5" />
          Retake
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 min-h-[44px] py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Save Reading
        </button>
      </div>
    </div>
  );
}

// ── Environmental confirm form ────────────────────────────────────────────────

function EnvironmentalConfirm({
  extraction,
  inspectionId,
  file,
  onSaved,
  onCancel,
}: {
  extraction: Extract<OcrExtraction, { type: "environmental" }>;
  inspectionId: string;
  file: File | null;
  onSaved: (opts?: { queuedLocally?: boolean }) => void;
  onCancel: () => void;
}) {
  const [temp, setTemp] = useState(
    extraction.temperatureCelsius != null
      ? String(extraction.temperatureCelsius)
      : "",
  );
  const [rh, setRh] = useState(
    extraction.relativeHumidityPercent != null
      ? String(extraction.relativeHumidityPercent)
      : "",
  );
  const [dew, setDew] = useState(
    extraction.dewPointCelsius != null
      ? String(extraction.dewPointCelsius)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const tempNum = parseOptionalNumber(temp);
    const rhNum = parseOptionalNumber(rh);
    const dewNum = parseOptionalNumber(dew);

    // EnvironmentalData requires both ambientTemperature and humidityLevel.
    // Queueing a partial or out-of-range payload toasts local-sync then 400s
    // forever on drain (Bugbot RA-7605). Match the inspection-page form.
    if (tempNum === undefined || rhNum === undefined) {
      const message = "Enter temperature and humidity before saving";
      setError(message);
      toast.error(message);
      return;
    }
    if (tempNum < -20 || tempNum > 55) {
      const message = "Temperature must be between -20°C and 55°C";
      setError(message);
      toast.error(message);
      return;
    }
    if (rhNum < 0 || rhNum > 100) {
      const message = "Humidity must be between 0% and 100%";
      setError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      ambientTemperature: tempNum,
      humidityLevel: rhNum,
      dewPoint: dewNum,
      notes: environmentalReadingNotes(extraction.rawText),
    };
    const endpoint = `/api/inspections/${inspectionId}/environmental`;
    const mutationId =
      globalThis.crypto?.randomUUID?.() ??
      `nir-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // RA-7605 — same fallback as MoistureConfirm / RA-7604: the RA-1124
    // IndexedDB queue drains on reconnect. mutationId is the
    // Idempotency-Key on both the live POST and the queued replay so a
    // lost response cannot double-insert (environmental route wraps
    // withIdempotency, RA-1266).
    const queueForLater = async () => {
      await queueWrite({
        id: mutationId,
        type: "environmental-data",
        endpoint,
        method: "POST",
        payload,
        inspectionId,
      });
      void fireHaptic("success");
      toast.success("Saved on this device — will sync");
      onSaved({ queuedLocally: true });
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueForLater();
        return;
      }

      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": mutationId,
            "X-RestoreAssist-Mutation-Id": mutationId,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (err instanceof TypeError) {
          await queueForLater();
          return;
        }
        throw err;
      }

      if (res.status >= 500) {
        await queueForLater();
        return;
      }

      if (res.ok) {
        await uploadMeterPhoto(
          inspectionId,
          file,
          "Ambient conditions",
          extraction.rawText?.trim()
            ? `Thermo-hygrometer OCR — ${temp}°C / ${rh}% RH`
            : `Thermo-hygrometer — ${temp}°C / ${rh}% RH`,
        );
        void fireHaptic("success");
        toast.success("Environmental data applied to inspection");
        onSaved();
      } else {
        void fireHaptic("warning");
        const data = await res.json().catch(() => ({}));
        const message =
          apiErrorMessage(data) ?? "Failed to save environmental data";
        setError(message);
        toast.error(message);
      }
    } catch (err) {
      void fireHaptic("warning");
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save environmental data";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Confirm Environmental Reading
        </h4>
        <ConfidenceBadge confidence={extraction.confidence ?? "medium"} />
      </div>

      {extraction.rawText?.trim() ? (
        <p className="text-xs text-neutral-400">
          Meter display:{" "}
          <code className="bg-neutral-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-slate-300">
            {extraction.rawText}
          </code>
        </p>
      ) : (
        <p className="text-xs text-neutral-400">
          Enter the temperature and humidity from the meter display.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field
          label="Temp (°C)"
          value={temp}
          onChange={setTemp}
          type="number"
          step="0.1"
          required
        />
        <Field
          label="RH (%)"
          value={rh}
          onChange={setRh}
          type="number"
          step="0.1"
          min="0"
          max="100"
          required
        />
        <Field
          label="Dew Point (°C)"
          value={dew}
          onChange={setDew}
          type="number"
          step="0.1"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 min-h-[44px] py-3 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw size={14} className="inline mr-1.5" />
          Retake
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 min-h-[44px] py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Apply to Inspection
        </button>
      </div>
    </div>
  );
}

// ── Measurement confirm form ──────────────────────────────────────────────────

function MeasurementConfirm({
  extraction,
  onSaved,
  onCancel,
}: {
  extraction: Extract<OcrExtraction, { type: "measurement" }>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(
    extraction.primaryValue !== null ? String(extraction.primaryValue) : "",
  );
  const [unit, setUnit] = useState(extraction.unit ?? "m");

  const copy = async () => {
    const text = `${val} ${unit}`;
    try {
      await navigator.clipboard.writeText(text);
      void fireHaptic("light");
      toast.success(`${text} copied — paste into the Affected Areas form`);
    } catch {
      toast(`Measurement: ${text}`);
    }
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Confirm Measurement
        </h4>
        <ConfidenceBadge confidence={extraction.confidence ?? "medium"} />
      </div>

      <p className="text-xs text-neutral-400">
        Meter display:{" "}
        <code className="bg-neutral-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-slate-300">
          {extraction.rawText || "(unable to read)"}
        </code>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Value"
          value={val}
          onChange={setVal}
          type="number"
          step="0.001"
        />
        <div>
          <label className="text-xs text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
            Unit
          </label>
          <select
            value={unit ?? "m"}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          >
            <option value="m">m</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="ft">ft</option>
            <option value="in">in</option>
          </select>
        </div>
      </div>

      {extraction.secondaryValue !== null &&
        extraction.secondaryValue !== undefined && (
          <p className="text-xs text-neutral-500">
            Also detected: {extraction.secondaryValue}{" "}
            {extraction.secondaryUnit}
          </p>
        )}

      <p className="text-xs text-neutral-400 bg-neutral-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
        Tap below to copy this value, then paste it into the Affected Areas
        form.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 min-h-[44px] py-3 rounded-lg border border-neutral-200 dark:border-slate-700 text-sm hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw size={14} className="inline mr-1.5" />
          Retake
        </button>
        <button
          onClick={copy}
          className="flex-1 min-h-[44px] py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={14} />
          Copy to Clipboard
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MeterPhotoCapture({
  inspectionId,
  mode,
  onReadingAccepted,
  className,
}: MeterPhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [extraction, setExtraction] = useState<OcrExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedLocally, setQueuedLocally] = useState(false);

  // Detect if we're running in a Capacitor native shell with camera plugin
  const { hasNativeCamera } = useCapacitor();

  // Handle a selected/captured file
  const handleFileSelect = (f: File) => {
    setFile(f);
    setExtraction(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  /**
   * capturePhoto — camera button handler.
   *
   * On iOS/Android Capacitor native: uses @capacitor/camera for best quality,
   * correct orientation, and no browser permission popups.
   *
   * On web: falls back to the hidden <input capture="environment"> element
   * which triggers the device camera via the browser.
   */
  const capturePhoto = async () => {
    if (hasNativeCamera) {
      try {
        const { Camera, CameraResultType, CameraSource } =
          await import("@capacitor/camera");
        const photo = await Camera.getPhoto({
          quality: 85,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          correctOrientation: true,
        });

        if (photo.base64String) {
          const format = photo.format ?? "jpeg";
          const mediaType = `image/${format}` as
            | "image/jpeg"
            | "image/png"
            | "image/webp";
          const bytes = Uint8Array.from(atob(photo.base64String), (c) =>
            c.charCodeAt(0),
          );
          const nativeFile = new File(
            [bytes],
            `meter-${Date.now()}.${format}`,
            { type: mediaType },
          );
          handleFileSelect(nativeFile);
        }
      } catch (err) {
        // User cancelled camera — not an error
        if (
          err instanceof Error &&
          err.message.toLowerCase().includes("cancel")
        )
          return;
        toast.error("Camera error — try again or use the gallery");
      }
    } else {
      // Web fallback: trigger the hidden file input with capture="environment"
      fileInputRef.current?.click();
    }
  };

  // Open gallery picker (no capture attribute — lets user choose existing photo)
  const openGallery = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) handleFileSelect(f);
    };
    input.click();
  };

  /**
   * Send the photo to the BYOK vision route and turn the result into the
   * extraction the confirm form renders.
   *
   * Moisture is wired to POST /api/vision/extract-reading. Thermo-hygrometer
   * OCR is not — RA-7605 still needs EnvironmentalConfirm reachable so the
   * tech can enter values (and the write can queue offline). Laser-measure
   * stays a plain notice. Neither mode fires at a route that does not exist
   * (the previous /api/inspections/[id]/analyze-photo 404).
   */
  const analyse = async () => {
    if (!file) return;

    if (mode === "environmental") {
      setError(null);
      setExtraction({
        type: "environmental",
        temperatureCelsius: null,
        relativeHumidityPercent: null,
        dewPointCelsius: null,
        rawText: null,
        confidence: "medium",
      });
      return;
    }

    if (mode !== "moisture") {
      setError(
        `Photo OCR is currently available for moisture meters only. Enter the ${MODE_LABELS[mode].toLowerCase()} values manually below.`,
      );
      return;
    }

    setAnalysing(true);
    setError(null);

    try {
      const image = await fileToBase64(file);
      const res = await fetch("/api/vision/extract-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          mediaType: toVisionMediaType(file.type),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(visionErrorMessage(res.status, apiErrorMessage(data)));
        return;
      }

      if (!data.reading) {
        setError("No reading returned — retake the photo and try again");
        return;
      }

      setExtraction(meterReadingToExtraction(data.reading as MeterReadingResult));
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setAnalysing(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setFile(null);
    setExtraction(null);
    setError(null);
  };

  const handleSaved = (opts?: { queuedLocally?: boolean }) => {
    setQueuedLocally(Boolean(opts?.queuedLocally));
    reset();
    // RA-7604 / Bugbot: the inspection page's onReadingAccepted always
    // fetchInspection()s. That setLoading(true) unmounts this card (banner
    // gone) and, offline, toasts a load failure even though the reading
    // is queued — techs recapture and later sync duplicates. Skip the
    // parent refresh when the save is only on-device; drain persists it.
    if (!opts?.queuedLocally) {
      onReadingAccepted?.();
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <Camera size={15} className="text-cyan-500 flex-shrink-0" />
            {MODE_LABELS[mode]} — Photo OCR
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">{MODE_HINTS[mode]}</p>
        </div>
        {preview && !extraction && (
          <button
            onClick={reset}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Clear photo"
          >
            <X size={15} className="text-neutral-400" />
          </button>
        )}
      </div>

      {queuedLocally && (
        <p
          role="status"
          className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1"
        >
          <CheckCircle2 size={12} />
          Saved on this device — will sync
        </p>
      )}

      {/* ── State: No photo yet — capture / gallery buttons ── */}
      {!preview && (
        <>
          {/* Web-only hidden file input — used as fallback when not in native shell */}
          {!hasNativeCamera && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={capturePhoto}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-neutral-200 dark:border-slate-700 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all text-sm text-neutral-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 font-medium"
            >
              <Camera size={17} />
              Take Photo
            </button>
            <button
              onClick={openGallery}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors text-sm text-neutral-500 dark:text-slate-400"
              aria-label="Choose from gallery"
            >
              <Upload size={16} />
            </button>
          </div>
        </>
      )}

      {/* ── State: Photo captured, not yet analysed ── */}
      {preview && !extraction && (
        <div className="space-y-3">
          {/* Preview */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Meter display preview"
            className="w-full max-h-52 object-contain rounded-lg bg-neutral-100 dark:bg-slate-800"
          />

          {/* Error panel */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
              <AlertTriangle
                size={14}
                className="text-destructive mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-destructive">
                  {error}
                </p>
                {error.includes("Integrations") && (
                  <a
                    href="/dashboard/integrations"
                    className="text-xs text-destructive underline mt-1 inline-block"
                  >
                    Go to Settings → Integrations →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Analyse button */}
          <button
            onClick={analyse}
            disabled={analysing}
            aria-label={
              analysing
                ? "Reading meter with AI…"
                : "Analyse meter photo with AI"
            }
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {analysing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Reading meter with AI…
              </>
            ) : (
              <>
                <Camera size={14} />
                Read Meter Display
              </>
            )}
          </button>
        </div>
      )}

      {/* ── State: Extraction complete — confirm modal ── */}
      {extraction && (
        <>
          {extraction.type === "moisture" && (
            <MoistureConfirm
              extraction={extraction}
              inspectionId={inspectionId}
              file={file}
              onSaved={handleSaved}
              onCancel={reset}
            />
          )}
          {extraction.type === "environmental" && (
            <EnvironmentalConfirm
              extraction={extraction}
              inspectionId={inspectionId}
              file={file}
              onSaved={handleSaved}
              onCancel={reset}
            />
          )}
          {extraction.type === "measurement" && (
            <MeasurementConfirm
              extraction={extraction}
              onSaved={handleSaved}
              onCancel={reset}
            />
          )}
        </>
      )}
    </div>
  );
}
