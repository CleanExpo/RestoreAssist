"use client";

/**
 * Empty-canvas studio: upload a reference plan or draw rooms first.
 * Moisture stays available immediately — don't block readings on geometry.
 */

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Scan, Square, Upload, Droplets, ImageIcon, Loader2 } from "lucide-react";
import { prepareUnderlayFile } from "@/lib/sketch/prepare-underlay-file";
import { commitUnderlayImport } from "@/lib/sketch/commit-underlay-import";
import {
  evaluateUnderlayAttestation,
  UNDERLAY_RIGHTS_STATEMENT,
} from "@/lib/sketch/underlay-attestation";

export interface SketchStartOverlayProps {
  visible: boolean;
  /** Native RoomPlan available on this device. */
  canScan?: boolean;
  onScan?: () => void;
  onStartBlank: () => void;
  /** Fallback: open the underlay panel file picker (used when studio apply is unavailable). */
  onImportUnderlay?: () => void;
  /** Full studio upload: persist + apply without leaving the chooser. */
  onApplyUnderlay?: (imageUrl: string, opacity: number) => void;
  inspectionId?: string;
  onPlaceMoisture: () => void;
  className?: string;
}

export function SketchStartOverlay({
  visible,
  canScan = false,
  onScan,
  onStartBlank,
  onImportUnderlay,
  onApplyUnderlay,
  inspectionId,
  onPlaceMoisture,
  className,
}: SketchStartOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.35);
  const [holdsRights, setHoldsRights] = useState(false);
  const [compliesTerms, setCompliesTerms] = useState(false);

  const attestation = evaluateUnderlayAttestation({
    holdsRights,
    compliesWithSourceTerms: compliesTerms,
  });

  const resetReview = useCallback(() => {
    setPreview(null);
    setHoldsRights(false);
    setCompliesTerms(false);
    setError(null);
    setOpacity(0.35);
  }, []);

  const acceptFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    const result = await prepareUnderlayFile(file);
    setPreparing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.dataUrl);
    setHoldsRights(false);
    setCompliesTerms(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      void acceptFile(e.dataTransfer.files?.[0]);
    },
    [acceptFile],
  );

  const handleApply = useCallback(async () => {
    if (!preview || applying) return;
    if (!onApplyUnderlay) {
      onImportUnderlay?.();
      return;
    }
    setApplying(true);
    setError(null);
    const result = await commitUnderlayImport({
      selectedImage: preview,
      inspectionId,
      holdsRights,
      compliesWithSourceTerms: compliesTerms,
      source: "upload",
    });
    setApplying(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApplyUnderlay(result.imageUrl, opacity);
    resetReview();
  }, [
    preview,
    applying,
    onApplyUnderlay,
    onImportUnderlay,
    inspectionId,
    holdsRights,
    compliesTerms,
    opacity,
    resetReview,
  ]);

  if (!visible) return null;

  const studioUpload = Boolean(onApplyUnderlay);

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center pointer-events-none",
        className,
      )}
      role="region"
      aria-label="Start floor plan"
    >
      <div className="pointer-events-auto mx-4 w-full max-w-2xl rounded-2xl border border-white/12 bg-[#0E1518]/96 backdrop-blur-md shadow-2xl p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E55A2B]">
            Floor plan
          </p>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            {preview ? "Review the uploaded plan" : "How do you want to start?"}
          </h2>
          <p className="text-sm text-white/55 leading-relaxed">
            {preview
              ? "Confirm rights, set how strong the reference shows, then place it on the canvas."
              : "Upload a plan to trace, or draw rooms first. Moisture pins work either way."}
          </p>
        </div>

        {preview ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Uploaded floor plan preview"
                className="mx-auto max-h-56 w-full object-contain"
                style={{ opacity }}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="studio-underlay-opacity"
                  className="text-xs font-medium text-white/50 uppercase tracking-wide"
                >
                  Reference opacity
                </label>
                <span className="text-xs text-white/45 tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                id="studio-underlay-opacity"
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-[#E55A2B]"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-500/8 p-3">
              <p className="text-[11px] leading-snug text-white/65">
                {UNDERLAY_RIGHTS_STATEMENT}
              </p>
              <label className="flex items-start gap-2 text-xs text-white/85 cursor-pointer">
                <input
                  type="checkbox"
                  checked={holdsRights}
                  onChange={(e) => setHoldsRights(e.target.checked)}
                  className="mt-0.5 accent-[#E55A2B]"
                />
                The client holds the rights to use this plan.
              </label>
              <label className="flex items-start gap-2 text-xs text-white/85 cursor-pointer">
                <input
                  type="checkbox"
                  checked={compliesTerms}
                  onChange={(e) => setCompliesTerms(e.target.checked)}
                  className="mt-0.5 accent-[#E55A2B]"
                />
                Importing it complies with the source&rsquo;s terms of use.
              </label>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-300">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetReview}
                className="min-h-11 px-4 rounded-xl border border-white/12 text-sm text-white/70 hover:bg-white/5"
              >
                Choose another
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={!attestation.ok || applying}
                title={
                  !attestation.ok ? attestation.reason : undefined
                }
                className="flex-1 min-h-11 rounded-xl bg-[#E55A2B] text-white text-sm font-semibold hover:bg-[#d14e22] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {applying ? "Placing plan…" : "Place on canvas"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  dragOver
                    ? "border-[#E55A2B] bg-[#E55A2B]/15"
                    : "border-white/12 bg-white/4",
                )}
              >
                <div className="flex items-center gap-2 text-white">
                  <ImageIcon size={18} className="shrink-0 text-[#E55A2B]" />
                  <span className="text-sm font-semibold">Upload a plan</span>
                </div>
                <p className="mt-1.5 text-[12px] text-white/50 leading-relaxed">
                  Drop a PNG, JPG, WebP or PDF. Trace rooms over the reference.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (studioUpload) {
                      fileInputRef.current?.click();
                      return;
                    }
                    onImportUnderlay?.();
                  }}
                  disabled={preparing || (!studioUpload && !onImportUnderlay)}
                  className="mt-3 flex items-center justify-center gap-2 min-h-11 w-full rounded-lg bg-white/8 border border-white/12 text-sm font-medium text-white hover:bg-white/12 disabled:opacity-40"
                >
                  {preparing ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Upload size={15} />
                  )}
                  {preparing ? "Preparing plan…" : "Choose image or PDF"}
                </button>
              </div>

              <button
                type="button"
                onClick={onStartBlank}
                className="rounded-xl border border-white/12 bg-white/4 p-4 text-left hover:bg-white/7 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-2 text-white">
                  <Square size={18} className="shrink-0 text-[#C5E063]" />
                  <span className="text-sm font-semibold">Draw from scratch</span>
                </div>
                <p className="mt-1.5 text-[12px] text-white/50 leading-relaxed">
                  Tap to place a 3.86 m room. Drag for a custom size. L and T
                  templates sit on the dock.
                </p>
                <span className="mt-3 inline-flex items-center justify-center min-h-11 w-full rounded-lg bg-[#C5E063] text-[#0E1518] text-sm font-semibold">
                  Start drawing
                </span>
              </button>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-300">
                {error}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              {canScan && onScan && (
                <button
                  type="button"
                  onClick={onScan}
                  className="flex items-center gap-2 min-h-11 px-3 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-50 hover:bg-emerald-500/25 text-left text-sm"
                >
                  <Scan size={16} className="shrink-0" />
                  Scan with LiDAR
                </button>
              )}
              <button
                type="button"
                onClick={onPlaceMoisture}
                className="flex items-center gap-2 min-h-11 px-3 rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-cyan-50 hover:bg-cyan-500/18 text-left text-sm"
              >
                <Droplets size={16} className="shrink-0" />
                Drop moisture pins first
              </button>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void acceptFile(file);
          }}
        />
      </div>
    </div>
  );
}
