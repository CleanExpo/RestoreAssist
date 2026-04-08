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
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        confidence === "medium" &&
          "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        confidence === "low" &&
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
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
        {label} {required && <span className="text-red-500">*</span>}
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

// ── Moisture confirm form ─────────────────────────────────────────────────────

function MoistureConfirm({
  extraction,
  inspectionId,
  onSaved,
  onCancel,
}: {
  extraction: Extract<OcrExtraction, { type: "moisture" }>;
  inspectionId: string;
  onSaved: () => void;
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
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/moisture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          surfaceType: surfaceType || "unknown",
          moistureLevel: val,
          notes: `Captured via meter photo OCR. Meter display read: "${extraction.rawText}"`,
        }),
      });

      if (res.ok) {
        toast.success("Moisture reading saved");
        onSaved();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save reading");
      }
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
  onSaved,
  onCancel,
}: {
  extraction: Extract<OcrExtraction, { type: "environmental" }>;
  inspectionId: string;
  onSaved: () => void;
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

  const save = async () => {
    const tempNum = temp ? parseFloat(temp) : undefined;
    const rhNum = rh ? parseFloat(rh) : undefined;

    if (tempNum === undefined && rhNum === undefined) {
      toast.error("At least temperature or humidity must be entered");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/environmental`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ambientTemperature: tempNum,
            humidityLevel: rhNum,
            dewPoint: dew ? parseFloat(dew) : undefined,
            notes: `Captured via meter photo OCR. Meter display read: "${extraction.rawText}"`,
          }),
        },
      );

      if (res.ok) {
        toast.success("Environmental data applied to inspection");
        onSaved();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save environmental data");
      }
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

      <p className="text-xs text-neutral-400">
        Meter display:{" "}
        <code className="bg-neutral-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-slate-300">
          {extraction.rawText || "(unable to read)"}
        </code>
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Field
          label="Temp (°C)"
          value={temp}
          onChange={setTemp}
          type="number"
          step="0.1"
        />
        <Field
          label="RH (%)"
          value={rh}
          onChange={setRh}
          type="number"
          step="0.1"
          min="0"
          max="100"
        />
        <Field
          label="Dew Point (°C)"
          value={dew}
          onChange={setDew}
          type="number"
          step="0.1"
        />
      </div>

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
      toast.success(`${text} copied — paste into the Affected Areas form`);
    } catch {
      toast(`Measurement: ${text}`, { icon: "📋" });
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
        📋 Tap below to copy this value, then paste it into the Affected Areas
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

  // Send photo to OCR route
  const analyse = async () => {
    if (!file) return;
    setAnalysing(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("extractionType", mode);

    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/analyze-photo`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Analysis failed — please try again");
        return;
      }

      setExtraction(data.extraction as OcrExtraction);
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

  const handleSaved = () => {
    reset();
    onReadingAccepted?.();
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
                className="text-red-500 mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
                {error.includes("Integrations") && (
                  <a
                    href="/dashboard/integrations"
                    className="text-xs text-red-700 dark:text-red-300 underline mt-1 inline-block"
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
            aria-label={analysing ? "Reading meter with AI…" : "Analyse meter photo with AI"}
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
              onSaved={handleSaved}
              onCancel={reset}
            />
          )}
          {extraction.type === "environmental" && (
            <EnvironmentalConfirm
              extraction={extraction}
              inspectionId={inspectionId}
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
