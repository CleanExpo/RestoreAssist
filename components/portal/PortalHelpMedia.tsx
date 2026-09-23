"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientVideo } from "@/lib/portal/client-videos";

/**
 * RA-7714 — never show an empty 0:00 player. A video with no source is not
 * rendered at all, and a video whose source fails to load is removed. The
 * failure can happen before React hydrates (the server-rendered <video> starts
 * loading at once), when an `error` event would be missed, so each player also
 * checks its own error / no-source state once it mounts.
 */
const NETWORK_NO_SOURCE = 3;

function HelpVideo({
  video,
  onFail,
}: {
  video: ClientVideo;
  onFail: (id: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && (el.error || el.networkState === NETWORK_NO_SOURCE)) {
      onFail(video.id);
    }
  }, [video.id, onFail]);

  return (
    <li>
      <p className="text-sm font-medium text-brand-navy">{video.title}</p>
      <p className="text-xs text-brand-slate mb-2">{video.description}</p>
      <video
        ref={ref}
        controls
        preload="metadata"
        src={video.url}
        title={video.title}
        aria-label={`${video.title} — captions unavailable`}
        className="w-full rounded-lg border border-brand-slate/20 bg-black"
        onError={() => onFail(video.id)}
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
  );
}

export function PortalHelpMedia({
  videos,
  heading = "Watch a short explainer",
}: {
  videos: ClientVideo[];
  heading?: string;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const onFail = useCallback((id: string) => {
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const playable = videos.filter(
    (video) => video.url.trim() !== "" && !failed.has(video.id),
  );
  if (playable.length === 0) return null;

  return (
    <section data-testid="portal-help-media" className="space-y-3">
      <h2 className="text-sm font-semibold text-brand-navy">{heading}</h2>
      <ul className="space-y-3">
        {playable.map((video) => (
          <HelpVideo key={video.id} video={video} onFail={onFail} />
        ))}
      </ul>
    </section>
  );
}
