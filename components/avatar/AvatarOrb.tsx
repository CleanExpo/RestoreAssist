"use client";

/**
 * AvatarOrb — Floating Margot assistant for RestoreAssist public pages.
 *
 * Matches the client Chatbot identity (Margot avatar, name, accent, FAB).
 * - With a greeting/explainer video URL: click opens the video modal.
 * - Without video assets: click opens a lightweight assistant chat panel
 *   backed by /api/margot/public-chat (with an honest offline message on failure).
 *
 * @example
 *   <AvatarOrb className="fixed bottom-6 right-6 z-[100]" />
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Video, X, Volume2, VolumeX, Send, MessageCircle, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { computePanelAnchor, useDraggableOrb } from "./use-draggable-orb";
import {
  MARGOT_ACCENT,
  MARGOT_AVATAR_ORB_PATH,
  MARGOT_DISPLAY_NAME,
  MARGOT_ROLE_LABEL,
  MARGOT_WELCOME,
} from "@/lib/margot-surface";

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

const PUBLIC_CHAT_OFFLINE_MESSAGE =
  "I'm having trouble connecting right now. Please try again in a moment — if this keeps happening, use Get Started below to explore RestoreAssist inside your workspace.";

/** id of the screen-reader hint describing how to reposition the orb. */
const ORB_MOVE_HINT_ID = "margot-orb-move-hint";

const PUBLIC_CHAT_RATE_LIMIT_MESSAGE =
  "I am getting a lot of questions right now. Give me a minute and try again.";

function MargotAvatar({ size }: { size: number }) {
  const px = `${size}px`;
  return (
    <Image
      src={MARGOT_AVATAR_ORB_PATH}
      alt={`${MARGOT_DISPLAY_NAME} avatar`}
      width={size}
      height={size}
      className="aspect-square rounded-full object-cover object-center ring-2 ring-white/40"
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      priority
    />
  );
}

export function AvatarOrb({
  className,
  size = 64,
  avatarImageUrl = MARGOT_AVATAR_ORB_PATH,
  greetingVideoUrl,
  explainerVideoUrl,
  greetingText = MARGOT_WELCOME,
  autoPlay = false,
}: AvatarOrbProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-move. Keeps Margot off the field the user is trying to fill.
  const {
    position,
    isDragging,
    onPointerDown,
    onKeyDown,
    consumeDragSuppression,
  } = useDraggableOrb(size);

  // Touch devices get no unprompted tooltip. The card is 224px wide and the
  // screen it covers is the signup form, so on a phone the "helpful" greeting
  // is the obstruction. Tapping Margot still opens her.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    setCoarsePointer(query.matches);
    const onChange = (e: MediaQueryListEvent) => setCoarsePointer(e.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  // Animate entrance
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Show tooltip briefly on first load (only when chat isn't already open)
  useEffect(() => {
    if (!entered || isChatOpen || coarsePointer) return;
    const t1 = setTimeout(() => setTooltipVisible(true), 800);
    const t2 = setTimeout(() => setTooltipVisible(false), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [entered, isChatOpen, coarsePointer]);

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

  // Panel geometry mirrors the Tailwind classes below: w-[min(24rem,100vw-2rem)]
  // and h-[min(600px,70vh)]. Kept in sync by hand — there is no layout read to
  // derive it from before the panel has rendered.
  const panelAnchor =
    position && typeof window !== "undefined"
      ? computePanelAnchor(
          position,
          size,
          { width: window.innerWidth, height: window.innerHeight },
          {
            width: Math.min(384, window.innerWidth - 32),
            height: Math.min(600, window.innerHeight * 0.7),
          },
        )
      : null;

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
    // The browser fires click after a drag's pointerup. Opening the panel here
    // is the behaviour being complained about, so a drag consumes its click.
    if (consumeDragSuppression()) return;

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

  const sendChat = async (raw: string) => {
    const content = raw.trim();
    if (!content || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/margot/public-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((msg) => msg.id !== "welcome")
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { response?: string };
        const reply = data.response?.trim();
        if (reply) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now() + 1}`,
              role: "assistant",
              content: reply,
            },
          ]);
          return;
        }
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now() + 1}`,
          role: "assistant",
          content:
            response.status === 429
              ? PUBLIC_CHAT_RATE_LIMIT_MESSAGE
              : PUBLIC_CHAT_OFFLINE_MESSAGE,
        },
      ]);
      return;
    } catch {
      // Fall through to the honest offline message below.
    } finally {
      setChatLoading(false);
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        content: PUBLIC_CHAT_OFFLINE_MESSAGE,
      },
    ]);
  };

  const activeVideoUrl =
    isOpen && explainerVideoUrl ? explainerVideoUrl : greetingVideoUrl;

  return (
    <>
      {/* Floating FAB — square icon, matches client Margot Chatbot */}
      <button
        ref={orbRef}
        onClick={handleOrbClick}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        type="button"
        className={cn(
          "group relative z-[100] flex aspect-square shrink-0 items-center justify-center rounded-full p-1",
          // Scale/shadow transitions are fine at rest but fight the pointer
          // while dragging, so the orb lags behind the finger.
          isDragging
            ? "cursor-grabbing"
            : "cursor-grab transition-all duration-300 hover:scale-110 hover:shadow-xl",
          entered ? "scale-100 opacity-100" : "scale-50 opacity-0",
          // Once moved, inline left/top positions the orb, so the caller's
          // corner utilities must not also apply.
          position ? "fixed" : className,
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          boxShadow: isChatOpen ? undefined : `0 8px 28px ${MARGOT_ACCENT}66`,
          // Without this the browser claims the gesture for scrolling and the
          // orb never receives pointermove on a touch screen.
          touchAction: "none",
          ...(position ? { left: position.x, top: position.y } : {}),
        }}
        aria-label={
          hasVideo
            ? "Open RestoreAssist video greeting"
            : isChatOpen
              ? `Close ${MARGOT_DISPLAY_NAME}`
              : `Open ${MARGOT_DISPLAY_NAME}`
        }
        aria-describedby={ORB_MOVE_HINT_ID}
        title={`${MARGOT_DISPLAY_NAME} — drag to move, or use the arrow keys`}
        aria-expanded={!hasVideo ? isChatOpen : undefined}
      >
        {isChatOpen && !hasVideo ? (
          <span
            className="flex aspect-square items-center justify-center rounded-full text-white"
            style={{
              width: `${size - 8}px`,
              height: `${size - 8}px`,
              background: MARGOT_ACCENT,
            }}
          >
            <X className="h-6 w-6" />
          </span>
        ) : (
          <span
            className="relative flex aspect-square shrink-0 items-center justify-center"
            style={{
              width: `${size - 8}px`,
              height: `${size - 8}px`,
            }}
          >
            {avatarImageUrl === MARGOT_AVATAR_ORB_PATH ? (
              <MargotAvatar size={size - 8} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarImageUrl}
                alt={`${MARGOT_DISPLAY_NAME} avatar`}
                width={size - 8}
                height={size - 8}
                className="aspect-square rounded-full object-cover object-center ring-2 ring-white/40"
                style={{
                  width: `${size - 8}px`,
                  height: `${size - 8}px`,
                  minWidth: `${size - 8}px`,
                  minHeight: `${size - 8}px`,
                }}
                loading="eager"
              />
            )}
            <span
              className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white"
              style={{ background: MARGOT_ACCENT }}
              aria-hidden
            >
              <MessageCircle size={11} />
            </span>
            {!hasPlayed && (
              <span className="absolute -top-1 -right-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-rose-500" />
            )}
          </span>
        )}

        {tooltipVisible && !isChatOpen && (
          <div className="absolute right-0 bottom-full mb-3 w-56 rounded-xl border border-slate-200/90 bg-white p-3 text-left shadow-[0_12px_32px_rgba(15,23,42,0.12)] animate-in fade-in slide-in-from-bottom-2">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {MARGOT_DISPLAY_NAME}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {greetingText}
            </p>
            <div className="absolute right-5 bottom-[-6px] h-3 w-3 rotate-45 border-r border-b border-slate-200/90 bg-white" />
          </div>
        )}
      </button>

      <span id={ORB_MOVE_HINT_ID} className="sr-only">
        Drag to move {MARGOT_DISPLAY_NAME} out of the way, or press the arrow
        keys while she is focused.
      </span>

      {/* Assistant chatbox — Margot surface, same identity as client Chatbot */}
      {isChatOpen && !hasVideo && (
        <div
          className={cn(
            "fixed z-[100] flex h-[min(600px,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4",
            // Default corner until the orb has been moved; after that the panel
            // follows her so the two do not drift apart.
            panelAnchor ? undefined : "right-6 bottom-24",
          )}
          style={
            panelAnchor
              ? { left: panelAnchor.x, top: panelAnchor.y }
              : undefined
          }
          role="dialog"
          aria-label={`${MARGOT_DISPLAY_NAME} assistant`}
        >
          <div className="flex items-center justify-between rounded-t-lg border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex aspect-square h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ border: `2px solid ${MARGOT_ACCENT}44` }}
              >
                <MargotAvatar size={40} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {MARGOT_DISPLAY_NAME}
                </p>
                <p className="text-xs text-slate-600">{MARGOT_ROLE_LABEL}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label={`Close ${MARGOT_DISPLAY_NAME}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "assistant"
                    ? "border border-slate-200 bg-slate-50 text-slate-800"
                    : "ml-auto whitespace-pre-wrap text-white",
                )}
                style={
                  msg.role === "user"
                    ? { background: MARGOT_ACCENT }
                    : undefined
                }
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none text-slate-800 prose-p:my-1.5 prose-p:leading-relaxed prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:font-semibold prose-strong:text-slate-900">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                            {children}
                          </ol>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                            {children}
                          </ul>
                        ),
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-slate-900">
                            {children}
                          </strong>
                        ),
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="font-medium text-brand-navy underline underline-offset-2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}

            {chatMessages.length <= 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendChat(q)}
                    disabled={chatLoading}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Margot is thinking…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat(chatInput);
              }}
            >
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about RestoreAssist…"
                disabled={chatLoading}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
                style={{ background: MARGOT_ACCENT }}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <Link
              href={BRAND.cta.primary.href}
              className="mt-2 block text-center text-xs font-medium hover:opacity-80"
              style={{ color: MARGOT_ACCENT }}
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
