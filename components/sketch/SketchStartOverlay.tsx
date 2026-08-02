"use client";

/**
 * Empty-canvas happy-path chooser: Scan → confirm → annotate first;
 * blank canvas and underlay as fallbacks. Moisture is available immediately
 * (Encircle pattern — don't block readings on geometry).
 */

import { cn } from "@/lib/utils";
import { Scan, Square, Upload, Droplets, ImageIcon } from "lucide-react";

export interface SketchStartOverlayProps {
  visible: boolean;
  /** Native RoomPlan available on this device. */
  canScan?: boolean;
  onScan?: () => void;
  onStartBlank: () => void;
  onImportUnderlay?: () => void;
  onPlaceMoisture: () => void;
  className?: string;
}

export function SketchStartOverlay({
  visible,
  canScan = false,
  onScan,
  onStartBlank,
  onImportUnderlay,
  onPlaceMoisture,
  className,
}: SketchStartOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center pointer-events-none",
        className,
      )}
      role="region"
      aria-label="Start floor plan"
    >
      <div className="pointer-events-auto mx-4 max-w-md w-full rounded-2xl border border-white/15 bg-brand-navy/95 backdrop-blur-md shadow-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white tracking-tight">
            Start floor plan
          </h2>
          <p className="text-xs text-white/55 leading-relaxed">
            Prefer scan or underlay, confirm measurements, then annotate.
            Moisture pins work anytime — even before rooms are perfect.
          </p>
        </div>

        <div className="grid gap-2">
          {canScan && onScan && (
            <button
              type="button"
              onClick={onScan}
              className="flex items-center gap-3 min-h-12 px-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-50 hover:bg-emerald-500/30 transition-colors text-left"
            >
              <Scan size={18} className="shrink-0" />
              <span>
                <span className="block text-sm font-medium">Scan with LiDAR</span>
                <span className="block text-[11px] text-emerald-100/70">
                  Happy path — confirm rooms, then annotate
                </span>
              </span>
            </button>
          )}

          {onImportUnderlay && (
            <button
              type="button"
              onClick={onImportUnderlay}
              className="flex items-center gap-3 min-h-12 px-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors text-left"
            >
              <ImageIcon size={18} className="shrink-0 text-white/70" />
              <span>
                <span className="block text-sm font-medium">
                  Import underlay / plan
                </span>
                <span className="block text-[11px] text-white/45">
                  Trace or calibrate over a reference image
                </span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onStartBlank}
            className="flex items-center gap-3 min-h-12 px-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors text-left"
          >
            <Square size={18} className="shrink-0 text-white/70" />
            <span>
              <span className="block text-sm font-medium">Blank canvas</span>
              <span className="block text-[11px] text-white/45">
                Tap to place a ~3.86 m room, or drag for custom size
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onPlaceMoisture}
            className="flex items-center gap-3 min-h-12 px-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-50 hover:bg-cyan-500/20 transition-colors text-left"
          >
            <Droplets size={18} className="shrink-0" />
            <span>
              <span className="block text-sm font-medium">
                Drop moisture pins now
              </span>
              <span className="block text-[11px] text-cyan-100/60">
                Don&apos;t wait for geometry — place readings first
              </span>
            </span>
          </button>
        </div>

        {onImportUnderlay && (
          <p className="flex items-start gap-1.5 text-[10px] text-white/35 leading-snug">
            <Upload size={11} className="mt-0.5 shrink-0" />
            Underlay uploads use the existing Cloudinary path — no separate
            import pipeline.
          </p>
        )}
      </div>
    </div>
  );
}
