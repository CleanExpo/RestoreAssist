import type { ClientVideo } from "@/lib/portal/client-videos";

export function PortalHelpMedia({
  videos,
  heading = "Watch a short explainer",
}: {
  videos: ClientVideo[];
  heading?: string;
}) {
  if (videos.length === 0) return null;

  return (
    <section data-testid="portal-help-media" className="space-y-3">
      <h2 className="text-sm font-semibold text-brand-navy">{heading}</h2>
      <ul className="space-y-3">
        {videos.map((video) => (
          <li key={video.id}>
            <p className="text-sm font-medium text-brand-navy">{video.title}</p>
            <p className="text-xs text-brand-slate mb-2">{video.description}</p>
            <video
              controls
              preload="metadata"
              src={video.url}
              title={video.title}
              aria-label={`${video.title} — captions unavailable`}
              className="w-full rounded-lg border border-brand-slate/20 bg-black"
            >
              <track kind="captions" srcLang="en-AU" label="Captions unavailable" />
              <p className="sr-only">
                Video: {video.title}. A captioned version is not available.
              </p>
              <a href={video.url} rel="noopener noreferrer">
                Open {video.title}
              </a>
            </video>
          </li>
        ))}
      </ul>
    </section>
  );
}
