"use client";

/**
 * RA-8372 (RA-IEP-02) — read-only investigation layer over the room sketch.
 *
 * Renders the derived overlay from `buildInvestigationOverlay`: each
 * observation sits at its plan position (same viewport mapping as evidence,
 * moisture and damage-marker pins, RA-7547) with its basis label, and a
 * summary panel states source, pathway, receptors and evidence gaps.
 *
 * It never captures input on the plan and never writes to any store.
 */

import { useMemo } from "react";
import {
  ChromeAlertTriangle,
  ChromeCamera,
  ChromeDroplet,
  ChromeMapPin,
  ChromeScanLine,
} from "@/components/brand/chrome-icons";
import { cn } from "@/lib/utils";
import {
  IDENTITY_OVERLAY_VIEWPORT,
  overlayScreenPoint,
  type OverlayViewport,
} from "@/lib/sketch/overlay-viewport";
import {
  VALUE_BASIS_LABEL,
  type InvestigationObservation,
  type InvestigationOverlay,
  type ObservationKind,
} from "@/lib/sketch/investigation-overlay";

// Chrome glyphs, not lucide-react (Phill Rule 1, scripts/check-no-lucide.mjs):
// they inherit the chip's text colour, which branded RAIcon assets cannot.
const KIND_ICON: Record<ObservationKind, typeof ChromeDroplet> = {
  instrument_reading: ChromeDroplet,
  photo: ChromeCamera,
  technician_marker: ChromeMapPin,
};

export interface SketchInvestigationLayerProps {
  overlay: InvestigationOverlay;
  overlayViewport?: OverlayViewport;
  className?: string;
}

function observationAria(o: InvestigationObservation): string {
  const values = o.values
    .map((v) => `${v.label} ${v.value} (${VALUE_BASIS_LABEL[v.basis]})`)
    .join(", ");
  const gaps = o.gaps.length ? `. Gaps: ${o.gaps.join(", ")}` : "";
  return `${o.title} in ${o.roomLabel}${values ? `: ${values}` : ""}${gaps}`;
}

export function SketchInvestigationLayer({
  overlay,
  overlayViewport,
  className,
}: SketchInvestigationLayerProps) {
  const vpt = overlayViewport ?? IDENTITY_OVERLAY_VIEWPORT;
  const flaggedCount = useMemo(
    () =>
      overlay.observations.filter((o) => o.flaggedWording.length > 0).length,
    [overlay.observations],
  );

  return (
    <div
      className={cn("absolute inset-0 z-[24] pointer-events-none", className)}
      data-testid="sketch-investigation-layer"
      aria-label="Investigation layer"
    >
      <ul aria-label="Observations on plan">
        {overlay.observations.map((o) => {
          const Icon = KIND_ICON[o.kind];
          const screen = overlayScreenPoint(o.sceneX, o.sceneY, vpt);
          const hasGap = o.gaps.length > 0 || o.flaggedWording.length > 0;
          return (
            <li
              key={o.id}
              data-testid="investigation-observation"
              data-observation-id={o.id}
              data-has-gap={hasGap ? "true" : "false"}
              aria-label={observationAria(o)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: screen.left, top: screen.top }}
            >
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shadow-sm",
                  "bg-white/95 text-brand-navy",
                  hasGap ? "border-amber-500" : "border-brand-harbour",
                )}
              >
                <Icon size={12} aria-hidden />
                {VALUE_BASIS_LABEL[o.values[0]?.basis ?? "observed"]}
                {hasGap && (
                  <ChromeAlertTriangle
                    size={11}
                    className="text-amber-600"
                    aria-hidden
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <section
        data-testid="investigation-summary"
        aria-label="Investigation summary"
        className="pointer-events-auto absolute right-3 top-3 w-72 max-w-[calc(100%-1.5rem)] max-h-[70%] overflow-y-auto rounded-lg border border-white/10 bg-brand-navy/95 p-3 text-xs text-white shadow-lg"
      >
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
          <ChromeScanLine size={13} aria-hidden />
          Investigation view
        </h3>
        <p className="mb-2 text-white/60">
          Built from evidence already on this floor. Nothing here is saved or
          inferred.
        </p>

        <dl className="space-y-2">
          <div>
            <dt className="font-semibold">Source</dt>
            <dd className="text-white/70" data-testid="investigation-source">
              {overlay.source.note}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Pathway</dt>
            <dd className="text-white/70" data-testid="investigation-pathway">
              {overlay.pathways.note}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Receptors (rooms with an observed effect)</dt>
            <dd data-testid="investigation-receptors">
              {overlay.receptors.length === 0 ? (
                <span className="text-white/70">None observed yet.</span>
              ) : (
                <ul className="list-disc pl-4 text-white/80">
                  {overlay.receptors.map((r) => (
                    <li key={r.roomLabel}>
                      {r.roomLabel} — {r.observationIds.length}{" "}
                      {r.observationIds.length === 1
                        ? "observation"
                        : "observations"}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Evidence gaps</dt>
            <dd className="text-white/70" data-testid="investigation-gaps">
              {overlay.gapCount === 0
                ? "None found."
                : `${overlay.gapCount} across ${overlay.observations.filter((o) => o.gaps.length > 0).length} observations.`}
            </dd>
          </div>
          {flaggedCount > 0 && (
            <div data-testid="investigation-flagged">
              <dt className="flex items-center gap-1 font-semibold text-amber-300">
                <ChromeAlertTriangle size={12} aria-hidden />
                Unsupported wording
              </dt>
              <dd className="text-white/70">
                {flaggedCount}{" "}
                {flaggedCount === 1 ? "note uses" : "notes use"} condition
                wording that site evidence cannot support. It is not an
                assessment.
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-white/50">
          Observed = captured on site. Calculated = derived by RestoreAssist
          from an observed value. Illustrated = drawn for orientation, not
          measured.
        </p>
      </section>
    </div>
  );
}
