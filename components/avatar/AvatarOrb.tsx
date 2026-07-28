"use client";

/**
 * AvatarOrb — Circular HeyGen avatar component for RestoreAssist landing pages
 *
 * A small, branded avatar orb that floats on the page.
 * - With a greeting/explainer video URL: click opens the video modal.
 * - Without video assets: click opens a lightweight assistant chat panel
 *   (marketing FAQ + signup CTA) so the orb never feels dead.
 *
 * Position: Typically fixed bottom-right or embedded inline.
 * Size: Default 80×80px (compact, mobile-friendly).
 *
 * @example
 *   <AvatarOrb className="fixed bottom-6 right-6 z-50" />
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Video, X, Volume2, VolumeX, Send, MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";

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
  /** Initial greeting text shown as tooltip / chat welcome */
  greetingText?: string;
  /** Auto-play greeting on first view? */
  autoPlay?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What is RestoreAssist?",
  "How does the field workflow work?",
  "Is it built for Australian restorers?",
  "How do I get started?",
];

function answerFor(question: string): string {
  const q = question.toLowerCase();

  if (q.includes("what is") || q.includes("restoreassist") || q.includes("product")) {
    return BRAND.description;
  }
  if (q.includes("field") || q.includes("workflow") || q.includes("office")) {
    return `${BRAND.tagline} Capture inspections in the field, then finish reports, scope, and invoices in the office — without re-keying. AI assists administration and technicians; decisions stay with you.`;
  }
  if (
    q.includes("australia") ||
    q.includes("iicrc") ||
    q.includes("compliance") ||
    q.includes("whs")
  ) {
    return `Yes — RestoreAssist is Australian-designed for the restoration industry, with inbuilt IICRC frameworks, WHS policies, and Australian Building Code references so field capture and office processing stay aligned.`;
  }
  if (
    q.includes("start") ||
    q.includes("sign") ||
    q.includes("price") ||
    q.includes("trial") ||
    q.includes("cost")
  ) {
    return `You can ${BRAND.cta.primary.label.toLowerCase()} free and explore the platform. For pricing details, visit /pricing — or create an account and we'll walk you through setup.`;
  }
  if (q.includes("report") || q.includes("inspection") || q.includes("invoice")) {
    return `RestoreAssist covers National Inspection Reports (NIR), guided interviews, scope of works, cost estimates, and invoicing — one system from site visit to bill-out. ${BRAND.slogan}`;
  }

  return `Happy to help. ${BRAND.shortDescription}\n\nTry one of the suggested questions, or ${BRAND.cta.primary.label.toLowerCase()} to explore the full product with Margot inside the dashboard.`;
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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Animate entrance
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Show tooltip briefly on first load (only when chat isn't already open)
  useEffect(() => {
    if (!entered || isChatOpen) return;
    const t1 = setTimeout(() => setTooltipVisible(true), 800);
    const t2 = setTimeout(() => setTooltipVisible(false), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [entered, isChatOpen]);

  // Auto-play greeting if enabled (muted per browser policy)
  useEffect(() => {
    if (autoPlay && greetingVideoUrl && videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        /* ignore autoplay block */
      });
    }
  }, [autoPlay, greetingVideoUrl]);

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
      chatInputRef.current?.focus();
    }
  }, [isChatOpen, chatMessages]);

  const hasVideo = Boolean(greetingVideoUrl || explainerVideoUrl);

  const openChat = useCallback(() => {
    setIsChatOpen(true);
    setTooltipVisible(false);
    setChatMessages((prev) =>
      prev.length > 0
        ? prev
        : [
            {
              id: "welcome",
              role: "assistant",
              content: greetingText,
            },
          ],
    );
  }, [greetingText]);

  const handleOrbClick = () => {
    if (hasVideo) {
      setIsOpen(true);
      setTooltipVisible(false);
      return;
    }
    // No video asset — open the assistant chatbox (not a dead tooltip toggle).
    if (isChatOpen) {
      setIsChatOpen(false);
    } else {
      openChat();
    }
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

  const sendChat = (raw: string) => {
    const content = raw.trim();
    if (!content) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now() + 1}`,
      role: "assistant",
      content: answerFor(content),
    };
    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setChatInput("");
  };

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
          "shadow-[0_0_30px_rgba(37,99,235,0.35)] hover:shadow-[0_0_50px_rgba(34,211,238,0.45)]",
          "border-2 border-blue-500/50 hover:border-cyan-400/70",
          entered ? "opacity-100 scale-100" : "opacity-0 scale-50",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={
          hasVideo
            ? "Open RestoreAssist video greeting"
            : isChatOpen
              ? "Close RestoreAssist assistant"
              : "Open RestoreAssist assistant"
        }
        aria-expanded={!hasVideo ? isChatOpen : undefined}
      >
        {isChatOpen && !hasVideo ? (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
            <X className="h-6 w-6" />
          </span>
        ) : (
          <>
            <span className="absolute inset-0 rounded-full animate-ping bg-blue-500/20" />
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/25 to-cyan-400/15" />

            {avatarImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarImageUrl}
                alt="Phill McGurk avatar"
                className="w-full h-full rounded-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-cyan-300" />
              </div>
            )}

            {!hasPlayed && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-400 rounded-full border-2 border-slate-950" />
            )}
          </>
        )}

        {tooltipVisible && !isChatOpen && (
          <div className="absolute bottom-full right-0 mb-3 w-48 p-3 bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <p className="text-xs text-slate-200 leading-relaxed">
              {greetingText}
            </p>
            <div className="absolute bottom-[-6px] right-5 w-3 h-3 bg-slate-900 border-r border-b border-slate-700/80 rotate-45" />
          </div>
        )}
      </button>

      {/* ── Assistant chatbox (no-video mode) ── */}
      {isChatOpen && !hasVideo && (
        <div
          className="fixed bottom-24 right-6 z-[100] flex h-[min(560px,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-blue-950/40 animate-in fade-in slide-in-from-bottom-4"
          role="dialog"
          aria-label="RestoreAssist assistant"
        >
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
            <div className="flex items-center gap-3">
              {avatarImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarImageUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-blue-500/40"
                />
              ) : null}
              <div>
                <p className="text-sm font-semibold text-white">Phill</p>
                <p className="text-xs text-slate-400">RestoreAssist guide</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "assistant"
                    ? "bg-slate-900 text-slate-100 border border-slate-800"
                    : "ml-auto bg-gradient-to-r from-blue-600 to-cyan-600 text-white",
                )}
              >
                {msg.content}
              </div>
            ))}

            {chatMessages.length <= 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendChat(q)}
                    className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-white"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-slate-800 bg-slate-900/60 p-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat(chatInput);
              }}
            >
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about RestoreAssist…"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/60"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-opacity disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <Link
              href={BRAND.cta.primary.href}
              className="mt-2 block text-center text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              {BRAND.cta.primary.label} →
            </Link>
          </div>
        </div>
      )}

      {/* ── Video Modal ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 sm:p-8"
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" />

          <div
            className="relative w-full max-w-lg bg-brand-navy border border-brand-bronze/30 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Close video"
                >
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>

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

            <div className="px-4 py-4 border-t border-white/10">
              <p className="text-sm text-white/70 mb-3">
                RestoreAssist — Australia&apos;s purpose-built CRM for restoration
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
