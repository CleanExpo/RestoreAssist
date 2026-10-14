"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  PlayCircle,
  Search,
} from "lucide-react";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import { CATEGORY_VIDEOS } from "@/lib/help/category-videos";
import { VIDEO_REGISTRY } from "@/components/setup/video-registry";
import { cn } from "@/lib/utils";

const CATEGORY_DESCRIPTIONS: Record<HelpCategory, string> = {
  "getting-started": "Signup, setup, first inspection",
  inspections: "Photos, sign-off, claim types",
  reports: "AI-drafted S500 reports, exports",
  "clients-and-portal": "Share reports, manage clients",
  billing: "Plans, upgrades, invoices",
  team: "Invite technicians, licences",
  integrations: "Xero, Ascora, Drive",
  compliance: "IICRC standards, WHS",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function openHelpSearch() {
  window.dispatchEvent(new CustomEvent("open-help-search"));
}

export default function HowToDropdown() {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<HelpCategory | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onEscape);
      return () => {
        document.removeEventListener("mousedown", onClickOutside);
        document.removeEventListener("keydown", onEscape);
      };
    }
  }, [open]);

  const categoryToShow = activeCategory ?? HELP_CATEGORIES[0];
  const categoryVideoSlugs = CATEGORY_VIDEOS[categoryToShow] ?? [];
  const categoryVideos = categoryVideoSlugs
    .map((slug) => ({ slug, ...VIDEO_REGISTRY[slug] }))
    .filter((v) => v.title);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition sm:gap-2 sm:px-3",
          open
            ? "bg-white/12 text-white"
            : "text-slate-200 hover:bg-white/10 hover:text-white",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Help menu"
      >
        <HelpCircle className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        <span className="hidden sm:inline">Help</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-70 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(640px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-4 shadow-2xl shadow-black/50"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <p className="text-sm font-semibold text-white">How to &amp; guides</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openHelpSearch();
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-cyan-200 hover:bg-white/10"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              Search
              <kbd className="rounded border border-white/20 px-1 text-[10px]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {HELP_CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/dashboard/help/${cat}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActiveCategory(cat)}
                  onFocus={() => setActiveCategory(cat)}
                  className={cn(
                    "flex min-h-[44px] items-start gap-3 rounded-lg p-3 transition-colors",
                    activeCategory === cat
                      ? "bg-cyan-500/15 ring-1 ring-cyan-400/25"
                      : "hover:bg-white/5",
                  )}
                >
                  <BookOpen
                    className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/80"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">
                      {HELP_CATEGORY_LABELS[cat]}
                    </div>
                    <div className="text-xs text-white/55">
                      {CATEGORY_DESCRIPTIONS[cat]}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="border-white/10 lg:col-span-2 lg:border-l lg:pl-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                Video walkthroughs
              </div>
              {categoryVideos.length === 0 ? (
                <p className="text-xs text-white/45">No videos for this category yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {categoryVideos.slice(0, 4).map((video) => (
                    <Link
                      key={video.slug}
                      href={`/dashboard/learn?video=${video.slug}`}
                      onClick={() => setOpen(false)}
                      className="group flex items-center gap-2 rounded-lg p-2 hover:bg-white/5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 group-hover:bg-cyan-500/20">
                        <PlayCircle
                          className="h-4 w-4 text-cyan-300 group-hover:text-white"
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-white/90 group-hover:text-white">
                          {video.title}
                        </div>
                        <div className="text-[10px] text-white/50">
                          {formatDuration(video.durationSec)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <Link
              href="/dashboard/help/contact"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-white/70 hover:text-white"
            >
              Contact support
            </Link>
            <Link
              href="/dashboard/help"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              Browse all articles →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
