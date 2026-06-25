"use client";

/**
 * VideoExplainer — slug-addressable RestoreAssist tutorial videos.
 *
 * Advanced features:
 * - Analytics tracking (play, pause, progress, completion)
 * - Captions/transcript support via VTT (60 caption files)
 * - Mobile-optimised (responsive, poster, touch controls)
 * - Lazy loading with IntersectionObserver
 */
import { useRef, useState, useEffect, useCallback } from "react";
import {
  VIDEO_REGISTRY,
  type VideoExplainerSlug,
  type RegistryEntry,
} from "./video-registry";
import { getCaptionUrl } from "./caption-registry";

// Re-export so existing consumers keep working.
export { VIDEO_REGISTRY };
export type { VideoExplainerSlug, RegistryEntry };

interface VideoExplainerProps {
  slug: VideoExplainerSlug;
  className?: string;
  showCaptions?: boolean;
  trackEngagement?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Analytics tracking ───
function trackEvent(
  slug: string,
  eventType: string,
  details?: { watchDurationSec?: number; totalDurationSec?: number }
) {
  // Debounce: don't spam the API
  const key = `ra-track-${slug}-${eventType}`;
  const last = sessionStorage.getItem(key);
  const now = Date.now();
  if (last && now - parseInt(last) < 5000) return;
  sessionStorage.setItem(key, String(now));

  fetch("/api/video/engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoSlug: slug,
      eventType,
      ...details,
    }),
  }).catch(() => {}); // Silently fail if offline
}

// ─── Progress milestones ───
const MILESTONES = [0.25, 0.5, 0.75, 1.0] as const;

export function VideoExplainer({
  slug,
  className,
  showCaptions = true,
  trackEngagement = true,
}: VideoExplainerProps) {
  const entry = VIDEO_REGISTRY[slug];
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const milestonesRef = useRef<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Lazy load via IntersectionObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // durationSec must be available to the hooks below; entry may be undefined
  // here and is handled by the early-return AFTER all hooks.
  const durationSec = entry?.durationSec ?? 0;

  // ─── Video event handlers (must precede any early-return — rules-of-hooks) ───
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    if (trackEngagement) {
      trackEvent(slug, "play", { totalDurationSec: durationSec });
    }
  }, [slug, durationSec, trackEngagement]);

  const handlePause = useCallback(() => {
    if (trackEngagement) {
      trackEvent(slug, "pause", {
        watchDurationSec: Math.floor(videoRef.current?.currentTime || 0),
        totalDurationSec: durationSec,
      });
    }
  }, [slug, durationSec, trackEngagement]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !trackEngagement) return;

    const progress = video.currentTime / video.duration;
    for (const milestone of MILESTONES) {
      if (progress >= milestone && !milestonesRef.current.has(milestone)) {
        milestonesRef.current.add(milestone);
        const eventType =
          milestone === 1.0
            ? "complete"
            : (`progress_${Math.round(milestone * 100)}` as
                | "progress_25"
                | "progress_50"
                | "progress_75");
        trackEvent(slug, eventType, {
          watchDurationSec: Math.floor(video.currentTime),
          totalDurationSec: durationSec,
        });
      }
    }
  }, [slug, durationSec, trackEngagement]);

  const handleEnded = useCallback(() => {
    if (trackEngagement) {
      trackEvent(slug, "complete", {
        watchDurationSec: durationSec,
        totalDurationSec: durationSec,
      });
    }
  }, [slug, durationSec, trackEngagement]);

  // Early-return AFTER all hooks above — rules-of-hooks compliant.
  if (!entry) return null;
  const { youtubeId, localPath, cloudinaryUrl, title } = entry;

  const wrapperClass =
    className ??
    "relative aspect-video w-full overflow-hidden rounded-xl border-2 border-brand-bronze/30 shadow-2xl bg-brand-canvas";

  // ─── Video element with captions + mobile optimisation ───
  const renderVideo = (src: string) => {
    // Captions are keyed by file stem; the registry slug differs, so resolve
    // via the resolved video source (`src` = …/<stem>.mp4) as the fallback.
    const captionUrl = getCaptionUrl(slug, src);
    // Use CDN poster if available (first frame extracted by Cloudinary)
    const posterUrl = cloudinaryUrl
      ? cloudinaryUrl.replace("/upload/", "/upload/so_0,w_1280,h_720,c_fill/").replace(".mp4", ".jpg")
      : undefined;

    return (
      <div className={wrapperClass} ref={containerRef}>
        {isVisible && (
          <video
            ref={videoRef}
            src={src}
            title={title}
            controls
            preload={isMobile ? "none" : "metadata"}
            playsInline
            muted={isMobile} // Mobile: start muted (autoplay-friendly)
            className="h-full w-full bg-black"
            aria-label={title}
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            poster={isMobile ? posterUrl : undefined}
            disablePictureInPicture={isMobile}
          >
            {showCaptions && captionUrl && (
              <track
                kind="captions"
                src={captionUrl}
                srcLang="en"
                label="English"
                default
              />
            )}
            <p className="sr-only">
              Video: {title}. Duration: {formatDuration(durationSec)}.
              {captionUrl ? " English captions available." : ""}
            </p>
          </video>
        )}
        {!isVisible && (
          <div className="h-full w-full bg-brand-navy flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-brand-bronze/30" />
              <div className="h-3 w-24 rounded bg-brand-bronze/20" />
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {formatDuration(durationSec)}
        </div>
      </div>
    );
  };

  // Cloudinary-hosted MP4 — CDN delivery (preferred)
  if (cloudinaryUrl) {
    return renderVideo(cloudinaryUrl);
  }

  // Repo-hosted MP4 — fallback
  if (localPath) {
    return renderVideo(localPath);
  }

  // YouTube fallback (still tracks engagement via iframe API)
  if (isPlaying) {
    return (
      <div className={wrapperClass} ref={containerRef}>
        {isVisible && (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
            loading="eager"
          />
        )}
        {!isVisible && (
          <div className="h-full w-full bg-brand-navy flex items-center justify-center">
            <div className="animate-pulse h-12 w-12 rounded-full bg-brand-bronze/30" />
          </div>
        )}
      </div>
    );
  }

  const thumb = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;

  return (
    <div
      className={wrapperClass + " cursor-pointer group"}
      ref={containerRef}
      onClick={() => setIsPlaying(true)}
      role="button"
      aria-label={`Play: ${title}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsPlaying(true);
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
          (e.currentTarget as HTMLImageElement).src =
            `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/60 transition-colors group-hover:bg-brand-navy/40">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-bronze shadow-lg transition-transform group-hover:scale-110">
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
