/**
 * Client portal visual language — aligned with /dashboard (slate-950, mesh, cyan accents).
 * Homeowners never see DashboardShell; this module keeps the two surfaces consistent.
 */

export {
  DASHBOARD_PAGE_MAX_WIDTH as CLIENT_PORTAL_MAX_WIDTH,
  simpleDashboardMeshGradient as clientPortalMeshGradient,
  simpleDashboardHeroShell as clientPortalHeroShell,
  simpleDashboardPanelGradient,
} from "@/lib/dashboard/simple-dashboard-theme";

export const clientPortalPageShell =
  "relative isolate min-h-screen bg-slate-950 text-slate-100";

/** Standard content panel on token pages and login. */
export const clientPortalPanel =
  "rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-indigo-950/35 shadow-lg shadow-black/25 backdrop-blur-sm";

export const clientPortalPanelPadding = `${clientPortalPanel} p-5`;

export const clientPortalEyebrow =
  "text-[10px] font-semibold uppercase tracking-widest text-cyan-400/80";

export const clientPortalPrimaryLink =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-cyan-950/30 transition hover:from-cyan-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50";
