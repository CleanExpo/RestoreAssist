"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import { CATEGORY_VIDEOS } from "@/lib/help/category-videos";
import { VIDEO_REGISTRY } from "@/components/setup/video-registry";

type MarkProps = { className?: string };
function Mark({ className = "h-5 w-5", children }: MarkProps & { children: React.ReactNode }) {
  return <span className={className} aria-hidden="true">{children}</span>;
}

const CATEGORY_ICONS: Record<HelpCategory, React.ReactNode> = {
  "getting-started": <Mark>▤</Mark>,
  inspections: <Mark>▣</Mark>,
  reports: <Mark>▥</Mark>,
  "clients-and-portal": <Mark>◉</Mark>,
  billing: <Mark>▭</Mark>,
  team: <Mark>⊕</Mark>,
  integrations: <Mark>◇</Mark>,
  compliance: <Mark>⬟</Mark>,
};

const CATEGORY_DESCRIPTIONS: Record<HelpCategory, string> = {
  "getting-started": "Signup, setup, first inspection",
  inspections: "Photos, sign-off, claim types",
  reports: "AI-drafted S500 reports, exports",
  "clients-and-portal": "Share reports, manage clients",
  billing: "Plans, upgrades, invoices",
  team: "Invite technicians, licences",
  integrations: "Xero, MYOB, QB, Drive",
  compliance: "IICRC standards, WHS",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function HowToDropdown() {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<HelpCategory | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  // Get videos for active category (or first category as default)
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
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/5 min-h-[44px]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        How To
        <span className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[640px] rounded-lg border border-white/10 bg-brand-surface p-4 shadow-xl shadow-black/50"
        >
          {/* Two-column layout: Categories + Videos */}
          <div className="grid grid-cols-5 gap-4">
            {/* Left: Categories (3 cols) */}
            <div className="col-span-3 grid grid-cols-2 gap-2">
              {HELP_CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/dashboard/help/${cat}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActiveCategory(cat)}
                  className={`flex items-start gap-3 rounded-md p-3 min-h-[44px] transition-colors ${
                    activeCategory === cat ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="text-white/70">{CATEGORY_ICONS[cat]}</div>
                  <div>
                    <div className="text-sm font-medium text-white">{HELP_CATEGORY_LABELS[cat]}</div>
                    <div className="text-xs text-white/60">{CATEGORY_DESCRIPTIONS[cat]}</div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Right: Video walkthroughs (2 cols) */}
            <div className="col-span-2 border-l border-white/10 pl-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-bronze">
                Video Walkthroughs
              </div>
              {categoryVideos.length === 0 ? (
                <p className="text-xs text-white/40">No videos for this category yet.</p>
              ) : (
                <div className="space-y-2">
                  {categoryVideos.slice(0, 4).map((video) => (
                    <Link
                      key={video.slug}
                      href={`/dashboard/learn?video=${video.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-md p-2 hover:bg-white/5 group"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-brand-navy group-hover:bg-brand-bronze/20">
                        <span className="h-3.5 w-3.5 text-brand-bronze group-hover:text-white" aria-hidden="true">▶</span>
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
                  {categoryVideos.length > 4 && (
                    <Link
                      href={`/dashboard/help/${categoryToShow}`}
                      onClick={() => setOpen(false)}
                      className="block text-center text-xs text-brand-gold hover:text-brand-gold-hover pt-1"
                    >
                      +{categoryVideos.length - 4} more videos →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3 text-center">
            <Link
              href="/dashboard/help"
              onClick={() => setOpen(false)}
              className="text-sm text-brand-gold hover:text-brand-gold-hover"
            >
              Browse all articles →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
