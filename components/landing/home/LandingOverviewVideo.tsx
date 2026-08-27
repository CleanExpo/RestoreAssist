"use client";

import { useState } from "react";
import { HOME } from "./homeContent";
import {
  youtubeNocookieEmbedSrc,
  youtubeThumbnailSrc,
} from "./youtube-embed";

/**
 * Click-to-load YouTube embed for the marketing home overview.
 * Poster first; youtube-nocookie iframe only after the visitor asks to play.
 * The id is allowlisted before it is interpolated into any URL.
 */
export function LandingOverviewVideo() {
  const { youtubeId, playLabel, title } = HOME.overview;
  const [playing, setPlaying] = useState(false);
  const embedSrc = youtubeNocookieEmbedSrc(youtubeId);
  const poster = youtubeThumbnailSrc(youtubeId, "maxresdefault");
  const posterFallback = youtubeThumbnailSrc(youtubeId, "hqdefault");

  return (
    <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/12 bg-[#0B1F3A] shadow-[0_12px_40px_rgba(11,31,58,0.12)]">
      <div className="relative aspect-video w-full">
        {playing && embedSrc ? (
          <iframe
            src={embedSrc}
            title={title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            credentialless=""
            className="absolute inset-0 h-full w-full"
          />
        ) : poster ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7BA3BD] focus-visible:ring-inset"
            aria-label={playLabel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube CDN thumb; not in next/image remotePatterns */}
            <img
              src={poster}
              alt=""
              width={1280}
              height={720}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => {
                if (posterFallback) {
                  event.currentTarget.src = posterFallback;
                }
              }}
            />
            <span
              className="absolute inset-0 bg-[#0B1F3A]/45 transition-colors duration-200 group-hover:bg-[#0B1F3A]/30"
              aria-hidden
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(11,31,58,0.28)] transition-transform duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:h-[4.5rem] sm:w-[4.5rem]">
              <svg
                viewBox="0 0 24 24"
                className="ml-0.5 h-7 w-7 text-[#0B1F3A] sm:h-8 sm:w-8"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        ) : (
          <p
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80"
            role="status"
          >
            Overview video is unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
