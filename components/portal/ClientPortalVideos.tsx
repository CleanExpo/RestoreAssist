import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

/**
 * "Understanding your claim" — explainer videos on the client portal.
 * Renders the config list (lib/portal/client-videos.ts) as opener links.
 */
export function ClientPortalVideos() {
  if (CLIENT_PORTAL_VIDEOS.length === 0) return null;
  return (
    <section className={clientPortalPanelPadding}>
      <h2 className="text-sm font-semibold text-white/95">
        Understanding your claim
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        Short videos on the restoration process and what to expect.
      </p>
      <ul className="space-y-2">
        {CLIENT_PORTAL_VIDEOS.map((v) => (
          <li key={v.id}>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Watch: ${v.title}`}
              className="block rounded-lg border border-white/10 bg-slate-950/30 p-3 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/5"
            >
              <span className="block text-sm font-medium text-slate-100">
                ▶ {v.title}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {v.description}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
