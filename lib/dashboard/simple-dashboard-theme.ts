/** Visual language shared by /dashboard overview and simple-mode list pages. */

export const SIMPLE_DASHBOARD_MAX_WIDTH = "max-w-9xl";

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
