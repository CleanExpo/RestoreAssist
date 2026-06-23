"use client";

/**
 * AvatarOrb — Circular HeyGen avatar component for RestoreAssist landing pages
 *
 * A small, branded avatar orb that floats on the page.
 * Tapping/clicking plays a short greeting video from the Phill McGurk avatar.
 * Designed for dark-first environments (RestoreAssist navy palette).
 *
 * Position: Typically fixed bottom-right or embedded inline.
 * Size: Default 80×80px (compact, mobile-friendly).
 *
 * @example
 *   <AvatarOrb className="fixed bottom-6 right-6 z-50" />
 */

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Video, X, Volume2, VolumeX } from "lucide-react";

interface AvatarOrbProps {
  /** Container className for positioning (e.g., fixed bottom-6 right-6) */
  className?: string;
  /** Size in pixels */
  size?: number;
  /** Avatar image URL (static fallback before video loads) */
  avatarImageUrl?: string;
  /** Pre-generated HeyGen greeting video URL */
  greetingVideoUrl?: string;
  /** Expanded modal video URL (optional — for product explainers) */
  explainerVideoUrl?: string;
  /** Initial greeting text shown as tooltip */
  greetingText?: string;
  /** Auto-play greeting on first view? */
  autoPlay?: boolean;
}

export function AvatarOrb({
  className,
  size = 80,
  avatarImageUrl = "/avatars/phill-mcgurk-orb.png",
  greetingVideoUrl,
  explainerVideoUrl,
  greetingText = "G'day — I'm Phill. Click to learn about RestoreAssist.",
  autoPlay = false,
}: AvatarOrbProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);

  // Animate entrance
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Show tooltip briefly on first load
  useEffect(() => {
    if (!entered) return;
    const t1 = setTimeout(() => setTooltipVisible(true), 800);
    const t2 = setTimeout(() => setTooltipVisible(false), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [entered]);

  // Auto-play greeting if enabled (muted per browser policy)
  useEffect(() => {
    if (autoPlay && greetingVideoUrl && videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        /* ignore autoplay block */
      });
    }
  }, [autoPlay, greetingVideoUrl]);

  // Graceful fallback: if no greeting/explainer video asset is configured,
  // don't open an empty/broken modal — surface the greeting text instead.
  const hasVideo = Boolean(greetingVideoUrl || explainerVideoUrl);

  const handleOrbClick = () => {
    if (!hasVideo) {
      // Toggle the greeting tooltip rather than launching an empty player.
      setTooltipVisible((v) => !v);
      return;
    }
    setIsOpen(true);
    setTooltipVisible(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleVideoEnd = () => {
    setHasPlayed(true);
  };

  const toggleMute = () => {
    setIsMuted((m) => {
      const next = !m;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  };

  // Determine active video based on state
  const activeVideoUrl =
    isOpen && explainerVideoUrl ? explainerVideoUrl : greetingVideoUrl;

  return (
    <>
      {/* ── Floating Orb ── */}
      <button
        ref={orbRef}
        onClick={handleOrbClick}
        className={cn(
          "relative flex items-center justify-center rounded-full cursor-pointer",
          "transition-all duration-500 ease-out",
          "shadow-[0_0_30px_rgba(138,107,78,0.4)] hover:shadow-[0_0_50px_rgba(212,165,116,0.5)]",
          "border-2 border-brand-bronze/60 hover:border-brand-gold",
          entered ? "opacity-100 scale-100" : "opacity-0 scale-50",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={
          hasVideo
            ? "Open RestoreAssist video greeting"
            : "Show RestoreAssist greeting from Phill"
        }
      >
        {/* Pulsing ring animation */}
        <span className="absolute inset-0 rounded-full animate-ping bg-brand-bronze/20" />

        {/* Subtle glow */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-bronze/30 to-brand-gold/20" />

        {/* Avatar image or video thumbnail */}
        {avatarImageUrl ? (
          <img
            src={avatarImageUrl}
            alt="Phill McGurk avatar"
            className="w-full h-full rounded-full object-cover"
            loading="eager"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-brand-navy flex items-center justify-center">
            <Video className="w-6 h-6 text-brand-gold" />
          </div>
        )}

        {/* Play indicator */}
        {!hasPlayed && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-gold rounded-full border-2 border-brand-navy" />
        )}

        {/* Tooltip */}
        {tooltipVisible && (
          <div className="absolute bottom-full right-0 mb-3 w-48 p-3 bg-brand-navy border border-brand-bronze/40 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <p className="text-xs text-white/90 leading-relaxed">
              {greetingText}
            </p>
            <div className="absolute bottom-[-6px] right-5 w-3 h-3 bg-brand-navy border-r border-b border-brand-bronze/40 rotate-45" />
          </div>
        )}
      </button>

      {/* ── Video Modal ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 sm:p-8"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* Modal content */}
          <div
            className="relative w-full max-w-lg bg-brand-navy border border-brand-bronze/30 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-bronze to-brand-gold flex items-center justify-center text-white text-xs font-bold">
                  PM
                </div>
                <span className="text-sm font-medium text-white/90">
                  Phill McGurk — Founder
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Mute toggle */}
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-white/70" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-white/70" />
                  )}
                </button>
                {/* Close */}
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Close video"
                >
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>

            {/* Video player */}
            <div className="relative aspect-[9/16] sm:aspect-video bg-black">
              {activeVideoUrl ? (
                <video
                  ref={videoRef}
                  src={activeVideoUrl}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted={isMuted}
                  onEnded={handleVideoEnd}
                  controls
                  controlsList="nodownload nofullscreen noremoteplayback"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/50">
                  <Video className="w-12 h-12" />
                  <p className="text-sm">Video coming soon</p>
                </div>
              )}
            </div>

            {/* CTA footer */}
            <div className="px-4 py-4 border-t border-white/10">
              <p className="text-sm text-white/70 mb-3">
                RestoreAssist — Australia's purpose-built CRM for restoration
                contractors.
              </p>
              <a
                href="/signup"
                className="block w-full py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-medium rounded-lg text-center transition-colors"
              >
                Get Started Free
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
