export {
  DASHBOARD_PAGE_MAX_WIDTH as CLIENT_PORTAL_MAX_WIDTH,
  simpleDashboardMeshGradient as clientPortalMeshGradient,
  simpleDashboardHeroShell as clientPortalHeroShell,
} from "@/lib/dashboard/simple-dashboard-theme";

export const clientPortalPageShell =
  "relative isolate min-h-screen bg-slate-950 text-slate-100";

export const clientPortalPanel =
  "rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-indigo-950/35 shadow-lg shadow-black/25 backdrop-blur-sm";

export const clientPortalPanelPadding = `${clientPortalPanel} p-5 sm:p-6`;

export const clientPortalEyebrow =
  "text-[10px] font-semibold uppercase tracking-widest text-cyan-400/80";

export const clientPortalPrimaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-cyan-950/30 transition hover:from-cyan-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:pointer-events-none disabled:opacity-50";

export const clientPortalPrimaryLink = clientPortalPrimaryButton;

export const clientPortalTextLink =
  "text-sm text-cyan-400/90 underline-offset-2 hover:text-cyan-300 hover:underline";

export const clientPortalMuted = "text-sm text-slate-400";

export const clientPortalHeading = "text-sm font-semibold text-white/95";
