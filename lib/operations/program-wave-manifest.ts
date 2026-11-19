/**
 * Wave 5 (W5-3) — static program wave status for leadership dashboards.
 * Update when RESTOREASSIST-FULL-FUNCTIONALITY-PROGRAM.md changes.
 */

export type ProgramWaveRow = {
  wave: string;
  label: string;
  status: "complete" | "in_progress" | "planned";
  openItems: string[];
};

export const PROGRAM_WAVE_MANIFEST: ProgramWaveRow[] = [
  {
    wave: "0",
    label: "Foundations",
    status: "complete",
    openItems: [],
  },
  {
    wave: "1",
    label: "Trust layer",
    status: "complete",
    openItems: [],
  },
  {
    wave: "2",
    label: "Field UX",
    status: "complete",
    openItems: [],
  },
  {
    wave: "3",
    label: "Connectors",
    status: "complete",
    openItems: ["W3-1 Xero pilot receipt (manual sign-off)"],
  },
  {
    wave: "4",
    label: "Market parity",
    status: "complete",
    openItems: ["W4-4 Zapier marketplace listing (post-pilot)"],
  },
  {
    wave: "5",
    label: "Operations excellence",
    status: "complete",
    openItems: ["Run slo-load-harness against staging before pilot cutover"],
  },
  {
    wave: "6",
    label: "Production readiness",
    status: "in_progress",
    openItems: [
      "W6-3 RLS / build strictness (roadmap phase 6)",
      "Org audit export UI link from ops hub",
    ],
  },
];