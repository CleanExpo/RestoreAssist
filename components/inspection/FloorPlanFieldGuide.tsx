"use client";

import { ChromeDroplet, ChromeLayers, ChromePen, ChromeRuler } from "@/components/brand/chrome-icons";

/**
 * IICRC-aligned on-site checklist — keeps techs on the drying documentation path.
 */
export function FloorPlanFieldGuide() {
  return (
    <div
      className="rounded-xl border border-neutral-200/80 bg-neutral-50/90 dark:border-slate-700/60 dark:bg-slate-900/50 px-3 py-2.5 shadow-sm"
      aria-label="Floor plan field checklist"
    >
      <p className="text-xs font-semibold text-neutral-800 dark:text-slate-100">
        On site — document the structure for scope & drying
      </p>
      <ol className="mt-1.5 grid gap-1.5 text-[11px] text-neutral-600 dark:text-slate-300">
        <li className="flex items-center gap-1.5">
          <ChromePen size={12} aria-hidden />
          Import trace or draw rooms (affected + adjacent dry standard)
        </li>
        <li className="flex items-center gap-1.5">
          <ChromeRuler size={12} aria-hidden />
          Calibrate scale before quoting m²
        </li>
        <li className="flex items-center gap-1.5">
          <ChromeDroplet size={12} aria-hidden />
          Pin moisture per room — links to NIR & report
        </li>
        <li className="flex items-center gap-1.5">
          <ChromeLayers size={12} aria-hidden />
          Match scope line items to room names on the plan
        </li>
      </ol>
    </div>
  );
}
