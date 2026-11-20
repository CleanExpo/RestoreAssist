/** Visual language shared by /dashboard overview, simple mode, and advanced mode. */

export const SIMPLE_DASHBOARD_MAX_WIDTH = "max-w-9xl";

/** Alias — every dashboard route targets the same content width. */
export const DASHBOARD_PAGE_MAX_WIDTH = SIMPLE_DASHBOARD_MAX_WIDTH;

export const ADVANCED_WORKSPACE_EYEBROW = "Advanced workspace";

/** Advanced-mode sidebar — palette A surfaces (light pair: RA-8305). */
export const advancedDashboardSidebarShell =
  "bg-gradient-to-b from-white via-brand-cloud to-white dark:from-brand-ink dark:via-brand-deep dark:to-brand-ink border-r border-black/10 dark:border-white/5";

export const advancedDashboardSidebarGroupLabel =
  "text-[10px] font-semibold uppercase tracking-widest text-brand-cta dark:text-brand-harbour-light/80 mt-3 mb-1 px-2 first:mt-0";

export const advancedDashboardNavActive =
  "bg-brand-cream text-brand-navy dark:bg-brand-surface-2 dark:text-white font-medium ring-1 ring-inset ring-brand-harbour/30 dark:ring-brand-harbour-light/30 shadow-sm shadow-brand-navy/5 dark:shadow-black/20";

export const advancedDashboardNavIdle =
  "text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white";

export const advancedDashboardModeToggleActive =
  "bg-brand-cream text-brand-navy dark:bg-brand-surface-2 dark:text-white ring-1 ring-inset ring-brand-harbour/30 dark:ring-brand-harbour-light/30";

export const simpleDashboardMeshGradient =
  "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(560px,75vh)] bg-[radial-gradient(ellipse_100%_80%_at_50%_-20%,hsl(var(--primary)/0.22),transparent_58%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(6,182,212,0.14),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_15%,rgba(99,102,241,0.12),transparent_50%)] dark:bg-[radial-gradient(ellipse_100%_80%_at_50%_-20%,hsl(var(--primary)/0.28),transparent_58%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(34,211,238,0.12),transparent_55%),radial-gradient(ellipse_50%_40%_at_0%_15%,rgba(129,140,248,0.14),transparent_50%)]";

/**
 * Brand hero band. Deliberately dark in BOTH themes: the leading `dark` class
 * makes it a dark island, so its own `dark:` children and the theme tokens
 * inside it resolve to dark even when the app is in Light (RA-8305).
 * Palette A dark surfaces since 19/11/2026. Pages whose header can follow
 * the theme use `simpleDashboardHeroShellThemed` instead.
 */
export const simpleDashboardHeroShell =
  "dark relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-brand-surface via-brand-deep to-brand-canvas p-5 shadow-xl shadow-black/20 sm:p-7 dark:shadow-black/40";

export const simpleDashboardHeroShine =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0%,transparent_42%,rgba(106,165,226,0.06)_100%)]";

export const simpleDashboardShortcutLink =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-center text-xs font-medium text-white/85 backdrop-blur-sm transition hover:border-brand-harbour-light/40 hover:bg-white/10 sm:text-sm";

/**
 * Light-first hero band (19/11/2026): light card in Light, the brand dark
 * band in Dark. Children must carry their own light and `dark:` pairs.
 */
export const simpleDashboardHeroShellThemed =
  "relative overflow-hidden rounded-2xl border border-brand-mist bg-gradient-to-br from-white via-brand-cloud to-brand-cream p-5 shadow-sm sm:p-7 dark:border-white/10 dark:from-brand-surface dark:via-brand-deep dark:to-brand-canvas dark:shadow-xl dark:shadow-black/40";

export const simpleDashboardShortcutLinkThemed =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-brand-mist bg-white px-2.5 text-center text-xs font-medium text-brand-navy backdrop-blur-sm transition hover:border-brand-harbour/40 hover:bg-brand-cream sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white/85 dark:hover:border-brand-harbour-light/40 dark:hover:bg-white/10";

export const simpleDashboardPanelGradient =
  "bg-gradient-to-br from-card via-card to-primary/[0.04]";

export const simpleDashboardStatGradient = {
  amber: "from-amber-500/15 to-card border-amber-500/20",
  cyan: "from-brand-harbour-500/15 to-card border-brand-harbour-500/20",
  violet: "from-violet-500/15 to-card border-violet-500/20",
  neutral: "from-muted/40 to-card border-border",
} as const;
