"use client";

import { PenLine, Droplets, Ruler, Layers } from "lucide-react";

/**
 * IICRC-aligned on-site checklist — keeps techs on the drying documentation path.
 */
export function FloorPlanFieldGuide() {
  return (
    <div
      className="rounded-xl border border-cyan-200/80 bg-cyan-50/60 dark:border-cyan-900/50 dark:bg-cyan-950/30 px-3 py-2.5"
      aria-label="Floor plan field checklist"
    >
      <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-100">
        On site — document the structure for scope & drying
      </p>
      <ol className="mt-1.5 grid gap-1 sm:grid-cols-2 text-[11px] text-cyan-900/80 dark:text-cyan-200/80">
        <li className="flex items-center gap-1.5">
          <PenLine size={12} aria-hidden />
          Import trace or draw rooms (affected + adjacent dry standard)
        </li>
        <li className="flex items-center gap-1.5">
          <Ruler size={12} aria-hidden />
          Calibrate scale before quoting m²
        </li>
        <li className="flex items-center gap-1.5">
          <Droplets size={12} aria-hidden />
          Pin moisture per room — links to NIR & report
        </li>
        <li className="flex items-center gap-1.5">
          <Layers size={12} aria-hidden />
          Match scope line items to room names on the plan
        </li>
      </ol>
    </div>
  );
}
