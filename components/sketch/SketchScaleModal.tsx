"use client";

/**
 * SketchScaleModal — 2-click scale calibration.
 *
 * The user clicks two points on the canvas, enters the real-world distance,
 * and the tool derives pxPerMetre for accurate area calculations.
 *
 * scaleConfig is stored in sketchData JSON (no Prisma migration needed).
 */

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Ruler, X, Check, Info } from "lucide-react";
import { distance } from "@/lib/sketch/geometry-utils";

export interface ScaleConfig {
  pxPerMetre: number;
  /** Human-readable description, e.g. "Calibrated: 3.00 m = 312 px" */
  description: string;
}

export interface SketchScaleModalProps {
  /** Current scale (null = not calibrated, defaults to 100 px/m) */
  currentScale: ScaleConfig | null;
  onCalibrate: (config: ScaleConfig) => void;
  onClose: () => void;
  /** Canvas element to attach click listeners to during calibration */
  canvasEl: HTMLCanvasElement | null;
}

type CalibrationStep = "idle" | "click1" | "click2" | "confirm";

export function SketchScaleModal({
  currentScale,
  onCalibrate,
  onClose,
  canvasEl,
}: SketchScaleModalProps) {
  const [step, setStep] = useState<CalibrationStep>("idle");
  const [pt1, setPt1] = useState<{ x: number; y: number } | null>(null);
  const [pt2, setPt2] = useState<{ x: number; y: number } | null>(null);
  const [realMetres, setRealMetres] = useState("3");
  const [error, setError] = useState<string | null>(null);

  const listenerRef = useRef<((e: MouseEvent) => void) | null>(null);

  const removeListener = useCallback(() => {
    if (listenerRef.current && canvasEl) {
      canvasEl.removeEventListener("click", listenerRef.current);
      listenerRef.current = null;
    }
  }, [canvasEl]);

  const startCalibration = useCallback(() => {
    if (!canvasEl) return;
    setPt1(null);
    setPt2(null);
    setError(null);
    setStep("click1");

    const handleClick = (e: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      const pt = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      setPt1((prev) => {
        if (!prev) {
          // First click
          setStep("click2");
          return pt;
        }
        // Second click
        setPt2(pt);
        setStep("confirm");
        removeListener();
        return prev;
      });
    };

    listenerRef.current = handleClick;
    canvasEl.addEventListener("click", handleClick);
  }, [canvasEl, removeListener]);

  const handleConfirm = useCallback(() => {
    if (!pt1 || !pt2) return;
    const metres = parseFloat(realMetres);
    if (!metres || metres <= 0) {
      setError("Enter a valid distance in metres");
      return;
    }
    const px = distance(pt1, pt2);
    if (px < 10) {
      setError("Points too close — click further apart");
      return;
    }
    const pxPerMetre = px / metres;
    onCalibrate({
      pxPerMetre,
      description: `Calibrated: ${metres.toFixed(2)} m = ${Math.round(px)} px`,
    });
    onClose();
  }, [pt1, pt2, realMetres, onCalibrate, onClose]);

  const handleCancel = useCallback(() => {
    removeListener();
    setStep("idle");
    setPt1(null);
    setPt2(null);
    onClose();
  }, [removeListener, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-80 bg-[#1C2E47] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler size={16} className="text-cyan-400" />
            <h3 className="font-semibold text-sm">Scale Calibration</h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-white/30 hover:text-white/70"
          >
            <X size={14} />
          </button>
        </div>

        {/* Current scale */}
        {currentScale && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            {currentScale.description}
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3 text-sm">
          <Step
            num={1}
            label="Click the first reference point on the canvas"
            done={!!pt1}
            active={step === "click1"}
          />
          <Step
            num={2}
            label="Click the second reference point"
            done={!!pt2}
            active={step === "click2"}
          />
          <Step
            num={3}
            label="Enter the real-world distance between the two points"
            done={step === "confirm"}
            active={step === "confirm"}
          />
        </div>

        {/* Distance input */}
        {step === "confirm" && (
          <div>
            <label className="block text-xs text-white/50 mb-1">
              Real-world distance (metres)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={realMetres}
              onChange={(e) => setRealMetres(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
              autoFocus
            />
            {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {step === "idle" && (
            <button
              type="button"
              onClick={startCalibration}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition-colors"
            >
              <Ruler size={14} />
              Start calibration
            </button>
          )}

          {step === "confirm" && (
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition-colors"
            >
              <Check size={14} />
              Apply scale
            </button>
          )}

          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>

        <p className="text-[11px] text-white/25 text-center">
          Default: 100 px = 1 m · Calibration improves area accuracy
        </p>
      </div>
    </div>
  );
}

function Step({
  num,
  label,
  done,
  active,
}: {
  num: number;
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 text-xs",
        active ? "text-white" : "text-white/40",
      )}
    >
      <span
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
          done
            ? "bg-cyan-500 border-cyan-400 text-white"
            : active
              ? "border-cyan-400 text-cyan-400"
              : "border-white/20",
        )}
      >
        {done ? <Check size={10} /> : num}
      </span>
      {label}
    </div>
  );
}
