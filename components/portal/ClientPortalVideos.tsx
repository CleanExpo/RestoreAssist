import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";

/**
 * "Understanding your claim" — explainer videos on the client portal.
 * Renders the config list (lib/portal/client-videos.ts) as opener links.
 */
export function ClientPortalVideos() {
  if (CLIENT_PORTAL_VIDEOS.length === 0) return null;
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Understanding your claim
      </h2>
      <p className="text-xs text-slate-500 mb-3">
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
              className="block rounded-lg border border-slate-200 p-3 hover:border-cyan-400 hover:bg-cyan-50/40 transition-colors"
            >
              <span className="block text-sm font-medium text-slate-900">
                ▶ {v.title}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {v.description}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
