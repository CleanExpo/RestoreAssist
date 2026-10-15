/** Visual language shared by /dashboard overview, simple mode, and advanced mode. */

export const SIMPLE_DASHBOARD_MAX_WIDTH = "max-w-9xl";

/** Alias — every dashboard route targets the same content width. */
export const DASHBOARD_PAGE_MAX_WIDTH = SIMPLE_DASHBOARD_MAX_WIDTH;

export const ADVANCED_WORKSPACE_EYEBROW = "Advanced workspace";

/** Advanced-mode sidebar — depth + cyan accent rail. */
export const advancedDashboardSidebarShell =
  "bg-gradient-to-b from-slate-950 via-indigo-950/95 to-slate-950 border-r border-white/5";

export const advancedDashboardSidebarGroupLabel =
  "text-[10px] font-semibold uppercase tracking-widest text-cyan-400/75 mt-3 mb-1 px-2 first:mt-0";

export const advancedDashboardNavActive =
  "bg-gradient-to-r from-cyan-500/15 to-indigo-500/10 text-cyan-100 font-medium ring-1 ring-inset ring-cyan-400/25 shadow-sm shadow-cyan-950/20";

export const advancedDashboardNavIdle =
  "text-slate-300 hover:bg-white/5 hover:text-white";

export const advancedDashboardModeToggleActive =
  "bg-gradient-to-r from-cyan-600/20 to-indigo-600/20 text-cyan-100 ring-1 ring-inset ring-cyan-400/30";

export const simpleDashboardMeshGradient =
  "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(560px,75vh)] bg-[radial-gradient(ellipse_100%_80%_at_50%_-20%,hsl(var(--primary)/0.22),transparent_58%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(6,182,212,0.14),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_15%,rgba(99,102,241,0.12),transparent_50%)] dark:bg-[radial-gradient(ellipse_100%_80%_at_50%_-20%,hsl(var(--primary)/0.28),transparent_58%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(34,211,238,0.12),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_15%,rgba(129,140,248,0.14),transparent_50%)]";

export const simpleDashboardHeroShell =
  "relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-cyan-950 p-5 shadow-xl shadow-cyan-950/20 sm:p-7 dark:shadow-black/40";

export const simpleDashboardHeroShine =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0%,transparent_42%,rgba(34,211,238,0.06)_100%)]";

export const simpleDashboardShortcutLink =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-center text-xs font-medium text-white/85 backdrop-blur-sm transition hover:border-cyan-300/30 hover:bg-white/10 sm:text-sm";

export const simpleDashboardPanelGradient =
  "bg-gradient-to-br from-card via-card to-primary/[0.04]";

export const simpleDashboardStatGradient = {
  amber: "from-amber-500/15 to-card border-amber-500/20",
  cyan: "from-cyan-500/15 to-card border-cyan-500/20",
  violet: "from-violet-500/15 to-card border-violet-500/20",
  neutral: "from-muted/40 to-card border-border",
} as const;
