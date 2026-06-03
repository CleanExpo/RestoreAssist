"use client";

/**
 * VideoExplainer — slug-addressable RestoreAssist tutorial videos.
 *
 * Hosted as Unlisted on YouTube and embedded via privacy-enhanced iframe
 * (youtube-nocookie.com). Until the user clicks the thumbnail, no YouTube
 * iframe is loaded — keeps the /dashboard/learn page light when six cards
 * render at once.
 *
 * To add a new video: drag the MP4 onto studio.youtube.com as Unlisted,
 * grab the 11-char ID from the youtu.be/<id> URL, add a slug entry below.
 */
import { useRef, useState } from "react";
import {
  VIDEO_REGISTRY,
  type VideoExplainerSlug,
  type RegistryEntry,
} from "./video-registry";

// Re-export so existing consumers keep working.
export { VIDEO_REGISTRY };
export type { VideoExplainerSlug, RegistryEntry };

interface VideoExplainerProps {
  slug: VideoExplainerSlug;
  className?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoExplainer({ slug, className }: VideoExplainerProps) {
  const entry = VIDEO_REGISTRY[slug];
  const [isPlaying, setIsPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!entry) return null;
  const { youtubeId, cloudinaryUrl, localPath, title, durationSec } = entry;

  const wrapperClass =
    className ??
    "relative aspect-video w-full overflow-hidden rounded-xl border-2 border-[#8A6B4E]/30 shadow-2xl bg-[#050505]";

  // Cloudinary CDN — fastest global delivery
  if (cloudinaryUrl) {
    return (
      <div className={wrapperClass}>
        <video
          src={cloudinaryUrl}
          title={title}
          controls
          preload="metadata"
          playsInline
          className="h-full w-full bg-black"
          aria-label={title}
        />
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {formatDuration(durationSec)}
        </div>
      </div>
    );
  }

  // Repo-hosted MP4 — render a native <video> element. Used for slugs
  // pending YouTube unlisted upload; replace with youtubeId once uploaded.
  if (localPath) {
    return (
      <div className={wrapperClass}>
        <video
          src={localPath}
          title={title}
          controls
          preload="metadata"
          playsInline
          className="h-full w-full bg-black"
          aria-label={title}
        />
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {formatDuration(durationSec)}
        </div>
      </div>
    );
  }

  if (isPlaying) {
    return (
      <div className={wrapperClass}>
        <iframe
          ref={iframeRef}
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full"
          loading="eager"
        />
      </div>
    );
  }

  const thumb = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;

  const handleActivate = () => setIsPlaying(true);

  return (
    <div
      className={wrapperClass + " cursor-pointer group"}
      onClick={handleActivate}
      role="button"
      aria-label={`Play: ${title}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt={title}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(e) => {
          // Some uploads only generate hqdefault. Fall back.
          (e.currentTarget as HTMLImageElement).src =
            `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-[#1C2E47]/60 transition-colors group-hover:bg-[#1C2E47]/40">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8A6B4E] shadow-lg transition-transform group-hover:scale-110">
          <svg
            className="ml-1 h-8 w-8 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
        {formatDuration(durationSec)}
      </div>
    </div>
  );
}

export default VideoExplainer;
